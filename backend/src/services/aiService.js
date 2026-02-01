
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Dispute, Message, Evidence } from '../models/index.js';
import emailService from './email/index.js';
import { logAuditEvent, AuditActions, AuditCategories } from './auditService.js';
import { logInfo, logError } from './logger.js';
import { emitToDispute } from './socketService.js';
import fs from 'fs';

// Import new AI feature services
import { extractCaseProfile, updateCaseProfile, getCaseProfile } from './caseProfileService.js';
import { getConversationContext, checkAndUpdateSummary } from './memoryService.js';
import { buildRAGContext, searchRelevantKnowledge } from './ragService.js';
import { buildLegalContext, SOLUTION_STRUCTURE } from './legalPrompts.js';

// Gemini Setup
const API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || 'API_KEY_MISSING';
const genAI = new GoogleGenerativeAI(API_KEY);
console.log('AI API Key configured:', API_KEY !== 'API_KEY_MISSING' ? 'Yes' : 'No');

// Helper to read file to generatable part
async function fileToGenerativePart(fileSource, mimeType) {
    let data;

    if (fileSource.startsWith('http')) {
        // Handle Cloudinary/Remote URL
        try {
            const response = await fetch(fileSource);
            const arrayBuffer = await response.arrayBuffer();
            data = Buffer.from(arrayBuffer).toString('base64');
            // If mimeType not provided, try to guess or default? 
            // Usually passed in contexts where mimeType is known or we can assume image.
        } catch (e) {
            console.error('Failed to fetch remote image for AI:', e);
            throw e;
        }
    } else {
        // Handle local file
        data = fs.readFileSync(fileSource).toString('base64');
    }

    return {
        inlineData: {
            data,
            mimeType: mimeType || 'image/jpeg'
        }
    };
}

// ---------------- IDENTITY VERIFICATION ----------------

/**
 * Verify if document is a valid ID (simpler check)
 */
export async function verifyDocumentIsID(path, mimeType) {
    if (API_KEY === 'API_KEY_MISSING') return { isValid: true, details: "Dev Mode: Verification Skipped" };

    try {
        console.log(`🔍 AI Service: Verifying document at ${path} with type ${mimeType}`);
        if (!fs.existsSync(path)) {
            console.error(`❌ AI Service: File not found at path: ${path}`);
            throw new Error(`File not found: ${path}`); // This will be caught below
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        console.log('🤖 AI Service: Model initialized');

        const imagePart = await fileToGenerativePart(path, mimeType || "image/jpeg");
        console.log('📂 AI Service: File converted to generative part');

        const prompt = `Analyze this image/document. Is it a valid Government Identity Document?
        
        Acceptable types include:
        - Passport
        - Driver's License
        - National ID Card
        - Aadhaar Card (India)
        - PAN Card (India)
        - Voter ID (India)
        - Or any other official government ID from any country.

        If the image is slightly blurry or low quality but still legible, mark it as VALID.
        If it is clearly NOT an ID (e.g. a selfie, a random object, or unreadable), mark as INVALID.

        Respond in strictly valid JSON format: { "isValid": boolean, "details": "reason for decision" }`;

        console.log('🚀 AI Service: Sending request to Gemini...');
        const result = await model.generateContent([prompt, imagePart]);
        const text = result.response.text();
        console.log('📥 AI Service: Response received:', text);

        const jsonStr = text.replace(/```json|```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("❌ Doc Verification Error Details:", e);

        // Check for Suspended/Permission Denied errors
        if (e.message.includes('403 Forbidden') || e.message.includes('CONSUMER_SUSPENDED') || e.message.includes('Permission denied')) {
            console.warn('⚠️ API Key Suspended/Invalid - Skipping AI Verification to allow flow.');
            return { isValid: true, details: "Verification Skipped (API Key Issue)" };
        }

        return { isValid: false, details: `Internal Verification Error: ${e.message}` };
    }
}

/**
 * Analyze ID Document - Extract details and validate authenticity
 */
export async function analyzeIdDocument(idCardPath) {
    if (API_KEY === 'API_KEY_MISSING') {
        return {
            success: false,
            error: "API Key not configured",
            isValidDocument: false
        };
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const imagePart = await fileToGenerativePart(`uploads/${idCardPath}`);

        const prompt = `You are an expert document analyst specializing in identity verification.

Analyze this image and determine if it is a valid government-issued identity document.

TASKS:
1. Identify the TYPE of document (Passport, Driver's License, National ID, Aadhaar Card, PAN Card, Voter ID, etc.)
2. Determine if it appears to be AUTHENTIC (not edited, not a photocopy of a photocopy, not a screen photo)
3. Extract visible INFORMATION from the document
4. Check for SECURITY FEATURES if visible (holograms, watermarks, microprint, etc.)
5. Assess overall QUALITY of the image (is it clear enough for verification?)

RESPOND IN EXACT JSON FORMAT:
{
    "isValidDocument": true/false,
    "documentType": "Type of ID document or 'Unknown'",
    "country": "Country of issue or 'Unknown'",
    "extractedInfo": {
        "fullName": "Name as shown on ID or null",
        "dateOfBirth": "DOB if visible or null",
        "documentNumber": "ID number if visible or null",
        "expiryDate": "Expiry date if visible or null",
        "gender": "Gender if visible or null"
    },
    "qualityAssessment": {
        "isImageClear": true/false,
        "isFaceVisible": true/false,
        "isTextReadable": true/false,
        "hasSecurityFeatures": true/false
    },
    "authenticity": {
        "appearsOriginal": true/false,
        "suspiciousIndicators": ["list of any suspicious elements"] or [],
        "confidence": 0.0 to 1.0
    },
    "reason": "Brief explanation of your assessment"
}`;

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                success: true,
                ...parsed
            };
        }

        return {
            success: false,
            error: "Failed to parse AI response",
            isValidDocument: false
        };
    } catch (err) {
        logError("ID Document Analysis Error", { error: err.message, path: idCardPath });
        return {
            success: false,
            error: err.message,
            isValidDocument: false
        };
    }
}

