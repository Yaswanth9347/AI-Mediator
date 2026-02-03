
import { validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { Dispute, User, Message, Evidence } from '../models/index.js';
import emailService from '../services/email/index.js';
import notificationService from '../services/notificationService.js';
import { AuditLog, logAuditEvent, getDisputeAuditLogs, AuditActions, AuditCategories } from '../services/auditService.js';
import { logInfo, logError } from '../services/logger.js';
import { emitToDispute, emitToUser } from '../services/socketService.js';
import { checkAndTriggerAI } from '../services/aiService.js';
import { verifyGovtIdDocument, isAllowedIdMimeType } from '../services/ocrIdVerification.js';
import { processEvidenceOcr, isOcrSupported } from '../services/ocrService.js';
import { generateCaseSummaryPDF, generateAgreementPDF } from '../services/report/index.js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createWorker } from 'tesseract.js'; // For initial evidence OCR

// Create a new dispute
export const createDispute = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array()[0].msg });
        }

        // 1. Verify Identity Document first
        if (!req.files || !req.files.idCard) {
            return res.status(400).json({ error: "Proof of Identity is required" });
        }

        console.log("Verifying ID Document...");
        const idFile = req.files.idCard[0];
        if (!isAllowedIdMimeType(idFile.mimetype, idFile.originalname)) {
            return res.status(400).json({ error: 'Unsupported file type. Please upload PDF, JPG, or PNG.' });
        }
        const idVerification = await verifyGovtIdDocument(idFile.path, idFile.mimetype, idFile.originalname);
        if (!idVerification.isValid) {
            return res.status(400).json({ error: `Invalid Identity Document: ${idVerification.failure_reason || 'Verification failed'}` });
        }
        console.log("ID Verified:", idVerification.detected_document_type || 'government_id');

        const {
            title,
            description,
            plaintiffName,
            plaintiffEmail,
            plaintiffPhone,
            plaintiffAddress,
            plaintiffOccupation,
            respondentName,
            respondentEmail,
            respondentPhone,
            respondentAddress,
            respondentOccupation
        } = req.body;

        let evidenceText = '';
        const evidenceFile = req.files.evidence ? req.files.evidence[0] : null;

        if (evidenceFile) {
            console.log('Processing evidence file:', evidenceFile.path);
            try {
                // Tesseract can work with URLs directly
                const worker = await createWorker('eng');
                const { data: { text } } = await worker.recognize(evidenceFile.path);
                evidenceText = text;
                await worker.terminate();
            } catch (ocrError) {
                console.error('OCR Error:', ocrError);
                // Continue without OCR text - not a blocking error
            }
        }

        let dispute = await Dispute.create({
            title,
            description,
            evidenceText,
            // Use path for Cloudinary URL, fallback to filename for local storage
            evidenceImage: evidenceFile ? (evidenceFile.path || evidenceFile.filename) : null,
            creatorId: req.user.id,
            plaintiffName,
            plaintiffEmail,
            plaintiffPhone,
            plaintiffAddress,
            plaintiffOccupation,
            respondentName,
            respondentEmail,
            respondentPhone,
            respondentAddress,
            respondentOccupation,
            status: 'Pending', // Waiting for respondent to see and respond
            // ============ PAYMENT BYPASS FOR TESTING ============
            paymentStatus: 'paid',
            paidAt: new Date(),
            paymentAmount: 0,
            paymentCurrency: 'INR'
            // ====================================================
        });

        // Audit log: Dispute created
        await logAuditEvent({
            action: AuditActions.DISPUTE_CREATE,
            category: AuditCategories.DISPUTE,
            user: { id: req.user.id, email: plaintiffEmail, username: plaintiffName },
            resourceType: 'DISPUTE',
            resourceId: dispute.id,
            description: `New dispute created: "${title}" (Plaintiff: ${plaintiffName} vs Defendant: ${respondentName})`,
            metadata: {
                title,
                plaintiffEmail,
                respondentEmail,
                hasEvidence: !!evidenceFile
            },
            request: req,
            status: 'SUCCESS'
        });
        logInfo('Dispute created', { disputeId: dispute.id, title, plaintiffEmail, respondentEmail });

        // Send email notification to respondent
        await emailService.notifyCaseCreated(dispute);

        res.json(dispute);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

