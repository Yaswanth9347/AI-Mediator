/**
 * Case Profile Service
 * 
 * Extracts structured data from disputes using AI:
 * - Category classification
 * - Monetary value extraction
 * - Timeline of events
 * - Key issues identification
 * - Party positions summary
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { Dispute, Message } from '../models/index.js';
import { logInfo, logError } from './logger.js';

const API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || 'API_KEY_MISSING';
const genAI = new GoogleGenerativeAI(API_KEY);

/**
 * Extract structured case profile from dispute data
 * @param {Object} dispute - The dispute object
 * @param {Array} messages - Array of messages in the dispute
 * @returns {Object} Extracted case profile
 */
export async function extractCaseProfile(dispute, messages = []) {
    if (API_KEY === 'API_KEY_MISSING') {
        logInfo('Case Profile: Skipped (API key missing)');
        return null;
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // Build conversation context
        const conversationText = messages.map(m => {
            const role = m.senderId === dispute.creatorId ? 'PLAINTIFF' : 'DEFENDANT';
            return `${role}: ${m.content}`;
        }).join('\n');

        const prompt = `You are a legal case analyst. Analyze the following dispute and extract structured information.

DISPUTE INFORMATION:
- Title: ${dispute.title}
- Initial Complaint: ${dispute.description}
- Plaintiff: ${dispute.plaintiffName} (${dispute.plaintiffOccupation || 'occupation not specified'})
- Defendant: ${dispute.respondentName} (${dispute.respondentOccupation || 'occupation not specified'})
${dispute.defendantStatement ? `- Defendant's Response: ${dispute.defendantStatement}` : ''}

CONVERSATION HISTORY:
${conversationText || 'No messages yet'}

EXTRACT THE FOLLOWING (respond in strict JSON format):

{
    "category": "string - one of: 'consumer', 'property', 'contract', 'employment', 'financial', 'harassment', 'defamation', 'other'",
    "categoryConfidence": "number 0-1 - how confident you are in the category",
    "monetaryAmount": "number or null - if there's a monetary claim, extract the amount in INR",
    "monetaryCurrency": "string - default 'INR'",
    "severity": "string - one of: 'low', 'medium', 'high', 'critical' based on nature and impact",
    "severityReason": "string - brief explanation for severity rating",
    "timeline": [
        {"date": "YYYY-MM-DD or 'approximate'", "event": "string", "description": "string"}
    ],
    "keyIssues": ["string - main issue 1", "string - main issue 2", "...up to 5 key issues"],
    "partiesAnalysis": {
        "plaintiff": {
            "position": "string - what the plaintiff is claiming/seeking",
            "claims": ["string - specific claim 1", "string - specific claim 2"],
            "emotionalState": "string - calm/frustrated/angry/distressed"
        },
        "defendant": {
            "position": "string - what the defendant argues",
            "claims": ["string - specific defense 1", "string - specific defense 2"],
            "emotionalState": "string - calm/defensive/apologetic/dismissive"
        }
    },
    "suggestedApproach": "string - brief suggestion on mediation approach based on category and severity"
}

IMPORTANT:
- Extract actual monetary amounts mentioned (e.g., "Rs. 50,000" → 50000)
- Identify real dates or approximate time references
- Be specific about key issues, not generic
- Base severity on potential harm, not just monetary value
- If information is not available, use null or empty arrays`;

        logInfo('Case Profile: Extracting profile for dispute', { disputeId: dispute.id });

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // Parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            logError('Case Profile: No JSON found in response');
            return null;
        }

        const profile = JSON.parse(jsonMatch[0]);
        logInfo('Case Profile: Successfully extracted', {
            disputeId: dispute.id,
            category: profile.category,
            severity: profile.severity
        });

        return profile;

    } catch (error) {
        logError('Case Profile: Extraction failed', {
            disputeId: dispute.id,
            error: error.message
        });
        return null;
    }
}

/**
 * Update dispute with extracted case profile
 * @param {number} disputeId - The dispute ID
 * @returns {Object} Updated dispute or null on failure
 */
export async function updateCaseProfile(disputeId) {
    try {
        const dispute = await Dispute.findByPk(disputeId);
        if (!dispute) {
            logError('Case Profile: Dispute not found', { disputeId });
            return null;
        }

        const messages = await Message.findAll({
            where: { disputeId },
            order: [['createdAt', 'ASC']]
        });

        const profile = await extractCaseProfile(dispute, messages);
        if (!profile) {
            return null;
        }

        // Update dispute with extracted profile
        await dispute.update({
            category: profile.category || 'other',
            monetaryAmount: profile.monetaryAmount,
            monetaryCurrency: profile.monetaryCurrency || 'INR',
            timeline: profile.timeline || [],
            severity: profile.severity || 'medium',
            keyIssues: profile.keyIssues || [],
            partiesAnalysis: profile.partiesAnalysis || {},
            caseProfileGenerated: true,
            caseProfileGeneratedAt: new Date(),
            caseProfileVersion: (dispute.caseProfileVersion || 0) + 1
        });

        logInfo('Case Profile: Updated dispute', {
            disputeId,
            category: profile.category,
            version: dispute.caseProfileVersion + 1
        });

        return dispute;

    } catch (error) {
        logError('Case Profile: Update failed', { disputeId, error: error.message });
        return null;
    }
}

/**
 * Get case profile for a dispute (generate if not exists)
 * @param {number} disputeId - The dispute ID
 * @param {boolean} forceRegenerate - Force regeneration even if exists
 * @returns {Object} Case profile data
 */
export async function getCaseProfile(disputeId, forceRegenerate = false) {
    try {
        const dispute = await Dispute.findByPk(disputeId);
        if (!dispute) {
            return null;
        }

        // Return existing profile if available and not forcing regeneration
        if (dispute.caseProfileGenerated && !forceRegenerate) {
            return {
                category: dispute.category,
                monetaryAmount: dispute.monetaryAmount,
                monetaryCurrency: dispute.monetaryCurrency,
                timeline: dispute.timeline,
                severity: dispute.severity,
                keyIssues: dispute.keyIssues,
                partiesAnalysis: dispute.partiesAnalysis,
                generatedAt: dispute.caseProfileGeneratedAt,
                version: dispute.caseProfileVersion
            };
        }

        // Generate new profile
        await updateCaseProfile(disputeId);

        // Fetch updated dispute
        await dispute.reload();

        return {
            category: dispute.category,
            monetaryAmount: dispute.monetaryAmount,
            monetaryCurrency: dispute.monetaryCurrency,
            timeline: dispute.timeline,
            severity: dispute.severity,
            keyIssues: dispute.keyIssues,
            partiesAnalysis: dispute.partiesAnalysis,
            generatedAt: dispute.caseProfileGeneratedAt,
            version: dispute.caseProfileVersion
        };

    } catch (error) {
        logError('Case Profile: Get failed', { disputeId, error: error.message });
        return null;
    }
}

export default {
    extractCaseProfile,
    updateCaseProfile,
    getCaseProfile
};
