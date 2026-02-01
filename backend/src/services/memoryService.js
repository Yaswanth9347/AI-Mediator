/**
 * Memory Service
 * 
 * Manages conversation memory through summarization:
 * - Automatically summarizes conversations after N messages
 * - Maintains context across long dispute discussions
 * - Provides efficient context for AI analysis
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { Message, ConversationSummary, Dispute } from '../models/index.js';
import { logInfo, logError } from './logger.js';

const API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || 'API_KEY_MISSING';
const genAI = new GoogleGenerativeAI(API_KEY);

// Configuration
const SUMMARY_TRIGGER_COUNT = 10; // Summarize every 10 new messages
const MAX_RECENT_MESSAGES = 5;    // Keep last 5 messages in full detail

/**
 * Summarize a batch of messages
 * @param {Object} dispute - The dispute object
 * @param {Array} messages - Array of messages to summarize
 * @returns {Object} Summary object
 */
export async function summarizeMessages(dispute, messages) {
    if (API_KEY === 'API_KEY_MISSING' || messages.length === 0) {
        return null;
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const messageText = messages.map(m => {
            const role = m.senderId === dispute.creatorId ? 'PLAINTIFF' : 'DEFENDANT';
            const name = m.senderId === dispute.creatorId ? dispute.plaintiffName : dispute.respondentName;
            return `[${role}] ${name}: ${m.content}`;
        }).join('\n\n');

        const prompt = `You are summarizing a conversation in a dispute resolution context.

DISPUTE: "${dispute.title}"
PLAINTIFF: ${dispute.plaintiffName}
DEFENDANT: ${dispute.respondentName}

CONVERSATION TO SUMMARIZE (${messages.length} messages):
${messageText}

Provide a structured summary in JSON format:
{
    "summary": "A comprehensive 2-3 paragraph summary of the key discussion points",
    "keyPoints": [
        "Key point 1 - most important takeaway",
        "Key point 2",
        "Key point 3",
        "... up to 5 key points"
    ],
    "agreements": ["Any points both parties agreed on"],
    "disagreements": ["Any points of contention"],
    "tone": "One of: cooperative, adversarial, neutral, improving, mixed",
    "progress": "Brief assessment of whether resolution seems closer or further"
}

Focus on:
- Factual claims made by each party
- Evidence or documents mentioned
- Offers or proposals made
- Emotional tone and receptiveness
- Any progress toward resolution`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // Parse JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            logError('Memory Service: No JSON in summary response');
            return null;
        }

        const parsed = JSON.parse(jsonMatch[0]);

        logInfo('Memory Service: Generated summary', {
            disputeId: dispute.id,
            messageCount: messages.length,
            keyPointsCount: parsed.keyPoints?.length || 0
        });

        return parsed;

    } catch (error) {
        logError('Memory Service: Summarization failed', {
            disputeId: dispute.id,
            error: error.message
        });
        return null;
    }
}

/**
 * Check if summary is needed and create if so
 * @param {number} disputeId - The dispute ID
 * @returns {boolean} Whether a new summary was created
 */
export async function checkAndUpdateSummary(disputeId) {
    try {
        const dispute = await Dispute.findByPk(disputeId);
        if (!dispute) return false;

        // Get latest summary
        const latestSummary = await ConversationSummary.findOne({
            where: { disputeId },
            order: [['createdAt', 'DESC']]
        });

        // Get message count since last summary
        const lastMessageId = latestSummary?.messagesTo || 0;

        const newMessages = await Message.findAll({
            where: {
                disputeId,
                id: { [require('sequelize').Op.gt]: lastMessageId }
            },
            order: [['createdAt', 'ASC']]
        });

        // Check if we need to summarize
        if (newMessages.length < SUMMARY_TRIGGER_COUNT) {
            return false;
        }

        logInfo('Memory Service: Triggering summary', {
            disputeId,
            newMessageCount: newMessages.length
        });

        // Generate summary
        const summaryData = await summarizeMessages(dispute, newMessages);
        if (!summaryData) return false;

        // Save summary
        await ConversationSummary.create({
            disputeId,
            summaryType: 'incremental',
            content: summaryData.summary,
            messagesFrom: newMessages[0].id,
            messagesTo: newMessages[newMessages.length - 1].id,
            messageCount: newMessages.length,
            keyPoints: summaryData.keyPoints || [],
            overallTone: summaryData.tone || 'neutral',
            version: (latestSummary?.version || 0) + 1
        });

        logInfo('Memory Service: Summary saved', { disputeId });
        return true;

    } catch (error) {
        logError('Memory Service: Check and update failed', {
            disputeId,
            error: error.message
        });
        return false;
    }
}