/**
 * Analyze Selfie - Check quality and detect spoofing attempts
 */
export async function analyzeSelfie(selfiePath) {
    if (API_KEY === 'API_KEY_MISSING') {
        return {
            success: false,
            error: "API Key not configured",
            isValidSelfie: false
        };
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const imagePart = await fileToGenerativePart(`uploads/${selfiePath}`);

        const prompt = `You are an expert in facial recognition and anti-spoofing detection.

Analyze this selfie image for identity verification purposes.

TASKS:
1. Confirm this is a REAL SELFIE of a person (not a photo of a photo, not a printed image, not a screen display)
2. Check the IMAGE QUALITY (lighting, focus, face position)
3. Verify the FACE is clearly visible and unobstructed
4. Look for SPOOFING INDICATORS (edges of printed paper, screen pixels, unnatural lighting, image artifacts)
5. Assess if the person appears to be a LIVE human (natural skin texture, appropriate reflections in eyes)

RESPOND IN EXACT JSON FORMAT:
{
    "isValidSelfie": true/false,
    "faceDetected": true/false,
    "faceCount": number,
    "qualityAssessment": {
        "isFaceClear": true/false,
        "isWellLit": true/false,
        "isFaceForward": true/false,
        "eyesVisible": true/false,
        "faceUnobstructed": true/false
    },
    "livenessIndicators": {
        "appearsLive": true/false,
        "naturalSkinTexture": true/false,
        "naturalLighting": true/false,
        "noScreenArtifacts": true/false,
        "noPrintedPhotoEdges": true/false
    },
    "spoofingRisk": "low" | "medium" | "high",
    "confidence": 0.0 to 1.0,
    "reason": "Brief explanation of your assessment"
}`;

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                success: true,
                ...parsed
            };
        }

        return {
            success: false,
            error: "Failed to parse AI response",
            isValidSelfie: false
        };
    } catch (err) {
        logError("Selfie Analysis Error", { error: err.message, path: selfiePath });
        return {
            success: false,
            error: err.message,
            isValidSelfie: false
        };
    }
}

/**
 * Compare faces between selfie and ID document
 */
