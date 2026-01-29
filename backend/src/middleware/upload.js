
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { storage } from '../config/cloudinary.js';

// File type validation configurations
const FILE_TYPES = {
    IMAGE: {
        mimes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
        extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
        maxSize: 2 * 1024 * 1024, // 2MB for images
        description: 'JPEG, PNG, GIF, or WebP'
    },
    DOCUMENT: {
        mimes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ],
        extensions: ['.pdf', '.doc', '.docx'],
        maxSize: 10 * 1024 * 1024, // 10MB for documents
        description: 'PDF, DOC, or DOCX'
    },
    EVIDENCE: {
        mimes: [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'video/mp4', 'video/mpeg', 'video/quicktime',
            'audio/mpeg', 'audio/wav', 'audio/mp3'
        ],
        extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.mp4', '.mpeg', '.mov', '.mp3', '.wav'],
        maxSize: 50 * 1024 * 1024, // 50MB for evidence files
        description: 'Images, PDFs, Videos (MP4, MPEG, MOV), or Audio (MP3, WAV)'
    },
    PROFILE: {
        mimes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
        extensions: ['.jpg', '.jpeg', '.png', '.webp'],
        maxSize: 2 * 1024 * 1024, // 2MB for profile pictures
        description: 'JPEG, PNG, or WebP'
    }
};

// Create file filter factory
const createFileFilter = (allowedTypes) => {
    return (req, file, cb) => {
        try {
            // Check MIME type
            if (!allowedTypes.mimes.includes(file.mimetype)) {
                return cb(
                    new Error(`Invalid file type. Only ${allowedTypes.description} files are allowed.`),
                    false
                );
            }

            // Check file extension (additional security layer)
            const ext = path.extname(file.originalname).toLowerCase();
            if (!allowedTypes.extensions.includes(ext)) {
                return cb(
                    new Error(`Invalid file extension. Only ${allowedTypes.description} files are allowed.`),
                    false
                );
            }

            // Additional security: Check for suspicious filenames
            if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
                return cb(new Error('Invalid filename detected.'), false);
            }

            cb(null, true);
        } catch (error) {
            cb(new Error('File validation error.'), false);
        }
    };
};

// Local disk storage fallback for when Cloudinary is not configured
const localDiskStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadsDir = './uploads';
        // Ensure uploads directory exists
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// Use Cloudinary storage if available, otherwise use local disk storage
const activeStorage = storage || localDiskStorage;
console.log(`📁 File storage: ${storage ? 'Cloudinary (cloud)' : 'Local disk (./uploads)'}`);

// Create different upload configurations for different purposes
export const uploadEvidence = multer({
    storage: activeStorage,
    fileFilter: createFileFilter(FILE_TYPES.EVIDENCE),
    limits: {
        fileSize: FILE_TYPES.EVIDENCE.maxSize,
        files: 1
    }
});

export const uploadProfile = multer({
    storage: activeStorage,
    fileFilter: createFileFilter(FILE_TYPES.PROFILE),
    limits: {
        fileSize: FILE_TYPES.PROFILE.maxSize,
        files: 1
    }
});

export const uploadDocument = multer({
    storage: activeStorage,
    fileFilter: createFileFilter(FILE_TYPES.DOCUMENT),
    limits: {
        fileSize: FILE_TYPES.DOCUMENT.maxSize,
        files: 1
    }
});

export const uploadImage = multer({
    storage: activeStorage,
    fileFilter: createFileFilter(FILE_TYPES.IMAGE),
    limits: {
        fileSize: FILE_TYPES.IMAGE.maxSize,
        files: 1
    }
});

// Default upload for backward compatibility (uses evidence validation)
export const upload = uploadEvidence;

// Global error handler for multer errors
export const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        // Multer-specific errors
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File too large',
                message: `Maximum file size exceeded. Please upload a file smaller than ${Math.round(err.limits?.fileSize / 1024 / 1024)}MB.`,
                code: 'FILE_TOO_LARGE'
            });
        } else if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                error: 'Too many files',
                message: 'You can only upload one file at a time.',
                code: 'TOO_MANY_FILES'
            });
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                error: 'Unexpected field',
                message: 'Unexpected file field in the request.',
                code: 'UNEXPECTED_FIELD'
            });
        }
        return res.status(400).json({
            error: 'Upload error',
            message: err.message,
            code: 'UPLOAD_ERROR'
        });
    } else if (err) {
        // Custom validation errors
        return res.status(400).json({
            error: 'File validation failed',
            message: err.message,
            code: 'VALIDATION_ERROR'
        });
    }
    next();
};

export { FILE_TYPES, createFileFilter };