/**
 * Get full conversation context for AI analysis
 * Combines summaries + recent messages
 * @param {number} disputeId - The dispute ID
 * @returns {Object} Context object with summaries and recent messages
 */
export async function getConversationContext(disputeId) {
    try {
        const dispute = await Dispute.findByPk(disputeId);
        if (!dispute) return null;

        // Get all summaries
        const summaries = await ConversationSummary.findAll({
            where: { disputeId },
            order: [['createdAt', 'ASC']]
        });

        // Get recent messages (not yet summarized)
        const lastSummary = summaries[summaries.length - 1];
        const lastMessageId = lastSummary?.messagesTo || 0;

        const recentMessages = await Message.findAll({
            where: {
                disputeId,
                id: { [require('sequelize').Op.gt]: lastMessageId }
            },
            order: [['createdAt', 'DESC']],
            limit: MAX_RECENT_MESSAGES * 2 // Get more in case we need them
        });

        // Build context
        let contextText = '';

        if (summaries.length > 0) {
            contextText += '=== CONVERSATION HISTORY SUMMARY ===\n\n';

            summaries.forEach((s, i) => {
                contextText += `[Summary ${i + 1} - ${s.messageCount} messages]\n`;
                contextText += s.content + '\n';
                if (s.keyPoints?.length > 0) {
                    contextText += 'Key Points:\n';
                    s.keyPoints.forEach(p => contextText += `• ${p}\n`);
                }
                contextText += '\n';
            });
        }

        // Add recent messages in full
        if (recentMessages.length > 0) {
            contextText += '=== RECENT MESSAGES (Full Detail) ===\n\n';

            // Reverse to get chronological order
            recentMessages.reverse().forEach(m => {
                const role = m.senderId === dispute.creatorId ? 'PLAINTIFF' : 'DEFENDANT';
                const name = m.senderId === dispute.creatorId ? dispute.plaintiffName : dispute.respondentName;
                contextText += `[${role}] ${name}: ${m.content}\n\n`;
            });
        }

        return {
            summaryCount: summaries.length,
            recentMessageCount: recentMessages.length,
            totalMessagesSummarized: summaries.reduce((acc, s) => acc + (s.messageCount || 0), 0),
            latestTone: lastSummary?.overallTone || 'unknown',
            contextText,
            keyPointsCompiled: summaries.flatMap(s => s.keyPoints || [])
        };

    } catch (error) {
        logError('Memory Service: Get context failed', {
            disputeId,
            error: error.message
        });
        return null;
    }
}

/**
 * Generate a full consolidated summary of entire dispute
 * @param {number} disputeId - The dispute ID
 * @returns {Object} Full summary object
 */
export async function generateFullSummary(disputeId) {
    try {
        const dispute = await Dispute.findByPk(disputeId);
        if (!dispute) return null;

        const allMessages = await Message.findAll({
            where: { disputeId },
            order: [['createdAt', 'ASC']]
        });

        if (allMessages.length === 0) {
            return {
                summary: 'No conversation has taken place yet.',
                keyPoints: [],
                tone: 'neutral'
            };
        }

        const summaryData = await summarizeMessages(dispute, allMessages);

        if (summaryData) {
            // Save as full summary
            await ConversationSummary.create({
                disputeId,
                summaryType: 'full',
                content: summaryData.summary,
                messagesFrom: allMessages[0].id,
                messagesTo: allMessages[allMessages.length - 1].id,
                messageCount: allMessages.length,
                keyPoints: summaryData.keyPoints || [],
                overallTone: summaryData.tone || 'neutral'
            });
        }

        return summaryData;

    } catch (error) {
        logError('Memory Service: Full summary failed', {
            disputeId,
            error: error.message
        });
        return null;
    }
}

export default {
    summarizeMessages,
    checkAndUpdateSummary,
    getConversationContext,
    generateFullSummary,
    SUMMARY_TRIGGER_COUNT,
    MAX_RECENT_MESSAGES
};