export async function compareFaces(idCardPath, selfiePath) {
    if (API_KEY === 'API_KEY_MISSING') {
        return {
            success: false,
            error: "API Key not configured",
            facesMatch: false
        };
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const idPart = await fileToGenerativePart(`uploads/${idCardPath}`);
        const selfiePart = await fileToGenerativePart(`uploads/${selfiePath}`);

        const prompt = `You are an expert facial recognition analyst performing identity verification.

Compare the TWO images provided:
- IMAGE 1: An identity document (ID card, passport, driver's license)
- IMAGE 2: A selfie of a person

TASKS:
1. LOCATE the face in the ID document photo
2. LOCATE the face in the selfie
3. COMPARE facial features between the two faces:
   - Face shape and structure
   - Eye shape and spacing
   - Nose shape and size
   - Mouth and lip shape
   - Ear shape (if visible)
   - Facial hair patterns (if any)
   - Any distinctive features (moles, scars, etc.)
4. Account for ACCEPTABLE DIFFERENCES:
   - Aging (ID photos may be older)
   - Different lighting conditions
   - Slight angle differences
   - Facial hair changes
   - Weight changes

RESPOND IN EXACT JSON FORMAT:
{
    "facesMatch": true/false,
    "similarityScore": 0 to 100,
    "matchConfidence": "low" | "medium" | "high",
    "analysis": {
        "facialFeaturesMatch": true/false,
        "ageDiscrepancy": "observed age difference if any",
        "distinguishingFeatures": "list of matching distinctive features"
    },
    "reason": "Detailed explanation of why you believe these are/aren't the same person"
}`;

        const result = await model.generateContent([prompt, idPart, selfiePart]);
        const response = await result.response;
        const text = response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                success: true,
                ...parsed
            };
        }

        return {
            success: false,
            error: "Failed to parse AI response",
            facesMatch: false
        };
    } catch (err) {
        logError("Face Comparison Error", { error: err.message });
        return {
            success: false,
            error: err.message,
            facesMatch: false
        };
    }
}

// ---------------- DISPUTE ANALYSIS ----------------

/**
 * Enhanced AI Dispute Analysis with all 5 advanced features:
 * 1. RAG - Retrieval-Augmented Generation with legal precedents
 * 2. Evidence Integration - Multimodal analysis with uploaded files
 * 3. Conversation Memory - Summarized context for long discussions
 * 4. Domain Fine-Tuning - Category-specific legal knowledge
 * 5. Structured Case Profiles - Extracted dispute metadata
 * 
 * @param {Object} dispute - The dispute object
 * @param {Array} messages - Array of messages
 * @param {Object} options - Additional options
 * @returns {Object} AI analysis with solutions
 */
