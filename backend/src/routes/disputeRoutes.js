
import express from 'express';
import { body } from 'express-validator';
import { authMiddleware, authMiddlewareForMedia } from '../middleware/authMiddleware.js';
import { upload, uploadEvidence, handleMulterError } from '../middleware/upload.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { createDisputeLimiter } from '../middleware/rateLimiter.js';

import {
    createDispute,
    respondToDispute,
    getDisputes,
    getDispute,
    getMessages,
    sendMessage,
    uploadEvidence as uploadEvidenceController,
    getEvidenceList,
    downloadEvidence,
    previewEvidence,
    getEvidenceItem,
    deleteEvidence,
    getEvidenceOcr,
    submitDecision,
    verifyDetails,
    signAgreement,
    getReportSummary,
    getAgreement,
    previewAgreement,
    markResolutionViewed,
    forwardToCourt,
    approveResolution,
    requestReanalysis,
    forceAiAnalysis,
    processAllOcr,
    getHistory
} from '../controllers/disputeController.js';

const router = express.Router();

// Routes

// Create Dispute
router.post('/',
    authMiddleware,
    createDisputeLimiter,
    upload.fields([{ name: 'evidence', maxCount: 1 }, { name: 'idCard', maxCount: 1 }]),
    [
        body('title').trim().isLength({ min: 5, max: 200 }).withMessage('Title must be 5-200 characters'),
        body('description').trim().isLength({ min: 20, max: 2000 }).withMessage('Description must be 20-2000 characters'),
        body('plaintiffName').trim().isLength({ min: 2, max: 100 }).withMessage('Plaintiff name is required'),
        body('plaintiffEmail').trim().isEmail().normalizeEmail().withMessage('Valid plaintiff email is required'),
        body('plaintiffPhone').trim().matches(/^[0-9+\-\s()]{10,20}$/).withMessage('Valid phone number is required'),
        body('respondentName').trim().isLength({ min: 2, max: 100 }).withMessage('Respondent name is required'),
        body('respondentEmail').trim().isEmail().normalizeEmail().withMessage('Valid respondent email is required'),
        body('respondentPhone').trim().matches(/^[0-9+\-\s()]{10,20}$/).withMessage('Valid phone number is required'),
    ],
    asyncHandler(createDispute)
);

// Get All Disputes
router.get('/', authMiddleware, asyncHandler(getDisputes));

// Get Single Dispute
router.get('/:id', authMiddleware, asyncHandler(getDispute));

// Respond to Dispute (Defendant)
router.post('/:id/respond', authMiddleware, asyncHandler(respondToDispute));

// Get Messages
router.get('/:id/messages', authMiddleware, asyncHandler(getMessages));

// Send Message
router.post('/:id/messages',
    authMiddleware,
    // Reuse general limiting for messages or add specific logic in controller
    upload.single('attachment'),
    [
        body('content').optional().trim().isLength({ max: 1000 }).withMessage('Message must be under 1000 characters'),
    ],
    asyncHandler(sendMessage)
);

// Evidence
router.post('/:id/evidence',
    authMiddleware,
    uploadEvidence.single('evidence'),
    handleMulterError,
    asyncHandler(uploadEvidenceController)
);
router.get('/:id/evidence', authMiddleware, asyncHandler(getEvidenceList));
router.get('/:id/evidence/:evidenceId/download', authMiddlewareForMedia, asyncHandler(downloadEvidence));
router.get('/:id/evidence/:evidenceId/preview', authMiddlewareForMedia, asyncHandler(previewEvidence));
router.get('/:id/evidence/:evidenceId', authMiddleware, asyncHandler(getEvidenceItem));
router.delete('/:id/evidence/:evidenceId', authMiddleware, asyncHandler(deleteEvidence));
router.get('/:id/evidence/:evidenceId/ocr', authMiddleware, asyncHandler(getEvidenceOcr));

// Resolution & Decision
router.post('/:id/decision', authMiddleware, asyncHandler(submitDecision));
router.post('/:id/verify-details', authMiddleware, asyncHandler(verifyDetails));
router.post('/:id/sign', authMiddleware, upload.single('signature'), asyncHandler(signAgreement));
router.post('/:id/resolution-viewed', authMiddleware, asyncHandler(markResolutionViewed));

// Reports
router.get('/:id/report/summary', authMiddleware, asyncHandler(getReportSummary));
router.get('/:id/report/agreement', authMiddlewareForMedia, asyncHandler(getAgreement));
router.get('/:id/report/agreement/preview', authMiddlewareForMedia, asyncHandler(previewAgreement));


// Admin / Utilities
router.post('/admin/approve-resolution/:id', authMiddleware, asyncHandler(approveResolution));
router.post('/admin/forward-to-court/:id', authMiddleware, asyncHandler(forwardToCourt));
router.post('/:id/request-reanalysis', authMiddleware, asyncHandler(requestReanalysis));
router.post('/:id/force-ai-analysis', authMiddleware, asyncHandler(forceAiAnalysis));
router.post('/:id/ocr/process-all', authMiddleware, asyncHandler(processAllOcr));
router.get('/:id/history', authMiddleware, asyncHandler(getHistory));



export default router;

