
import express from 'express';
import multer from 'multer';
import { verifyId } from '../controllers/externalController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

const router = express.Router();

// Multer error handler
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        console.error('❌ Multer Error:', err.message);
        return res.status(400).json({ error: `File upload error: ${err.message}` });
    }
    next(err);
};

router.post('/ocr/verify',
    upload.single('idDocument'),
    handleMulterError,
    asyncHandler(verifyId)
);

export default router;