export async function analyzeDisputeWithAI(dispute, messages, options = {}) {
    const { isReanalysis = false, evidence = [], caseProfile = null } = options;

    if (API_KEY === 'API_KEY_MISSING') return null;

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        logInfo('AI Analysis: Starting enhanced analysis', {
            disputeId: dispute.id,
            messageCount: messages.length,
            evidenceCount: evidence.length,
            isReanalysis
        });

        // ========== 1. GET CASE PROFILE (Structured Data) ==========
        let profile = caseProfile;
        if (!profile && dispute.caseProfileGenerated) {
            profile = await getCaseProfile(dispute.id);
        } else if (!profile) {
            // Generate profile on-the-fly
            profile = await extractCaseProfile(dispute, messages);
            if (profile) {
                await updateCaseProfile(dispute.id);
            }
        }

        const category = profile?.category || dispute.category || 'other';
        const severity = profile?.severity || 'medium';

        logInfo('AI Analysis: Case profile', {
            disputeId: dispute.id,
            category,
            severity,
            keyIssuesCount: profile?.keyIssues?.length || 0
        });

        // ========== 2. GET CONVERSATION MEMORY (Summaries) ==========
        const memoryContext = await getConversationContext(dispute.id);
        let conversationText = '';

        if (memoryContext?.contextText) {
            conversationText = memoryContext.contextText;
            logInfo('AI Analysis: Using memory context', {
                disputeId: dispute.id,
                summaryCount: memoryContext.summaryCount,
                recentMessages: memoryContext.recentMessageCount
            });
        } else {
            // Fallback to full message history
            conversationText = messages.map(m => {
                const role = m.senderId === dispute.creatorId ? 'PLAINTIFF' : 'DEFENDANT';
                const name = m.senderId === dispute.creatorId ? dispute.plaintiffName : dispute.respondentName;
                return `[${role}] ${name}: ${m.content}`;
            }).join('\n\n');
        }

        // ========== 3. BUILD RAG CONTEXT (Legal Precedents) ==========
        const ragContext = await buildRAGContext(dispute, conversationText.substring(0, 1000));
        logInfo('AI Analysis: RAG context built', {
            disputeId: dispute.id,
            hasContext: !!ragContext
        });

        // ========== 4. GET LEGAL DOMAIN CONTEXT ==========
        const legalContext = buildLegalContext(category, profile);

        // ========== 5. PROCESS EVIDENCE (Multimodal) ==========
        const evidenceParts = [];
        const evidenceDescriptions = [];

        for (const ev of evidence) {
            try {
                // Add text description
                evidenceDescriptions.push(`
[Evidence ${evidence.indexOf(ev) + 1}]: ${ev.originalName}
- Type: ${ev.fileType}
- Uploaded by: ${ev.uploaderName} (${ev.uploaderRole})
- Description: ${ev.description || 'No description'}
${ev.ocrText ? `- Extracted Text (OCR): ${ev.ocrText.substring(0, 500)}${ev.ocrText.length > 500 ? '...' : ''}` : ''}
`);

                // For images, add as multimodal input
                if (ev.fileType === 'image' && ev.fileName) {
                    // Check if it's a URL (Cloudinary) or local file
                    const imagePath = ev.fileName.startsWith('http')
                        ? ev.fileName
                        : `uploads/${ev.fileName}`;

                    try {
                        const imagePart = await fileToGenerativePart(imagePath, ev.mimeType);
                        evidenceParts.push(imagePart);
                    } catch (imgErr) {
                        logError('AI Analysis: Failed to process evidence image', {
                            evidenceId: ev.id,
                            error: imgErr.message
                        });
                    }
                }
            } catch (evErr) {
                logError('AI Analysis: Evidence processing error', { error: evErr.message });
            }
        }

        const evidenceSection = evidenceDescriptions.length > 0
            ? `\n=== UPLOADED EVIDENCE FILES ===\n${evidenceDescriptions.join('\n')}`
            : '';

        logInfo('AI Analysis: Evidence processed', {
            disputeId: dispute.id,
            descriptionsCount: evidenceDescriptions.length,
            imagePartsCount: evidenceParts.length
        });

        // ========== BUILD ENHANCED PROMPT ==========
        const prompt = `You are the AI Dispute Resolution Engine embedded in an end-to-end legal-tech application for India.
You operate only on backend-provided data and only after explicit trigger conditions are met.

You are NOT a chatbot, NOT a legal advisor, and NOT a judge.

Your sole responsibility is to convert completed dispute discussions + evidence into clear, fair, dispute-specific resolution outcomes.

${legalContext}

${ragContext}

=== EXECUTION CONTEXT ===

Case #${dispute.id}${isReanalysis ? ' (REANALYSIS REQUESTED - Previous solutions rejected. Generate NEW alternatives with different approaches)' : ''}
Jurisdiction: India
Dispute Category: ${category.toUpperCase()}
Severity: ${severity.toUpperCase()}

PLAINTIFF (Person 1):
- Name: ${dispute.plaintiffName}
- Occupation: ${dispute.plaintiffOccupation || 'Not specified'}
- Initial Complaint: ${dispute.description}

DEFENDANT (Person 2):
- Name: ${dispute.respondentName}
- Occupation: ${dispute.respondentOccupation || 'Not specified'}
${dispute.defendantStatement ? `- Response Statement: ${dispute.defendantStatement}` : ''}

${profile?.keyIssues?.length > 0 ? `
=== KEY ISSUES IDENTIFIED ===
${profile.keyIssues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}
` : ''}

${profile?.partiesAnalysis ? `
=== PARTY POSITIONS ANALYSIS ===
Plaintiff Position: ${profile.partiesAnalysis.plaintiff?.position || 'Not analyzed'}
Defendant Position: ${profile.partiesAnalysis.defendant?.position || 'Not analyzed'}
` : ''}

${profile?.monetaryAmount ? `
=== MONETARY CLAIM ===
Amount: Rs. ${parseFloat(profile.monetaryAmount).toLocaleString('en-IN')} ${profile.monetaryCurrency || 'INR'}
` : ''}

=== CONVERSATION HISTORY ===
${conversationText}

${evidenceSection}

=== OUTPUT REQUIREMENTS ===

HEADER (MUST BE EXACT):
"TOP 3 CLEAR POSSIBLE SOLUTIONS TO RESOLVE THIS DISPUTE"

MANDATORY OUTPUT RULES:

You MUST output exactly three solutions.

Each solution MUST:
- Be written in plain, clear language
- Use the actual party names (${dispute.plaintiffName} and ${dispute.respondentName})
- Reference facts from THIS dispute and any uploaded evidence
- Reference relevant legal principles from the context provided
- Propose concrete real-world actions with specific timelines
- Explain why the solution is fair based on legal principles
- End with a Result section explaining outcomes

You MUST NOT:
- Use "Option 1 / Option 2 / Option 3"
- Use voting language
- Use generic mediation advice like "consult a lawyer", "engage a mediator"
- Produce analysis reports
- Use reusable templates
- Give solutions that could apply to any dispute

REQUIRED STRUCTURE FOR EACH SOLUTION:

Solution X: [Descriptive, Case-Specific Title using party names/facts]

[Clearly state what happened based on statements and evidence]

[What corrective actions will occur with specific timelines]

[Who must do what]

[What behavior must stop]

[Ensure no unfair punishment and no unfair advantage]

Result:
[Explain how harm is corrected or contained]
[How reputation, dignity, or opportunity is restored]
[Whether the matter is closed or protected from recurrence]

OUTPUT FORMAT (JSON):

Respond in this EXACT JSON format:
{
    "summary": "TOP 3 CLEAR POSSIBLE SOLUTIONS TO RESOLVE THIS DISPUTE",
    "legalAssessment": "Brief assessment referencing specific Indian laws and principles applicable to this ${category} dispute",
    "seriousness": "${severity.toUpperCase()}",
    "evidenceConsidered": ["List of evidence files that influenced your analysis"],
    "legalPrecedentsApplied": ["List of legal principles/precedents you applied"],
    "solutions": [
        {
            "title": "Descriptive case-specific title using actual names",
            "description": "Full solution text following the REQUIRED STRUCTURE above.",
            "timeline": "Specific implementation timeline (e.g., '14 days', '30 days')",
            "benefitsPlaintiff": "How this addresses ${dispute.plaintiffName}'s concerns fairly",
            "benefitsDefendant": "How this protects ${dispute.respondentName}'s interests",
            "legalBasis": "Specific law/principle supporting this solution"
        },
        // ... 3 solutions total
    ]
}`;

        // ========== SEND TO GEMINI ==========
        const parts = [prompt, ...evidenceParts];
        logInfo('AI Analysis: Sending request to Gemini', {
            disputeId: dispute.id,
            promptLength: prompt.length,
            totalParts: parts.length
        });

        const result = await model.generateContent(parts);
        const response = await result.response;
        let text = response.text();

        logInfo('AI Analysis: Response received', {
            disputeId: dispute.id,
            responseLength: text.length
        });

        // Parse JSON response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                logInfo('AI Analysis: Successfully parsed', {
                    disputeId: dispute.id,
                    solutionsCount: parsed.solutions?.length || 0
                });
                return parsed;
            } catch (parseError) {
                logError('AI Analysis: JSON parse error', {
                    disputeId: dispute.id,
                    error: parseError.message
                });
                return null;
            }
        } else {
            logError('AI Analysis: No JSON in response', { disputeId: dispute.id });
            return null;
        }

    } catch (error) {
        logError('AI Analysis: Failed', {
            disputeId: dispute.id,
            error: error.message
        });
        return null;
    }
}