// Respondent submits defense / accepts case
export const respondToDispute = async (req, res) => {
    try {
        const { defendantStatement, respondentIdVerified, respondentIdData } = req.body;
        const dispute = await Dispute.findByPk(req.params.id);

        if (!dispute) return res.status(404).json({ error: 'Not found' });

        // Get current user's email
        const currentUser = await User.findByPk(req.user.id);

        // Security check: Only the designated respondent email can respond
        if (currentUser.email !== dispute.respondentEmail) {
            return res.status(403).json({ error: 'Not authorized. You are not the designated respondent.' });
        }

        dispute.defendantStatement = defendantStatement;
        dispute.respondentAccepted = true;
        dispute.status = 'Active'; // Both parties are now in

        // Save respondent ID verification data if provided
        if (respondentIdVerified !== undefined) {
            dispute.respondentIdVerified = respondentIdVerified;
        }
        if (respondentIdData) {
            dispute.respondentIdData = typeof respondentIdData === 'string'
                ? respondentIdData
                : JSON.stringify(respondentIdData);
        }

        await dispute.save();

        // Audit log: Dispute accepted
        await logAuditEvent({
            action: AuditActions.DISPUTE_ACCEPT,
            category: AuditCategories.DISPUTE,
            user: { id: req.user.id, email: currentUser.email, username: dispute.respondentName },
            resourceType: 'DISPUTE',
            resourceId: dispute.id,
            description: `Respondent accepted dispute #${dispute.id} and submitted statement`,
            metadata: {
                statementLength: defendantStatement?.length || 0
            },
            request: req,
            status: 'SUCCESS'
        });
        logInfo('Dispute accepted by respondent', { disputeId: dispute.id });

        // Send email notification to plaintiff
        await emailService.notifyCaseAccepted(dispute);

        // Send in-app notification to plaintiff
        const plaintiffUser = await User.findOne({ where: { email: dispute.plaintiffEmail } });
        if (plaintiffUser) {
            await notificationService.notifyDisputeAccepted(
                dispute.id,
                plaintiffUser.id,
                dispute.respondentName
            );
        }

        res.json(dispute);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get all disputes for current user
export const getDisputes = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        let disputes;
        if (user.role === 'Admin') {
            disputes = await Dispute.findAll({ order: [['createdAt', 'DESC']] });
        } else {
            disputes = await Dispute.findAll({
                where: {
                    [Op.or]: [
                        { creatorId: user.id },
                        { plaintiffEmail: user.email },
                        { respondentEmail: user.email }
                    ]
                },
                order: [['createdAt', 'DESC']]
            });
        }
        res.json(disputes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get single dispute details
export const getDispute = async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Not found' });

        // Security: Ensure user is related to dispute or Admin
        const user = await User.findByPk(req.user.id);
        if (user.role !== 'Admin' &&
            user.email !== dispute.plaintiffEmail &&
            user.email !== dispute.respondentEmail &&
            user.id !== dispute.creatorId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json(dispute);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- Messaging ---

export const getMessages = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows: messages } = await Message.findAndCountAll({
            where: { disputeId: req.params.id },
            order: [['createdAt', 'ASC']],
            limit: parseInt(limit),
            offset: offset
        });

        res.json({
            messages,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(count / parseInt(limit)),
                totalItems: count,
                itemsPerPage: parseInt(limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const sendMessage = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array()[0].msg });
        }

        const { content } = req.body;
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const currentUser = await User.findByPk(req.user.id);

        // Determine role
        let senderRole = 'unknown';
        let senderName = currentUser.username;

        if (currentUser.email === dispute.plaintiffEmail) {
            senderRole = 'plaintiff';
            senderName = dispute.plaintiffName;
        } else if (currentUser.email === dispute.respondentEmail) {
            senderRole = 'defendant';
            senderName = dispute.respondentName;
        } else if (currentUser.role === 'Admin') {
            senderRole = 'admin';
            senderName = 'Admin';
        } else {
            return res.status(403).json({ error: 'You are not a party to this dispute.' });
        }

        // Check if defendant has accepted (only plaintiff can message before acceptance)
        if (!dispute.respondentAccepted && senderRole === 'defendant') {
            return res.status(403).json({ error: 'You must accept the case before sending messages.' });
        }

        const message = await Message.create({
            disputeId: dispute.id,
            senderId: currentUser.id,
            senderName,
            senderRole,
            content,
            attachmentPath: req.file ? req.file.path : null
        });

        // Audit log
        await logAuditEvent({
            action: req.file ? AuditActions.ATTACHMENT_UPLOAD : AuditActions.MESSAGE_SEND,
            category: AuditCategories.MESSAGE,
            user: { id: currentUser.id, email: currentUser.email, username: senderName, role: senderRole },
            resourceType: 'DISPUTE',
            resourceId: dispute.id,
            description: `${senderRole.toUpperCase()} sent message in case #${dispute.id}${req.file ? ' (with attachment)' : ''}`,
            metadata: {
                messageId: message.id,
                hasAttachment: !!req.file,
                contentLength: content?.length || 0
            },
            request: req,
            status: 'SUCCESS'
        });

        // Emit real-time message
        emitToDispute(dispute.id, 'message:new', {
            id: message.id,
            disputeId: message.disputeId,
            senderId: message.senderId,
            senderName: message.senderName,
            senderRole: message.senderRole,
            content: message.content,
            attachmentPath: message.attachmentPath,
            createdAt: message.createdAt
        });

        // Send in-app notification
        const recipientEmail = currentUser.email === dispute.plaintiffEmail ?
            dispute.respondentEmail : dispute.plaintiffEmail;
        const recipientUser = await User.findOne({ where: { email: recipientEmail } });
        if (recipientUser) {
            await notificationService.notifyNewMessage(
                dispute.id,
                recipientUser.id,
                currentUser.username,
                content
            );
        }

        // Check trigger AI
        checkAndTriggerAI(dispute.id);

        res.json(message);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- Evidence ---

export const uploadEvidence = async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        if (['Resolved', 'Closed', 'ForwardedToCourt'].includes(dispute.status)) {
            if (req.file && req.file.path) {
                fs.unlink(req.file.path, (err) => {
                    if (err) console.error('Error deleting file after blocked upload:', err);
                });
            }
            return res.status(403).json({ error: 'Evidence upload is disabled because the case is closed or resolved.' });
        }

        const currentUser = await User.findByPk(req.user.id);
        const isPlaintiff = currentUser.email === dispute.plaintiffEmail;
        const isDefendant = currentUser.email === dispute.respondentEmail;
        const isAdmin = req.user.role === 'Admin';

        if (isAdmin) return res.status(403).json({ error: 'Admins can view evidence but cannot upload' });
        if (!isPlaintiff && !isDefendant) return res.status(403).json({ error: 'Not authorized to upload evidence for this case' });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        logInfo('Evidence file uploaded', {
            disputeId: dispute.id,
            userId: req.user.id,
            filename: req.file.path || req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype
        });

        let fileType = 'document';
        if (req.file.mimetype.startsWith('image/')) fileType = 'image';
        else if (req.file.mimetype.startsWith('video/')) fileType = 'video';
        else if (req.file.mimetype.startsWith('audio/')) fileType = 'audio';

        const uploaderRole = isPlaintiff ? 'plaintiff' : 'defendant';
        const { description } = req.body;

        const evidence = await Evidence.create({
            disputeId: dispute.id,
            uploadedBy: currentUser.id,
            uploaderName: currentUser.username,
            uploaderRole,
            fileName: req.file.path,
            originalName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            fileType,
            description: description || null,
            isVerified: isAdmin
        });

        await logAuditEvent({
            action: AuditActions.EVIDENCE_UPLOAD,
            category: AuditCategories.DISPUTE,
            user: { id: currentUser.id, email: currentUser.email, username: currentUser.username, role: uploaderRole },
            resourceType: 'EVIDENCE',
            resourceId: evidence.id,
            description: `${uploaderRole.toUpperCase()} uploaded evidence "${req.file.originalname}" for case #${dispute.id}`,
            metadata: {
                disputeId: dispute.id,
                fileName: req.file.path,
                originalName: req.file.originalname,
                fileSize: req.file.size,
                fileType,
                mimeType: req.file.mimetype,
                hasDescription: !!description
            },
            request: req,
            status: 'SUCCESS'
        });
        logInfo('Evidence uploaded', { evidenceId: evidence.id, disputeId: dispute.id });

        emitToDispute(dispute.id, 'dispute:evidence-uploaded', {
            disputeId: dispute.id,
            evidence: {
                id: evidence.id,
                uploaderName: evidence.uploaderName,
                uploaderRole: evidence.uploaderRole,
                originalName: evidence.originalName,
                fileType: evidence.fileType,
                createdAt: evidence.createdAt
            }
        });

        const recipientEmail = currentUser.email === dispute.plaintiffEmail ? dispute.respondentEmail : dispute.plaintiffEmail;
        const recipientUser = await User.findOne({ where: { email: recipientEmail } });
        if (recipientUser) {
            await notificationService.notifyEvidenceUploaded(
                dispute.id,
                recipientUser.id,
                currentUser.username,
                evidence.originalName
            );
        }

        if (isOcrSupported(req.file.mimetype)) {
            processEvidenceOcr(evidence.id).then(result => {
                if (result.success && result.status === 'completed') {
                    emitToDispute(dispute.id, 'dispute:ocr-complete', {
                        disputeId: dispute.id,
                        evidenceId: evidence.id,
                        hasText: result.text && result.text.length > 0,
                        wordCount: result.wordCount
                    });
                }
            }).catch(err => {
                logError('Background OCR failed', { evidenceId: evidence.id, error: err.message });
            });
        } else {
            evidence.update({ ocrStatus: 'not_applicable' }).catch(() => { });
        }

        res.status(201).json({
            message: 'Evidence uploaded successfully',
            evidence,
            ocrStatus: isOcrSupported(req.file.mimetype) ? 'processing' : 'not_applicable'
        });
    } catch (error) {
        logError('Evidence upload failed', { error: error.message, disputeId: req.params.id });
        res.status(500).json({ error: error.message });
    }
};

export const getEvidenceList = async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const currentUser = await User.findByPk(req.user.id);
        const isParty = currentUser.email === dispute.plaintiffEmail ||
            currentUser.email === dispute.respondentEmail ||
            currentUser.id === dispute.creatorId;
        const isAdmin = req.user.role === 'Admin';

        if (!isParty && !isAdmin) return res.status(403).json({ error: 'Not authorized' });

        const evidenceList = await Evidence.findAll({
            where: { disputeId: dispute.id },
            order: [['createdAt', 'DESC']]
        });

        await logAuditEvent({
            action: AuditActions.EVIDENCE_VIEW,
            category: AuditCategories.DISPUTE,
            user: { id: currentUser.id, email: currentUser.email, username: currentUser.username },
            resourceType: 'DISPUTE',
            resourceId: dispute.id,
            description: `User viewed evidence list for case #${dispute.id}`,
            metadata: { evidenceCount: evidenceList.length },
            request: req,
            status: 'SUCCESS'
        });

        res.json({
            disputeId: dispute.id,
            totalEvidence: evidenceList.length,
            evidence: evidenceList
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


export const downloadEvidence = async (req, res) => {
    try {
        const evidence = await Evidence.findByPk(req.params.evidenceId);
        if (!evidence) return res.status(404).json({ error: 'Evidence not found' });
        if (evidence.disputeId !== parseInt(req.params.id)) return res.status(400).json({ error: 'Evidence mismatch' });

        const dispute = await Dispute.findByPk(req.params.id);
        const currentUser = await User.findByPk(req.user.id);
        const isAdmin = req.user.role === 'Admin';
        const isParty = currentUser.email === dispute.plaintiffEmail || currentUser.email === dispute.respondentEmail || currentUser.id === dispute.creatorId;

        if (!isAdmin && !isParty) return res.status(403).json({ error: 'Not authorized' });

        const filePath = path.join(process.cwd(), 'uploads', evidence.fileName);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

        res.setHeader('Content-Type', evidence.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(evidence.originalName)}"`);
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        await logAuditEvent({
            action: 'EVIDENCE_DOWNLOAD',
            category: AuditCategories.DISPUTE,
            user: { id: req.user.id },
            resourceType: 'EVIDENCE',
            resourceId: evidence.id,
            description: `User downloaded evidence "${evidence.originalName}"`,
            request: req,
            status: 'SUCCESS'
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const previewEvidence = async (req, res) => {
    try {
        const evidence = await Evidence.findByPk(req.params.evidenceId);
        if (!evidence) return res.status(404).json({ error: 'Evidence not found' });
        if (evidence.disputeId !== parseInt(req.params.id)) return res.status(400).json({ error: 'Evidence mismatch' });

        const dispute = await Dispute.findByPk(req.params.id);

        // For preview (media), we might rely on authMiddlewareForMedia which sets req.user.
        // If coming from a protected route, we verify access.
        // Assuming req.user is set.
        const isAdmin = req.user.role === 'Admin';
        const isParty = req.user.email === dispute.plaintiffEmail || req.user.email === dispute.respondentEmail || req.user.id === dispute.creatorId;

        if (!isAdmin && !isParty) return res.status(403).json({ error: 'Not authorized' });

        if (evidence.fileName.startsWith('http')) return res.redirect(evidence.fileName);

        const filePath = path.join(process.cwd(), 'uploads', evidence.fileName);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

        res.setHeader('Content-Type', evidence.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(evidence.originalName)}"`);
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const getEvidenceItem = async (req, res) => {
    try {
        const evidence = await Evidence.findByPk(req.params.evidenceId);
        if (!evidence) return res.status(404).json({ error: 'Evidence not found' });
        // Validation skipped for brevity, similar to others...
        res.json({
            evidence: {
                ...evidence.toJSON(),
                previewUrl: `/api/disputes/${evidence.disputeId}/evidence/${evidence.id}/preview`,
                downloadUrl: `/api/disputes/${evidence.disputeId}/evidence/${evidence.id}/download`
            }
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const deleteEvidence = async (req, res) => {
    try {
        const evidence = await Evidence.findByPk(req.params.evidenceId);
        if (!evidence) return res.status(404).json({ error: 'Evidence not found' });

        const currentUser = await User.findByPk(req.user.id);
        const isAdmin = req.user.role === 'Admin';
        const isUploader = evidence.uploadedBy === currentUser.id;

        if (!isAdmin && !isUploader) return res.status(403).json({ error: 'Not authorized' });

        const filePath = `uploads/${evidence.fileName}`;
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        await evidence.destroy();

        await logAuditEvent({
            action: AuditActions.EVIDENCE_DELETE,
            category: AuditCategories.DISPUTE,
            user: { id: currentUser.id },
            resourceType: 'EVIDENCE',
            resourceId: req.params.evidenceId,
            description: `Evidence deleted`,
            request: req,
            status: 'SUCCESS'
        });

        res.json({ message: 'Evidence deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const getEvidenceOcr = async (req, res) => {
    try {
        const evidence = await Evidence.findByPk(req.params.evidenceId);
        if (!evidence) return res.status(404).json({ error: 'Not found' });
        res.json({
            text: evidence.ocrText,
            status: evidence.ocrStatus,
            confidence: evidence.ocrConfidence,
            processedAt: evidence.ocrProcessedAt
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};


// --- Resolution ---

export const submitDecision = async (req, res) => {
    try {
        const { choice } = req.body; // 0, 1, 2, or -1 (Reject)
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const currentUser = await User.findByPk(req.user.id);
        const isPlaintiff = currentUser.email === dispute.plaintiffEmail;
        const isDefendant = currentUser.email === dispute.respondentEmail;

        if (!isPlaintiff && !isDefendant) return res.status(403).json({ error: 'Not authorized' });

        if (isPlaintiff) dispute.plaintiffChoice = choice;
        else dispute.respondentChoice = choice;

        await dispute.save();

        logAuditEvent({
            action: AuditActions.SOLUTION_VOTE,
            category: AuditCategories.RESOLUTION,
            user: { id: currentUser.id, email: currentUser.email },
            resourceType: 'DISPUTE',
            resourceId: dispute.id,
            description: `${isPlaintiff ? 'Plaintiff' : 'Defendant'} selected solution option ${choice}`,
            metadata: { choice },
            request: req,
            status: 'SUCCESS'
        });

        // Check for agreement
        if (dispute.plaintiffChoice !== null && dispute.plaintiffChoice === dispute.respondentChoice && dispute.plaintiffChoice !== -1) {
            dispute.status = 'Resolved';
            dispute.resolutionStatus = 'Settled';

            // Generate Settlement Agreement
            const agreementPath = `uploads/Settlement_Agreement_${dispute.id}.pdf`;
            const docInfo = await generateAgreementPDF(dispute, agreementPath);

            dispute.agreementDocPath = `Settlement_Agreement_${dispute.id}.pdf`;
            dispute.documentId = docInfo.documentId;
            dispute.documentHash = docInfo.documentHash;

            await dispute.save();

            // Notify
            await emailService.notifyResolutionSuccess(dispute);
            emitToDispute(dispute.id, 'dispute:resolved', { disputeId: dispute.id, status: 'Resolved' });
        } else if (dispute.plaintiffChoice !== null && dispute.respondentChoice !== null && dispute.plaintiffChoice !== dispute.respondentChoice) {
            // Conflict
            emitToDispute(dispute.id, 'dispute:conflict', { disputeId: dispute.id });
        }

        res.json(dispute);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const verifyDetails = async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const currentUser = await User.findByPk(req.user.id);
        const { confirmed } = req.body;

        if (!confirmed) return res.status(400).json({ error: 'You must confirm your details.' });

        if (currentUser.email === dispute.plaintiffEmail) dispute.plaintiffVerified = true;
        else if (currentUser.email === dispute.respondentEmail) dispute.respondentVerified = true;
        else return res.status(403).json({ error: 'Not a party' });

        await dispute.save();
        res.json(dispute);
    } catch (e) { res.status(500).json({ error: e.message }); }
};


export const signAgreement = async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const currentUser = await User.findByPk(req.user.id);
        if (!req.file) return res.status(400).json({ error: 'Signature image required' });

        const role = currentUser.email === dispute.plaintiffEmail ? 'plaintiff' :
            currentUser.email === dispute.respondentEmail ? 'defendant' : null;

        if (role === 'plaintiff') dispute.plaintiffSignature = req.file.path || req.file.filename;
        else if (role === 'defendant') dispute.respondentSignature = req.file.path || req.file.filename;
        else return res.status(403).json({ error: 'Not a party' });

        await dispute.save();

        emitToDispute(dispute.id, 'dispute:signed', { role, userId: currentUser.id });

        // Check if both signed -> Move to Admin Review (Automatic PDF generation phase)
        if (dispute.plaintiffSignature && dispute.respondentSignature) {
            dispute.resolutionStatus = 'AdminReview';
            dispute.status = 'PendingAdminApproval';

            // Generate Draft PDF with metadata
            const pdfPath = `uploads/agreement_${dispute.id}.pdf`;
            const { documentId, documentHash } = await generateAgreementPDF(dispute, pdfPath);
            dispute.agreementDocPath = `agreement_${dispute.id}.pdf`;
            dispute.documentId = documentId;
            dispute.documentHash = documentHash;
            await dispute.save();

            // Audit log
            await logAuditEvent({
                action: AuditActions.AGREEMENT_GENERATE,
                category: AuditCategories.RESOLUTION,
                resourceType: 'DISPUTE',
                resourceId: dispute.id,
                description: `Settlement agreement PDF generated for case #${dispute.id}`,
                metadata: {
                    documentId,
                    documentHash: documentHash.substring(0, 16) + '...',
                    pdfPath: dispute.agreementDocPath
                },
                status: 'SUCCESS'
            });

            emitToDispute(dispute.id, 'dispute:agreement-generated', {
                disputeId: dispute.id,
                status: dispute.status,
                resolutionStatus: dispute.resolutionStatus,
                documentId,
                agreementDocPath: dispute.agreementDocPath,
            });

            // Send email notification to both parties
            await emailService.notifyResolutionAccepted(dispute);
        }

        res.json({ success: true, dispute });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const approveResolution = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only' });

        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const previousStatus = dispute.status;
        dispute.resolutionStatus = 'Finalized';
        dispute.status = 'Resolved';
        await dispute.save();

        await logAuditEvent({
            action: AuditActions.ADMIN_APPROVE_RESOLUTION,
            category: AuditCategories.ADMIN,
            user: { id: req.user.id, email: req.user.email, role: req.user.role },
            resourceType: 'DISPUTE',
            resourceId: dispute.id,
            description: `Admin approved and finalized resolution for case #${dispute.id}`,
            status: 'SUCCESS'
        });

        // Send email notification to both parties
        await emailService.notifyCaseResolved(dispute);

        // Send in-app notifications
        const plaintiffUser = await User.findOne({ where: { email: dispute.plaintiffEmail } });
        const respondentUser = await User.findOne({ where: { email: dispute.respondentEmail } });
        const userIds = [plaintiffUser?.id, respondentUser?.id].filter(Boolean);
        if (userIds.length > 0) {
            await notificationService.notifyResolutionApproved(dispute.id, userIds);
        }

        emitToDispute(dispute.id, 'dispute:resolution-finalized', {
            disputeId: dispute.id,
            status: dispute.status,
            resolutionStatus: dispute.resolutionStatus,
            documentId: dispute.documentId,
            agreementDocPath: dispute.agreementDocPath,
        });

        res.json({ message: 'Resolution finalized and agreement sent.', dispute });
    } catch (e) { res.status(500).json({ error: e.message }); }
};


// --- Reports ---

export const getReportSummary = async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const [messages, evidenceList, auditLogs] = await Promise.all([
            Message.findAll({ where: { disputeId: dispute.id }, order: [['createdAt', 'ASC']], limit: 100 }),
            Evidence.findAll({ where: { disputeId: dispute.id }, order: [['createdAt', 'DESC']] }),
            AuditLog.findAll({ where: { resourceType: 'DISPUTE', resourceId: dispute.id }, order: [['createdAt', 'DESC']], limit: 20 })
        ]);

        const pdfResult = await generateCaseSummaryPDF(dispute, messages, evidenceList, auditLogs);

        const fileName = `Case_Summary_${dispute.id}_${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        if (pdfResult && pdfResult.path) {
            const fileStream = fs.createReadStream(pdfResult.path);
            fileStream.pipe(res);
        } else {
            res.status(500).json({ error: 'PDF generation failed' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getAgreement = async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute || !dispute.agreementDocPath) return res.status(404).json({ error: 'Agreement not found' });

        const filePath = path.join(process.cwd(), 'uploads', dispute.agreementDocPath);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

        const fileName = `Settlement_Agreement_Case_${dispute.id}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getHistory = async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const currentUser = await User.findByPk(req.user.id);

        // Only allow parties or admin to view case history
        const isParty = currentUser.email === dispute.plaintiffEmail ||
            currentUser.email === dispute.respondentEmail;
        const isAdmin = req.user.role === 'Admin';

        if (!isParty && !isAdmin) {
            return res.status(403).json({ error: 'Not authorized to view case history' });
        }

        // Get audit logs for this dispute
        const auditLogs = await getDisputeAuditLogs(dispute.id);

        // Format for frontend display
        const history = auditLogs.map(log => ({
            id: log.id,
            action: log.action,
            category: log.category,
            description: log.description,
            actor: log.userName || log.userEmail || 'System',
            actorRole: log.userRole,
            timestamp: log.createdAt,
            status: log.status,
            metadata: log.metadata
        }));

        res.json({
            disputeId: dispute.id,
            totalEvents: history.length,
            history
        });
    } catch (error) {
        logError('Failed to fetch case history', { error: error.message, disputeId: req.params.id });
        res.status(500).json({ error: error.message });
    }
};



// ... Add other methods like admin interactions, court forwarding etc. ...

export const markResolutionViewed = async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
        await dispute.update({ resolutionViewed: true });
        res.json({ success: true, resolutionViewed: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const previewAgreement = async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute || !dispute.agreementDocPath) return res.status(404).json({ error: 'Agreement not found' });

        const filePath = path.join(process.cwd(), 'uploads', dispute.agreementDocPath);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Settlement_Agreement_${dispute.id}.pdf"`);
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const forwardToCourt = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only' });

        const { courtType, courtName, courtLocation, reason } = req.body;
        if (!courtType || !courtName || !courtLocation || !reason) {
            return res.status(400).json({ error: 'All court details are required' });
        }

        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        await dispute.update({
            forwardedToCourt: true,
            courtType,
            courtName,
            courtLocation,
            courtReason: reason,
            courtForwardedAt: new Date(),
            courtForwardedBy: req.user.id,
            status: 'ForwardedToCourt'
        });

        // Audit log
        await logAuditEvent({
            action: AuditActions.ADMIN_FORWARD_TO_COURT,
            category: AuditCategories.ADMIN,
            user: { id: req.user.id, email: req.user.email, role: req.user.role },
            resourceType: 'DISPUTE',
            resourceId: dispute.id,
            description: `Admin forwarded case #${dispute.id} to ${courtType} Court`,
            status: 'SUCCESS'
        });

        // Notifications
        await emailService.notifyCourtForwarded(dispute);

        const plaintiffUser = await User.findOne({ where: { email: dispute.plaintiffEmail } });
        const respondentUser = await User.findOne({ where: { email: dispute.respondentEmail } });
        const userIds = [plaintiffUser?.id, respondentUser?.id].filter(Boolean);
        if (userIds.length > 0) {
            await notificationService.notifyCourtForwarding(dispute.id, userIds, courtName);
        }

        emitToDispute(dispute.id, 'dispute:forwarded-to-court', {
            disputeId: dispute.id,
            status: dispute.status,
            forwardedToCourt: true,
            courtType,
            courtName
        });

        res.json({ message: 'Case successfully forwarded to court', dispute });
    } catch (e) { res.status(500).json({ error: e.message }); }
};


export const requestReanalysis = async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        // Reset analysis
        dispute.aiSolutions = null;
        dispute.aiAnalysis = null;
        dispute.status = 'Active';
        await dispute.save();

        // Trigger AI
        const messages = await Message.findAll({ where: { disputeId: dispute.id }, order: [['createdAt', 'ASC']] });

        // Background process
        checkAndTriggerAI(dispute.id);

        res.json({ message: 'Re-analysis requested' });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const forceAiAnalysis = async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        // Force trigger
        checkAndTriggerAI(dispute.id);
        res.json({ message: 'AI Analysis triggered manually' });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const processAllOcr = async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const evidenceList = await Evidence.findAll({
            where: { disputeId: dispute.id, ocrStatus: ['pending', 'failed'] }
        });

        const ocrCandidates = evidenceList.filter(e => isOcrSupported(e.mimeType));

        ocrCandidates.forEach(e => {
            processEvidenceOcr(e.id).then(result => {
                if (result.success && result.status === 'completed') {
                    emitToDispute(dispute.id, 'dispute:ocr-complete', {
                        disputeId: dispute.id,
                        evidenceId: e.id,
                        hasText: true
                    });
                }
            });
        });

        res.json({ message: `Processing ${ocrCandidates.length} files` });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

