
import { verifyDocumentIsID } from '../services/aiService.js';
import fs from 'fs';

export const verifyId = async (req, res) => {
    console.log('🔍 verifyId: Request received');

    try {
        // Check if file exists
        if (!req.file) {
            console.error('❌ verifyId: No file in request');
            console.error('Request body:', req.body);
            console.error('Request files:', req.files);
            return res.status(400).json({ error: 'No document uploaded' });
        }

        console.log('📁 verifyId: File received:', {
            fieldname: req.file.fieldname,
            originalname: req.file.originalname,
            path: req.file.path,
            size: req.file.size,
            mimetype: req.file.mimetype
        });

        // Verify the file actually exists on disk
        if (!fs.existsSync(req.file.path)) {
            console.error('❌ verifyId: File does not exist on disk:', req.file.path);
            return res.status(500).json({ error: 'File upload failed - file not found on server' });
        }

        console.log('✅ verifyId: File exists on disk, calling AI service...');
        const result = await verifyDocumentIsID(req.file.path);
        console.log('✅ verifyId: AI Service returned:', result);

        if (!result) {
            console.error('❌ verifyId: AI Service returned null/undefined');
            return res.status(500).json({ error: 'Verification service returned invalid response' });
        }

        if (!result.isValid) {
            console.warn('⚠️ verifyId: Invalid Document');
            // Clean up invalid file
            try {
                fs.unlinkSync(req.file.path);
                console.log('🗑️  Deleted invalid file');
            } catch (e) {
                console.error('Failed to delete file:', e.message);
            }
            // Return in frontend-expected format
            return res.status(200).json({
                status: 'rejected',
                failure_reason: result.details || 'Document verification failed',
                details: result.details
            });
        }

        console.log('✅ verifyId: Returning success');
        // Transform to frontend-expected format
        return res.status(200).json({
            status: 'verified',
            detected_document_type: result.documentType || 'Government ID',
            verification_method: 'AI',
            details: result.details || 'Document verified successfully'
        });

    } catch (error) {
        console.error('❌ verifyId: Unexpected error:', error);
        console.error('Error stack:', error.stack);
        return res.status(500).json({
            error: 'Internal server error during verification',
            message: error.message
        });
    }
};