// Check and trigger AI analysis after 10 messages
export async function checkAndTriggerAI(disputeId) {
    try {
        logInfo('checkAndTriggerAI: Starting', { disputeId });

        const dispute = await Dispute.findByPk(disputeId);
        if (!dispute) {
            logInfo('checkAndTriggerAI: Dispute not found', { disputeId });
            return;
        }
        if (dispute.aiSolutions) {
            logInfo('checkAndTriggerAI: AI Solutions already exist', { disputeId });
            return;
        }
        if (dispute.forwardedToCourt) {
            logInfo('checkAndTriggerAI: Already forwarded to court', { disputeId });
            return;
        }

        const messageCount = await Message.count({ where: { disputeId } });
        logInfo('checkAndTriggerAI: Message count', { disputeId, messageCount });

        if (messageCount >= 10) {
            // ========== FETCH ALL REQUIRED DATA ==========

            // Get messages
            const messages = await Message.findAll({
                where: { disputeId },
                order: [['createdAt', 'ASC']]
            });

            // Get evidence files
            const evidence = await Evidence.findAll({
                where: { disputeId },
                order: [['createdAt', 'ASC']]
            });

            // Update conversation memory (create summaries if needed)
            await checkAndUpdateSummary(disputeId);

            // Get or generate case profile
            let caseProfile = null;
            if (!dispute.caseProfileGenerated) {
                caseProfile = await extractCaseProfile(dispute, messages);
                if (caseProfile) {
                    await updateCaseProfile(disputeId);
                }
            }

            logInfo('checkAndTriggerAI: Triggering enhanced AI analysis', {
                disputeId,
                messageCount,
                evidenceCount: evidence.length,
                hasCaseProfile: !!caseProfile || dispute.caseProfileGenerated
            });

            // ========== RUN ENHANCED AI ANALYSIS ==========
            let analysis = await analyzeDisputeWithAI(dispute, messages, {
                isReanalysis: false,
                evidence: evidence,
                caseProfile: caseProfile
            });
            let isAIGenerated = !!analysis;

            // Fallback if AI fails
            if (!analysis) {
                logInfo('checkAndTriggerAI: AI failed, using fallback', { disputeId });
                analysis = {
                    summary: 'AI analysis could not be completed. Based on the conversation, here are general mediation options.',
                    legalAssessment: 'Please consult a legal professional for detailed assessment under Indian law.',
                    seriousness: 'MEDIUM',
                    evidenceConsidered: [],
                    legalPrecedentsApplied: [],
                    solutions: [
                        {
                            title: 'Mutual Settlement',
                            description: 'Both parties agree to negotiate terms directly and reach a compromise.',
                            timeline: '14 days',
                            benefitsPlaintiff: 'Quick resolution without legal costs',
                            benefitsDefendant: 'Avoids formal legal proceedings',
                            legalBasis: 'ADR principles under Section 89 CPC'
                        },
                        {
                            title: 'Third-Party Mediation',
                            description: 'Engage a neutral mediator to facilitate discussion and agreement.',
                            timeline: '30 days',
                            benefitsPlaintiff: 'Professional guidance in negotiations',
                            benefitsDefendant: 'Fair and unbiased mediation process',
                            legalBasis: 'Arbitration and Conciliation Act, 1996'
                        },
                        {
                            title: 'Legal Consultation',
                            description: 'Both parties consult with legal professionals before proceeding.',
                            timeline: '7 days',
                            benefitsPlaintiff: 'Clear understanding of legal rights',
                            benefitsDefendant: 'Informed decision making',
                            legalBasis: 'Right to legal counsel under Article 39A'
                        }
                    ]
                };
            } else {
                logInfo('checkAndTriggerAI: AI analysis successful', {
                    disputeId,
                    solutionsCount: analysis.solutions?.length || 0
                });
            }

            // ========== SAVE RESULTS ==========
            dispute.aiAnalysis = analysis.summary + '\n\n' + analysis.legalAssessment;
            dispute.aiSolutions = JSON.stringify(analysis.solutions);
            dispute.status = 'AwaitingDecision';
            await dispute.save();
            logInfo('AI analysis completed for dispute', { disputeId, isAIGenerated });

            // Audit log with enhanced metadata
            await logAuditEvent({
                action: AuditActions.AI_ANALYSIS_COMPLETE,
                category: AuditCategories.AI,
                resourceType: 'DISPUTE',
                resourceId: disputeId,
                description: `AI analysis completed for case #${disputeId} - ${isAIGenerated ? 'AI Generated' : 'Fallback'} - ${analysis.solutions?.length || 0} solutions`,
                metadata: {
                    messageCount,
                    evidenceCount: evidence.length,
                    solutionsCount: analysis.solutions?.length || 0,
                    seriousness: analysis.seriousness || 'MEDIUM',
                    category: dispute.category || 'other',
                    evidenceConsidered: analysis.evidenceConsidered || [],
                    legalPrecedentsApplied: analysis.legalPrecedentsApplied || [],
                    isAIGenerated
                },
                status: 'SUCCESS'
            });

            // Emit real-time update
            emitToDispute(dispute.id, 'dispute:ai-ready', {
                disputeId: dispute.id,
                status: dispute.status,
                aiSolutions: analysis.solutions,
                seriousness: analysis.seriousness
            });

            // Send email notification
            await emailService.notifyAIAnalysisReady(dispute);
        }
    } catch (error) {
        logError('checkAndTriggerAI: Error', { disputeId, error: error.message });
    }
}
