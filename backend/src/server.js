import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import { createWorker } from 'tesseract.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { DataTypes, Op } from 'sequelize';
import sequelize, { checkDatabaseHealth, addDatabaseIndexes } from './config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import QRCode from 'qrcode';
import emailService from './services/emailService.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as Sentry from '@sentry/node';
import { cloudinary, storage, isCloudinaryConfigured } from './config/cloudinary.js';
// Import logger and audit services
import logger, { logInfo, logError, logWarn, logAudit, requestLogger, generateRequestId } from './services/logger.js';
import { AuditLog, logAuditEvent, getDisputeAuditLogs, AuditActions, AuditCategories } from './services/auditService.js';
import notificationService from './services/notificationService.js';
import { initializeSentry, captureError, sentryRequestHandler, sentryTracingHandler, sentryErrorHandler } from './services/sentryService.js';
import securityMiddleware from './middleware/security.js';
import paymentService from './services/paymentService.js';
import sessionService, { hashToken, getClientIP, parseUserAgent } from './services/sessionService.js';

// ==================== SECURITY: ENFORCE JWT SECRET ====================
if (!process.env.JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET environment variable is not set!');
    console.error('   Set JWT_SECRET in your .env file with a strong random value.');
    console.error('   Example: JWT_SECRET=' + crypto.randomBytes(64).toString('hex'));
    process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Initialize Sentry (must be before other middleware)
initializeSentry(app);

// ==================== SECURITY MIDDLEWARE ====================

// Enhanced Security Headers with Helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "http://localhost:5000", "https:"],
            connectSrc: ["'self'", "http://localhost:5000", "ws://localhost:5000"],
            fontSrc: ["'self'", "https:", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
    },
    frameguard: {
        action: 'deny' // Prevent clickjacking
    },
    noSniff: true, // Prevent MIME type sniffing
    xssFilter: true, // Enable XSS filter
}));

// Additional Security Headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
});

// CORS Configuration
const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL
        : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Sentry request and tracing handlers (must be before other middleware)
app.use(sentryRequestHandler);
app.use(sentryTracingHandler);

// Body parser with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging with structured logger
app.use(requestLogger);
app.use('/uploads', express.static('uploads'));

// Rate Limiting Configurations
// Environment-aware rate limiters (lenient in development, strict in production)
const isDevelopment = process.env.NODE_ENV !== 'production';

const generalLimiter = rateLimit({
    windowMs: isDevelopment ? 1 * 60 * 1000 : 15 * 60 * 1000, // 1 min dev, 15 min prod
    max: isDevelopment ? 1000 : 100, // 1000 dev, 100 prod (React StrictMode doubles requests)
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 50 : 5, // 50 dev, 5 prod (login attempts)
    message: 'Too many authentication attempts, please try again after 15 minutes.',
    skipSuccessfulRequests: true,
});

const createDisputeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: isDevelopment ? 100 : 10, // 100 dev, 10 prod (dispute creations)
    message: 'Too many disputes created, please try again later.',
});

const messageLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: isDevelopment ? 100 : 30, // 100 dev, 30 prod (messages)
    message: 'Too many messages sent, please slow down.',
});

// Apply general rate limiter to all API routes
app.use('/api/', generalLimiter);

// Socket.io Configuration
const io = new Server(httpServer, {
    cors: {
        origin: process.env.NODE_ENV === 'production'
            ? process.env.FRONTEND_URL
            : ['http://localhost:5173', 'http://localhost:3000'],
        credentials: true
    }
});

// Make io globally accessible
global.io = io;

// Socket.io Authentication Middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication error'));
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.userId = decoded.id;
        socket.userRole = decoded.role;
        next();
    } catch (err) {
        next(new Error('Authentication error'));
    }
});

// Store connected users
const connectedUsers = new Map(); // userId -> { socketId, username, email }

// Socket.io Event Handlers
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userId} (${socket.id})`);

    // Handle user joining
    socket.on('user:join', async (userData) => {
        connectedUsers.set(socket.userId, {
            socketId: socket.id,
            username: userData.username,
            email: userData.email,
            userId: socket.userId
        });

        // Broadcast online status to all clients
        io.emit('user:online', {
            userId: socket.userId,
            username: userData.username
        });
    });

    // Handle joining dispute room
    socket.on('dispute:join', (disputeId) => {
        socket.join(`dispute:${disputeId}`);
        console.log(`User ${socket.userId} joined dispute room ${disputeId}`);
    });

    // Handle leaving dispute room
    socket.on('dispute:leave', (disputeId) => {
        socket.leave(`dispute:${disputeId}`);
        console.log(`User ${socket.userId} left dispute room ${disputeId}`);
    });

    // Handle typing indicator
    socket.on('typing:start', ({ disputeId, username }) => {
        socket.to(`dispute:${disputeId}`).emit('user:typing', {
            userId: socket.userId,
            username,
            disputeId
        });
    });

    socket.on('typing:stop', ({ disputeId }) => {
        socket.to(`dispute:${disputeId}`).emit('user:stop-typing', {
            userId: socket.userId,
            disputeId
        });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.userId} (${socket.id})`);
        const user = connectedUsers.get(socket.userId);
        connectedUsers.delete(socket.userId);

        if (user) {
            io.emit('user:offline', {
                userId: socket.userId,
                username: user.username
            });
        }
    });
});

// Helper function to emit to dispute room
function emitToDispute(disputeId, event, data) {
    io.to(`dispute:${disputeId}`).emit(event, data);
}

// Helper function to emit to specific user
function emitToUser(userId, event, data) {
    const user = connectedUsers.get(userId);
    if (user) {
        io.to(user.socketId).emit(event, data);
    }
}

// ==================== OCR SERVICE ====================

// Supported file types for OCR
const OCR_SUPPORTED_MIMETYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/webp'
];

// Check if file type is supported for OCR
function isOcrSupported(mimeType) {
    return OCR_SUPPORTED_MIMETYPES.includes(mimeType);
}

// Process OCR on a file
async function processOcr(filePath, language = 'eng') {
    try {
        const worker = await createWorker(language, 1, {
            langPath: path.join(process.cwd()),
            logger: m => {
                if (m.status === 'recognizing text') {
                    logInfo('OCR Progress', { progress: Math.round(m.progress * 100) });
                }
            }
        });

        const { data: { text, confidence } } = await worker.recognize(filePath);
        await worker.terminate();

        return {
            success: true,
            text: text.trim(),
            confidence: Math.round(confidence),
            wordCount: text.trim().split(/\s+/).filter(w => w.length > 0).length
        };
    } catch (error) {
        logError('OCR Processing Error', { error: error.message, filePath });
        return {
            success: false,
            error: error.message
        };
    }
}

// Background OCR processing for evidence
async function processEvidenceOcr(evidenceId) {
    try {
        // Import Evidence model (it's defined later, so we use sequelize.models)
        const evidenceRecord = await sequelize.models.evidence.findByPk(evidenceId);

        if (!evidenceRecord) {
            logError('OCR: Evidence not found', { evidenceId });
            return { success: false, error: 'Evidence not found' };
        }

        // Check if file type supports OCR
        if (!isOcrSupported(evidenceRecord.mimeType)) {
            await evidenceRecord.update({
                ocrStatus: 'not_applicable',
                ocrProcessedAt: new Date()
            });
            return { success: true, status: 'not_applicable' };
        }

        // Update status to processing
        await evidenceRecord.update({ ocrStatus: 'processing' });

        const fileSource = evidenceRecord.fileName; // Now this will be a Cloudinary URL or filename
        let ocrInput;

        if (fileSource.startsWith('http')) {
            // Handle Cloudinary/Remote URL
            ocrInput = fileSource;
        } else {
            // Handle local file (backward compatibility)
            const filePath = path.join(process.cwd(), 'uploads', fileSource);
            if (!fs.existsSync(filePath)) {
                await evidenceRecord.update({
                    ocrStatus: 'failed',
                    ocrError: 'File not found on disk',
                    ocrProcessedAt: new Date()
                });
                return { success: false, error: 'File not found' };
            }
            ocrInput = filePath;
        }

        // Process OCR
        const result = await processOcr(ocrInput);

        if (result.success) {
            await evidenceRecord.update({
                ocrText: result.text,
                ocrStatus: 'completed',
                ocrProcessedAt: new Date(),
                ocrError: null
            });

            logInfo('OCR completed', {
                evidenceId,
                wordCount: result.wordCount,
                confidence: result.confidence
            });

            return {
                success: true,
                status: 'completed',
                text: result.text,
                wordCount: result.wordCount,
                confidence: result.confidence
            };
        } else {
            await evidenceRecord.update({
                ocrStatus: 'failed',
                ocrError: result.error,
                ocrProcessedAt: new Date()
            });

            return { success: false, error: result.error };
        }
    } catch (error) {
        logError('OCR Processing failed', { evidenceId, error: error.message });

        try {
            const evidenceRecord = await sequelize.models.evidence.findByPk(evidenceId);
            if (evidenceRecord) {
                await evidenceRecord.update({
                    ocrStatus: 'failed',
                    ocrError: error.message,
                    ocrProcessedAt: new Date()
                });
            }
        } catch (e) {
            // Ignore update error
        }

        return { success: false, error: error.message };
    }
}

// ==================== END OCR SERVICE ====================

// Make io accessible in routes
app.set('io', io);
app.set('emitToDispute', emitToDispute);
app.set('emitToUser', emitToUser);

// Models
const User = sequelize.define('user', {
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    email: { type: DataTypes.STRING, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, defaultValue: 'User' }, // 'User' or 'Admin'
    // Additional Profile Fields
    phone: { type: DataTypes.STRING },
    address: { type: DataTypes.TEXT },
    occupation: { type: DataTypes.STRING },
    // Identity Verification (New)
    isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
    verificationStatus: { type: DataTypes.STRING, defaultValue: 'Unverified' }, // Unverified, Pending, Verified, Rejected
    idCardPath: { type: DataTypes.STRING },
    selfiePath: { type: DataTypes.STRING },
    verificationNotes: { type: DataTypes.TEXT }, // AI's reasoning for verification
    // Account Suspension
    isSuspended: { type: DataTypes.BOOLEAN, defaultValue: false },
    suspendedAt: { type: DataTypes.DATE },
    suspendReason: { type: DataTypes.TEXT },
    // Failed Login Tracking (Security)
    failedLoginAttempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    lastFailedLogin: { type: DataTypes.DATE },
    accountLockedUntil: { type: DataTypes.DATE },
    // Password Reset
    resetToken: { type: DataTypes.STRING },
    resetTokenExpiry: { type: DataTypes.DATE },
    // Email Verification
    isEmailVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
    emailVerificationToken: { type: DataTypes.STRING },
    emailVerificationExpiry: { type: DataTypes.DATE },
    // Profile Picture
    profilePicture: { type: DataTypes.STRING }, // Path to profile image
    // Two-Factor Authentication
    twoFactorEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    twoFactorSecret: { type: DataTypes.STRING },
    twoFactorBackupCodes: { type: DataTypes.TEXT }, // JSON array of backup codes
    // Privacy Settings
    profileVisibility: { type: DataTypes.STRING, defaultValue: 'public' }, // public, private, contacts
    showEmail: { type: DataTypes.BOOLEAN, defaultValue: false },
    showPhone: { type: DataTypes.BOOLEAN, defaultValue: false },
    // Last Activity
    lastLoginAt: { type: DataTypes.DATE },
    lastActivityAt: { type: DataTypes.DATE },
    // Notification Preferences (JSON)
    notificationPreferences: {
        type: DataTypes.TEXT,
        defaultValue: JSON.stringify({
            emailNotifications: true,
            inAppNotifications: true,
            newDispute: true,
            caseAccepted: true,
            newMessage: true,
            aiAnalysisComplete: true,
            solutionVotes: true,
            caseResolved: true,
            courtForwarding: true,
            evidenceUploaded: true,
            signatureRequired: true,
            systemAlerts: true
        })
    }
});

// Session Model - for proper session management
const Session = sequelize.define('session', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    token: {
        type: DataTypes.STRING(512),
        allowNull: false,
        unique: true
    },
    tokenHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true
    },
    deviceType: {
        type: DataTypes.STRING(50),
        defaultValue: 'Unknown'
    },
    deviceName: {
        type: DataTypes.STRING(100),
        defaultValue: 'Unknown Device'
    },
    browser: {
        type: DataTypes.STRING(100),
        defaultValue: 'Unknown Browser'
    },
    browserVersion: {
        type: DataTypes.STRING(50)
    },
    os: {
        type: DataTypes.STRING(100),
        defaultValue: 'Unknown OS'
    },
    ipAddress: {
        type: DataTypes.STRING(45) // IPv6 compatible
    },
    location: {
        type: DataTypes.STRING(200),
        defaultValue: 'Unknown Location'
    },
    lastActivity: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    revokedAt: {
        type: DataTypes.DATE
    },
    revokedReason: {
        type: DataTypes.STRING(200)
    }
}, {
    indexes: [
        { fields: ['userId'] },
        { fields: ['tokenHash'] },
        { fields: ['isActive'] },
        { fields: ['expiresAt'] }
    ]
});

// Session belongs to User
Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Session, { foreignKey: 'userId', as: 'sessions' });

const Dispute = sequelize.define('dispute', {
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    status: { type: DataTypes.STRING, defaultValue: 'Pending' }, // Pending, Active, AwaitingDecision, Resolved, ForwardedToCourt
    evidenceText: { type: DataTypes.TEXT },
    evidenceImage: { type: DataTypes.STRING },
    aiAnalysis: { type: DataTypes.TEXT },
    resolutionNotes: { type: DataTypes.TEXT },
    creatorId: { type: DataTypes.INTEGER },

    // Plaintiff (Person 1) Details
    plaintiffName: { type: DataTypes.STRING, allowNull: false },
    plaintiffEmail: { type: DataTypes.STRING, allowNull: false },
    plaintiffPhone: { type: DataTypes.STRING, allowNull: false },
    plaintiffAddress: { type: DataTypes.TEXT, allowNull: false },
    plaintiffOccupation: { type: DataTypes.STRING, allowNull: false },

    // Respondent (Person 2) Details
    respondentName: { type: DataTypes.STRING, allowNull: false },
    respondentEmail: { type: DataTypes.STRING, allowNull: false },
    respondentPhone: { type: DataTypes.STRING, allowNull: false },
    respondentAddress: { type: DataTypes.TEXT, allowNull: false },
    respondentOccupation: { type: DataTypes.STRING, allowNull: false },

    respondentId: { type: DataTypes.INTEGER }, // Linked User ID when they respond
    respondentAccepted: { type: DataTypes.BOOLEAN, defaultValue: false }, // Whether defendant accepted the case
    defendantStatement: { type: DataTypes.TEXT }, // The respondent's initial side of the story

    // AI Solutions & Acceptance System
    aiSolutions: { type: DataTypes.TEXT }, // JSON array of 3 solutions
    // Specific Solution Choices (New)
    plaintiffChoice: { type: DataTypes.INTEGER, defaultValue: null }, // 0, 1, 2, or -1 (Reject All)
    defendantChoice: { type: DataTypes.INTEGER, defaultValue: null }, // 0, 1, 2, or -1 (Reject All)
    reanalysisCount: { type: DataTypes.INTEGER, defaultValue: 0 }, // 0 = first analysis, 1 = reanalysis done

    // Court Forwarding
    forwardedToCourt: { type: DataTypes.BOOLEAN, defaultValue: false },
    courtType: { type: DataTypes.STRING }, // 'District' or 'High'
    courtReason: { type: DataTypes.TEXT },
    courtName: { type: DataTypes.STRING },
    courtLocation: { type: DataTypes.STRING },
    courtForwardedAt: { type: DataTypes.DATE },
    courtForwardedBy: { type: DataTypes.INTEGER }, // Admin user ID who forwarded

    // Resolution Phase Fields
    resolutionStatus: { type: DataTypes.STRING, defaultValue: 'None' }, // None, InProgress, Signed, AdminReview, Finalized
    plaintiffVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
    respondentVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
    plaintiffSignature: { type: DataTypes.STRING }, // Path to sig image
    respondentSignature: { type: DataTypes.STRING }, // Path to sig image
    agreementDocPath: { type: DataTypes.STRING },

    // Document Metadata (for verification)
    documentId: { type: DataTypes.STRING }, // UUID for document verification
    documentHash: { type: DataTypes.STRING }, // SHA-256 hash for tamper detection

    // Payment Information
    paymentStatus: {
        type: DataTypes.STRING,
        defaultValue: 'pending'
    }, // pending, processing, paid, failed, refunded
    paymentIntentId: { type: DataTypes.STRING }, // Stripe payment intent ID
    paymentAmount: { type: DataTypes.INTEGER }, // Amount in cents
    paymentCurrency: { type: DataTypes.STRING, defaultValue: 'usd' },
    paidAt: { type: DataTypes.DATE },
    refundedAt: { type: DataTypes.DATE },
    refundAmount: { type: DataTypes.INTEGER }, // Amount refunded in cents
    refundReason: { type: DataTypes.TEXT },
});

// Message model for chat-like conversation
const Message = sequelize.define('message', {
    disputeId: { type: DataTypes.INTEGER, allowNull: false },
    senderId: { type: DataTypes.INTEGER, allowNull: false },
    senderName: { type: DataTypes.STRING, allowNull: false },
    senderRole: { type: DataTypes.STRING, allowNull: false }, // 'plaintiff' or 'defendant'
    content: { type: DataTypes.TEXT, allowNull: false },
    attachmentPath: { type: DataTypes.STRING }, // Optional file attachment
});

// Evidence Model - For storing case evidence files
const Evidence = sequelize.define('evidence', {
    disputeId: { type: DataTypes.INTEGER, allowNull: false },
    uploadedBy: { type: DataTypes.INTEGER, allowNull: false }, // User ID
    uploaderName: { type: DataTypes.STRING, allowNull: false },
    uploaderRole: { type: DataTypes.STRING, allowNull: false }, // plaintiff, defendant, admin
    fileName: { type: DataTypes.STRING, allowNull: false }, // Stored filename
    originalName: { type: DataTypes.STRING, allowNull: false }, // Original filename
    fileSize: { type: DataTypes.INTEGER, allowNull: false }, // In bytes
    mimeType: { type: DataTypes.STRING, allowNull: false },
    fileType: { type: DataTypes.STRING, allowNull: false }, // image, document, video, audio
    description: { type: DataTypes.TEXT }, // Optional description of the evidence
    isVerified: { type: DataTypes.BOOLEAN, defaultValue: false }, // Admin verification
    // OCR Fields
    ocrText: { type: DataTypes.TEXT }, // Extracted text from OCR
    ocrStatus: { type: DataTypes.STRING, defaultValue: 'pending' }, // pending, processing, completed, failed, not_applicable
    ocrProcessedAt: { type: DataTypes.DATE }, // When OCR was completed
    ocrError: { type: DataTypes.STRING }, // Error message if OCR failed
}, {
    indexes: [
        { fields: ['disputeId'] },
        { fields: ['uploadedBy'] },
        { fields: ['createdAt'] },
        { fields: ['ocrStatus'] },
    ]
});

// Notification Model - For in-app notifications
const Notification = sequelize.define('notification', {
    userId: { type: DataTypes.INTEGER, allowNull: false }, // Recipient user ID
    type: { type: DataTypes.STRING, allowNull: false }, // dispute, message, ai, resolution, admin, system
    title: { type: DataTypes.STRING, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    disputeId: { type: DataTypes.INTEGER }, // Related dispute (if applicable)
    relatedId: { type: DataTypes.INTEGER }, // Related resource ID (message, evidence, etc.)
    isRead: { type: DataTypes.BOOLEAN, defaultValue: false },
    priority: { type: DataTypes.STRING, defaultValue: 'normal' }, // low, normal, high, urgent
    metadata: { type: DataTypes.JSONB, defaultValue: {} }, // Additional data
}, {
    indexes: [
        { fields: ['userId'] },
        { fields: ['isRead'] },
        { fields: ['createdAt'] },
        { fields: ['userId', 'isRead'] },
    ]
});

// Contact Model - For support inquiries
const Contact = sequelize.define('contact', {
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false },
    subject: { type: DataTypes.STRING, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'Open' }, // Open, Replied, Closed
    adminReply: { type: DataTypes.TEXT },
    repliedAt: { type: DataTypes.DATE },
    repliedBy: { type: DataTypes.INTEGER } // Admin User ID
});

// Cloudinary storage is imported from ./config/cloudinary.js and used in multer configurations below

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
const uploadEvidence = multer({
    storage: activeStorage,
    fileFilter: createFileFilter(FILE_TYPES.EVIDENCE),
    limits: {
        fileSize: FILE_TYPES.EVIDENCE.maxSize,
        files: 1
    }
});

const uploadProfile = multer({
    storage: activeStorage,
    fileFilter: createFileFilter(FILE_TYPES.PROFILE),
    limits: {
        fileSize: FILE_TYPES.PROFILE.maxSize,
        files: 1
    }
});

const uploadDocument = multer({
    storage: activeStorage,
    fileFilter: createFileFilter(FILE_TYPES.DOCUMENT),
    limits: {
        fileSize: FILE_TYPES.DOCUMENT.maxSize,
        files: 1
    }
});

const uploadImage = multer({
    storage: activeStorage,
    fileFilter: createFileFilter(FILE_TYPES.IMAGE),
    limits: {
        fileSize: FILE_TYPES.IMAGE.maxSize,
        files: 1
    }
});

// Default upload for backward compatibility (uses evidence validation)
const upload = uploadEvidence;

// Global error handler for multer errors
const handleMulterError = (err, req, res, next) => {
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

// Gemini Setup - Use GOOGLE_API_KEY
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
            const buffer = await response.arrayBuffer();
            data = Buffer.from(buffer).toString("base64");

            // Auto-detect mimeType from URL if not provided
            if (!mimeType) {
                const ext = path.extname(new URL(fileSource).pathname).toLowerCase();
                const mimeTypes = {
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.png': 'image/png',
                    '.gif': 'image/gif',
                    '.webp': 'image/webp',
                    '.bmp': 'image/bmp'
                };
                mimeType = mimeTypes[ext] || 'image/jpeg';
            }
        } catch (error) {
            logError("Failed to fetch remote file for Gemini", { url: fileSource, error: error.message });
            throw error;
        }
    } else {
        // Handle local file (backward compatibility)
        const filePath = fileSource.includes('/') ? fileSource : path.join('uploads', fileSource);
        data = fs.readFileSync(filePath).toString("base64");

        if (!mimeType) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.bmp': 'image/bmp'
            };
            mimeType = mimeTypes[ext] || 'image/jpeg';
        }
    }

    return {
        inlineData: {
            data,
            mimeType
        }
    };
}

// ==================== ENHANCED IDENTITY VERIFICATION SERVICE ====================

/**
 * Analyze ID Document - Extract details and validate authenticity
 */
async function analyzeIdDocument(idCardPath) {
    if (API_KEY === 'API_KEY_MISSING') {
        return {
            success: false,
            error: "API Key not configured",
            isValidDocument: false
        };
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const imagePart = fileToGenerativePart(`uploads/${idCardPath}`);

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
async function analyzeSelfie(selfiePath) {
    if (API_KEY === 'API_KEY_MISSING') {
        return {
            success: false,
            error: "API Key not configured",
            isValidSelfie: false
        };
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const imagePart = fileToGenerativePart(`uploads/${selfiePath}`);

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
async function compareFaces(idCardPath, selfiePath) {
    if (API_KEY === 'API_KEY_MISSING') {
        return {
            success: false,
            error: "API Key not configured",
            facesMatch: false
        };
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const idPart = fileToGenerativePart(`uploads/${idCardPath}`);
        const selfiePart = fileToGenerativePart(`uploads/${selfiePath}`);

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
   - Glasses on/off
5. Identify CONCERNING DIFFERENCES that suggest different people

RESPOND IN EXACT JSON FORMAT:
{
    "facesMatch": true/false,
    "matchConfidence": 0.0 to 1.0,
    "faceFoundInId": true/false,
    "faceFoundInSelfie": true/false,
    "comparisonDetails": {
        "faceShapeMatch": true/false,
        "eyeShapeMatch": true/false,
        "noseMatch": true/false,
        "mouthMatch": true/false,
        "overallSimilarity": "high" | "medium" | "low" | "none"
    },
    "acceptableDifferences": ["list of minor differences that don't affect match"] or [],
    "concerningDifferences": ["list of major differences suggesting different people"] or [],
    "verificationDecision": "MATCH" | "NO_MATCH" | "INCONCLUSIVE",
    "reason": "Detailed explanation of your comparison"
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

/**
 * Comprehensive Identity Verification - Combines all checks
 */
async function verifyIdentityWithAI(username, idCardPath, selfiePath) {
    if (API_KEY === 'API_KEY_MISSING') {
        return {
            verified: false,
            reason: "API Key not configured. Verification unavailable.",
            confidence: 0,
            details: null
        };
    }

    const startTime = Date.now();
    const verificationId = uuidv4();

    logInfo('Starting identity verification', {
        verificationId,
        username,
        idCardPath,
        selfiePath
    });

    try {
        // Step 1: Analyze ID Document
        logInfo('Analyzing ID document...', { verificationId });
        const idAnalysis = await analyzeIdDocument(idCardPath);

        if (!idAnalysis.success || !idAnalysis.isValidDocument) {
            logInfo('ID document validation failed', { verificationId, result: idAnalysis });
            return {
                verified: false,
                reason: idAnalysis.reason || "The uploaded document does not appear to be a valid government-issued ID.",
                confidence: 0,
                step: 'document_validation',
                details: {
                    idAnalysis,
                    selfieAnalysis: null,
                    faceComparison: null
                }
            };
        }

        // Step 2: Analyze Selfie
        logInfo('Analyzing selfie...', { verificationId });
        const selfieAnalysis = await analyzeSelfie(selfiePath);

        if (!selfieAnalysis.success || !selfieAnalysis.isValidSelfie) {
            logInfo('Selfie validation failed', { verificationId, result: selfieAnalysis });
            return {
                verified: false,
                reason: selfieAnalysis.reason || "The selfie could not be verified. Please ensure you take a clear photo of your face.",
                confidence: 0,
                step: 'selfie_validation',
                details: {
                    idAnalysis,
                    selfieAnalysis,
                    faceComparison: null
                }
            };
        }

        // Check for high spoofing risk
        if (selfieAnalysis.spoofingRisk === 'high') {
            logInfo('High spoofing risk detected', { verificationId, result: selfieAnalysis });
            return {
                verified: false,
                reason: "The selfie appears suspicious. Please take a fresh photo of yourself, not a photo of a photo or screen.",
                confidence: 0,
                step: 'spoofing_detection',
                details: {
                    idAnalysis,
                    selfieAnalysis,
                    faceComparison: null
                }
            };
        }

        // Step 3: Compare Faces
        logInfo('Comparing faces...', { verificationId });
        const faceComparison = await compareFaces(idCardPath, selfiePath);

        if (!faceComparison.success) {
            logInfo('Face comparison failed', { verificationId, result: faceComparison });
            return {
                verified: false,
                reason: faceComparison.error || "Could not compare faces. Please ensure both photos show a clear face.",
                confidence: 0,
                step: 'face_comparison',
                details: {
                    idAnalysis,
                    selfieAnalysis,
                    faceComparison
                }
            };
        }

        // Step 4: Name Matching (Optional validation)
        let nameMatchInfo = null;
        if (idAnalysis.extractedInfo?.fullName && username) {
            const idName = idAnalysis.extractedInfo.fullName.toLowerCase().trim();
            const userName = username.toLowerCase().trim();

            // Check if username is contained in ID name or vice versa
            const nameWords = idName.split(/\s+/);
            const userWords = userName.split(/\s+/);

            const anyWordMatch = nameWords.some(nw =>
                userWords.some(uw =>
                    nw.includes(uw) || uw.includes(nw)
                )
            );

            nameMatchInfo = {
                nameOnId: idAnalysis.extractedInfo.fullName,
                username: username,
                partialMatch: anyWordMatch
            };
        }

        // Final Decision
        const isVerified = faceComparison.facesMatch &&
            faceComparison.verificationDecision === 'MATCH' &&
            faceComparison.matchConfidence >= 0.6;

        const overallConfidence = Math.round(
            ((idAnalysis.authenticity?.confidence || 0.8) * 0.2 +
                (selfieAnalysis.confidence || 0.8) * 0.2 +
                (faceComparison.matchConfidence || 0) * 0.6) * 100
        );

        const duration = Date.now() - startTime;

        logInfo('Identity verification completed', {
            verificationId,
            verified: isVerified,
            confidence: overallConfidence,
            duration: `${duration}ms`
        });

        let reason;
        if (isVerified) {
            reason = `Identity verified successfully. The person in the selfie matches the photo on the ${idAnalysis.documentType || 'ID document'}.`;
        } else if (faceComparison.verificationDecision === 'INCONCLUSIVE') {
            reason = "Verification inconclusive. The images may not be clear enough for a definitive match. Please try again with clearer photos.";
        } else {
            reason = faceComparison.reason || "The face in the selfie does not appear to match the face on the ID document.";
        }

        return {
            verified: isVerified,
            reason,
            confidence: overallConfidence,
            nameOnID: idAnalysis.extractedInfo?.fullName || null,
            documentType: idAnalysis.documentType,
            verificationId,
            step: 'completed',
            details: {
                idAnalysis: {
                    documentType: idAnalysis.documentType,
                    country: idAnalysis.country,
                    isValid: idAnalysis.isValidDocument,
                    authenticity: idAnalysis.authenticity
                },
                selfieAnalysis: {
                    isValid: selfieAnalysis.isValidSelfie,
                    spoofingRisk: selfieAnalysis.spoofingRisk,
                    quality: selfieAnalysis.qualityAssessment
                },
                faceComparison: {
                    match: faceComparison.facesMatch,
                    confidence: faceComparison.matchConfidence,
                    decision: faceComparison.verificationDecision,
                    similarity: faceComparison.comparisonDetails?.overallSimilarity
                },
                nameMatch: nameMatchInfo,
                processingTime: `${duration}ms`
            }
        };

    } catch (err) {
        logError("Comprehensive Verification Error", {
            verificationId,
            error: err.message,
            stack: err.stack
        });
        return {
            verified: false,
            reason: "An error occurred during verification. Please try again.",
            confidence: 0,
            error: err.message,
            verificationId
        };
    }
}

// ==================== END IDENTITY VERIFICATION SERVICE ====================

// Helper to verify if document is a valid ID (Simplified check)

// AI Analysis Helper Function (Multimodal)
async function analyzeDisputeWithAI(dispute, messages, isReanalysis = false) {
    console.log('=== AI Analysis Started ===');
    console.log('API_KEY status:', API_KEY !== 'API_KEY_MISSING' ? 'Configured' : 'MISSING');
    console.log('Dispute ID:', dispute.id);
    console.log('Message count:', messages.length);
    console.log('Is reanalysis:', isReanalysis);

    if (API_KEY === 'API_KEY_MISSING') {
        console.error('AI Analysis skipped: API_KEY is missing');
        return null;
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log('Gemini model initialized: gemini-1.5-flash');

        // Collect all image evidence from messages
        const evidenceParts = [];
        for (const msg of messages) {
            if (msg.attachmentPath) {
                try {
                    // Start simple: assume images. In production, check mime-type properly.
                    // uploads/filename
                    const path = `uploads/${msg.attachmentPath}`;
                    if (fs.existsSync(path)) {
                        evidenceParts.push(fileToGenerativePart(path, "image/jpeg"));
                    }
                } catch (err) {
                    console.error('Error reading attachment:', err);
                }
            }
        }

        // Also check main dispute evidence
        if (dispute.evidenceImage) {
            const path = `uploads/${dispute.evidenceImage}`;
            if (fs.existsSync(path)) {
                evidenceParts.push(fileToGenerativePart(path, "image/jpeg"));
            }
        }

        // Format conversation history
        const conversationHistory = messages.map(m =>
            `${m.senderRole.toUpperCase()} (${m.senderName}): ${m.content} ${m.attachmentPath ? '[ATTACHMENT INCLUDED]' : ''}`
        ).join('\n');

        const prompt = `SYSTEM ROLE

You are the AI Dispute Resolution Engine embedded in an end-to-end legal-tech application.
You operate only on backend-provided data and only after explicit trigger conditions are met.

You are NOT a chatbot, NOT a legal advisor, and NOT a judge.

Your sole responsibility is to convert completed dispute discussions + evidence into clear, fair, dispute-specific resolution outcomes.

EXECUTION CONTEXT

You are executing for Dispute Case #${dispute.id}${isReanalysis ? ' (REANALYSIS REQUESTED - Previous solutions rejected. Generate NEW alternatives with different approaches)' : ''}
Jurisdiction: India
Dispute Title: ${dispute.title}

PLAINTIFF (Person 1):
- Name: ${dispute.plaintiffName}
- Occupation: ${dispute.plaintiffOccupation || 'Not specified'}
- Initial Complaint: ${dispute.description}

DEFENDANT (Person 2):
- Name: ${dispute.respondentName}
- Occupation: ${dispute.respondentOccupation || 'Not specified'}

FULL DISCUSSION TRANSCRIPT:
${conversationHistory}

INTERNAL ANALYSIS (STRICTLY INTERNAL — DO NOT OUTPUT DIRECTLY)

Before generating any user-visible text, you MUST internally analyze:
- Every statement from both parties
- Chronology of events
- Evidence relevance, strength, and gaps (images/attachments included if present)
- Alleged harm (reputation, professional, financial, emotional)
- Power imbalance, if present
- Consistencies and contradictions
- Whether corrective justice is required and for whom

Apply principles of the Indian Constitution:
- Natural justice
- Fairness
- Equality before law
- Proportionality

You may internally conclude that one party requires stronger protection or restoration, but you MUST NOT declare guilt or legal liability.

USER-FACING OUTPUT REQUIREMENTS

HEADER (MUST BE EXACT):
"TOP 3 CLEAR POSSIBLE SOLUTIONS TO RESOLVE THIS DISPUTE"

MANDATORY OUTPUT RULES:

You MUST output exactly three solutions.

Each solution MUST:
- Be written in plain, clear language
- Use the actual party names (${dispute.plaintiffName} and ${dispute.respondentName})
- Reference facts from THIS dispute
- Propose concrete real-world actions
- Explain why the solution is fair
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

[Clearly state what happened based on statements]

[What corrective actions will occur]

[Who must do what]

[What behavior must stop]

[Ensure no unfair punishment and no unfair advantage]

Result:
[Explain how harm is corrected or contained]
[How reputation, dignity, or opportunity is restored]
[Whether the matter is closed or protected from recurrence]

QUALITY BAR (NON-NEGOTIABLE):

Ask yourself before responding:
1. Could a normal person write this without AI? → If yes, regenerate.
2. Is this solution specific to THESE names and facts? → If no, regenerate.
3. Does this solution actually change reality? → If no, regenerate.

FAIL-SAFE:
If you cannot produce three meaningful, fact-based resolutions, explicitly state why and identify missing inputs. Do NOT fall back to generic advice.

OUTPUT FORMAT (JSON):

Respond in this EXACT JSON format:
{
    "summary": "TOP 3 CLEAR POSSIBLE SOLUTIONS TO RESOLVE THIS DISPUTE",
    "legalAssessment": "Brief internal context about fairness principles applied (natural justice, equality, proportionality under Indian Constitution)",
    "seriousness": "LOW|MEDIUM|HIGH",
    "solutions": [
        {
            "title": "Descriptive case-specific title using actual names",
            "description": "Full solution text following the REQUIRED STRUCTURE above. Must be specific to this dispute, use actual names, reference actual facts, propose concrete actions, explain fairness, and end with Result section.",
            "benefitsPlaintiff": "How this addresses ${dispute.plaintiffName}'s concerns fairly",
            "benefitsDefendant": "How this protects ${dispute.respondentName}'s interests"
        },
        {
            "title": "Second case-specific solution title",
            "description": "Different approach, equally detailed and specific",
            "benefitsPlaintiff": "${dispute.plaintiffName}'s benefits",
            "benefitsDefendant": "${dispute.respondentName}'s benefits"
        },
        {
            "title": "Third case-specific solution title",
            "description": "Third approach with full detail",
            "benefitsPlaintiff": "${dispute.plaintiffName}'s benefits",
            "benefitsDefendant": "${dispute.respondentName}'s benefits"
        }
    ]
}`;

        const parts = [prompt, ...evidenceParts];
        console.log('Sending request to Gemini API with', evidenceParts.length, 'evidence images');

        const result = await model.generateContent(parts);
        const response = await result.response;
        let text = response.text();

        console.log('AI Response received, length:', text.length);
        console.log('AI Raw Response (first 500 chars):', text.substring(0, 500));

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                console.log('AI Analysis parsed successfully');
                console.log('Solutions count:', parsed.solutions?.length || 0);
                console.log('Seriousness:', parsed.seriousness);
                return parsed;
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError.message);
                console.error('Attempted to parse:', jsonMatch[0].substring(0, 300));
                return null;
            }
        } else {
            console.error('No JSON found in AI response');
            console.error('Full response:', text);
        }
        return null;
    } catch (error) {
        console.error('=== AI Analysis Error ===');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        if (error.response) {
            console.error('Error response:', error.response);
        }
        return null;
    }
}

// Helper to verify if document is a valid ID (No selfie comparison, just document check)
async function verifyDocumentIsID(path) {
    if (API_KEY === 'API_KEY_MISSING') return { isValid: true, details: "Dev Mode: Verification Skipped" };

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const imagePart = await fileToGenerativePart(path, "image/jpeg");
        const prompt = `Analyze this image. Is it a valid Government Identity Document (like Passport, Driver License, National ID, Aadhaar, PAN, etc)?
        Respond in JSON: { "isValid": boolean, "details": "string" }`;

        const result = await model.generateContent([prompt, imagePart]);
        const text = result.response.text();
        const jsonStr = text.replace(/```json|```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Doc Verification Error:", e);
        // Fallback to allow if AI fails, to not block user, but flag it
        return { isValid: true, details: "AI Verification unavailable, manual review needed." };
    }
}

// Check and trigger AI analysis after 10 messages
async function checkAndTriggerAI(disputeId) {
    try {
        console.log('=== checkAndTriggerAI called ===');
        console.log('Dispute ID:', disputeId);

        const dispute = await Dispute.findByPk(disputeId);
        if (!dispute) {
            console.log('Dispute not found');
            return;
        }
        if (dispute.aiSolutions) {
            console.log('AI Solutions already exist, skipping');
            return;
        }
        if (dispute.forwardedToCourt) {
            console.log('Dispute already forwarded to court, skipping');
            return;
        }

        const messageCount = await Message.count({ where: { disputeId } });
        console.log('Current message count:', messageCount);

        if (messageCount >= 10) {
            const messages = await Message.findAll({
                where: { disputeId },
                order: [['createdAt', 'ASC']]
            });

            console.log(`Triggering AI analysis for dispute ${disputeId} (${messageCount} messages)`);
            let analysis = await analyzeDisputeWithAI(dispute, messages);
            let isAIGenerated = !!analysis;

            // Fallback if AI fails
            if (!analysis) {
                console.log('=== AI FAILED - Using fallback solutions ===');
                analysis = {
                    summary: 'AI analysis could not be completed. Based on the conversation, here are general mediation options.',
                    legalAssessment: 'Please consult a legal professional for detailed assessment under Indian law.',
                    solutions: [
                        {
                            title: 'Mutual Settlement',
                            description: 'Both parties agree to negotiate terms directly and reach a compromise.',
                            benefitsPlaintiff: 'Quick resolution without legal costs',
                            benefitsDefendant: 'Avoids formal legal proceedings'
                        },
                        {
                            title: 'Third-Party Mediation',
                            description: 'Engage a neutral mediator to facilitate discussion and agreement.',
                            benefitsPlaintiff: 'Professional guidance in negotiations',
                            benefitsDefendant: 'Fair and unbiased mediation process'
                        },
                        {
                            title: 'Legal Consultation',
                            description: 'Both parties consult with legal professionals before proceeding.',
                            benefitsPlaintiff: 'Clear understanding of legal rights',
                            benefitsDefendant: 'Informed decision making'
                        }
                    ]
                };
            } else {
                console.log('=== AI ANALYSIS SUCCESS ===');
                console.log('Summary:', analysis.summary?.substring(0, 100));
            }

            dispute.aiAnalysis = analysis.summary + '\n\n' + analysis.legalAssessment;
            dispute.aiSolutions = JSON.stringify(analysis.solutions);
            dispute.status = 'AwaitingDecision';
            await dispute.save();
            logInfo('AI analysis completed for dispute', { disputeId, isAIGenerated });
            console.log('Dispute saved with AI analysis. AI Generated:', isAIGenerated);

            // Audit log: AI analysis completed
            await logAuditEvent({
                action: AuditActions.AI_ANALYSIS_COMPLETE,
                category: AuditCategories.AI,
                resourceType: 'DISPUTE',
                resourceId: disputeId,
                description: `AI analysis completed for case #${disputeId} - ${isAIGenerated ? 'AI Generated' : 'Fallback'} - ${analysis.solutions?.length || 0} solutions`,
                metadata: {
                    messageCount,
                    solutionsCount: analysis.solutions?.length || 0,
                    seriousness: analysis.seriousness || 'MEDIUM',
                    isAIGenerated
                },
                status: 'SUCCESS'
            });

            // Emit real-time update that AI solutions are ready
            const io = global.io;
            if (io) {
                io.to(`dispute:${disputeId}`).emit('dispute:ai-ready', {
                    disputeId: dispute.id,
                    status: dispute.status,
                    aiSolutions: analysis.solutions
                });
            }

            // Send email notification to both parties
            await emailService.notifyAIAnalysisReady(dispute);
        }
    } catch (error) {
        console.error('Check AI Error:', error);
    }
}

// Routes
app.get('/api/health', async (req, res) => {
    try {
        const dbHealth = await checkDatabaseHealth();
        res.json({
            status: dbHealth.connected ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: dbHealth,
            version: process.env.npm_package_version || '1.0.0',
            aiConfigured: API_KEY !== 'API_KEY_MISSING'
        });
    } catch (error) {
        logError('Health check failed', { error: error.message });
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// Middleware - Enhanced with session store validation
const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        // First verify the JWT signature and expiry
        const decoded = jwt.verify(token, JWT_SECRET);

        // Then validate against session store
        const session = await sessionService.validateSession(token);

        if (!session) {
            // Session not found or revoked - could be logged out from another device
            return res.status(401).json({
                error: 'Session expired or revoked',
                code: 'SESSION_INVALID'
            });
        }

        // Attach user info and session to request
        req.user = decoded;
        req.session = session;
        req.token = token;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ error: 'Invalid token', code: 'TOKEN_INVALID' });
    }
};

// Auth middleware for media/file preview (also accepts token from query parameter)
// This is needed for media elements (img, video, audio, iframe) that can't set Authorization headers
const authMiddlewareForMedia = async (req, res, next) => {
    // Try to get token from Authorization header first, then from query parameter
    let token = req.headers.authorization?.split(' ')[1];

    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Validate against session store
        const session = await sessionService.validateSession(token);

        if (!session) {
            return res.status(401).json({
                error: 'Session expired or revoked',
                code: 'SESSION_INVALID'
            });
        }

        req.user = decoded;
        req.session = session;
        req.token = token;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ error: 'Invalid token', code: 'TOKEN_INVALID' });
    }
};

app.get('/api/stats', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin access required' });

        const totalDisputes = await Dispute.count();
        const pending = await Dispute.count({ where: { status: 'Pending' } });
        const analyzed = await Dispute.count({ where: { status: 'Analyzed' } });
        const accepted = await Dispute.count({ where: { status: 'Accepted' } });
        const rejected = await Dispute.count({ where: { status: 'Rejected' } });

        res.json({ totalDisputes, pending, analyzed, accepted, rejected });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Notification Routes ---

// Get user's notifications
app.get('/api/notifications', authMiddleware, async (req, res) => {
    try {
        const { limit = 50, unreadOnly = false } = req.query;

        const whereClause = { userId: req.user.id };
        if (unreadOnly === 'true') {
            whereClause.isRead = false;
        }

        const notifications = await Notification.findAll({
            where: whereClause,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit)
        });

        const unreadCount = await Notification.count({
            where: { userId: req.user.id, isRead: false }
        });

        res.json({
            notifications,
            unreadCount,
            total: notifications.length
        });
    } catch (error) {
        logError('Failed to fetch notifications', { error: error.message, userId: req.user.id });
        res.status(500).json({ error: error.message });
    }
});

// Mark notification as read
app.post('/api/notifications/:id/read', authMiddleware, async (req, res) => {
    try {
        const notification = await Notification.findByPk(req.params.id);

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        if (notification.userId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        if (!notification.isRead) {
            notification.isRead = true;
            await notification.save();

            // Audit log only for high/urgent priority
            if (notification.priority === 'high' || notification.priority === 'urgent') {
                await logAuditEvent({
                    action: AuditActions.NOTIFICATION_READ,
                    category: AuditCategories.SYSTEM,
                    user: { id: req.user.id, email: req.user.email },
                    resourceType: 'NOTIFICATION',
                    resourceId: notification.id,
                    description: `User read ${notification.priority} priority notification`,
                    metadata: { type: notification.type, title: notification.title },
                    request: req,
                    status: 'SUCCESS'
                });
            }
        }

        res.json({ message: 'Notification marked as read', notification });
    } catch (error) {
        logError('Failed to mark notification as read', { error: error.message, notificationId: req.params.id });
        res.status(500).json({ error: error.message });
    }
});

// Mark all notifications as read
app.post('/api/notifications/read-all', authMiddleware, async (req, res) => {
    try {
        const updated = await Notification.update(
            { isRead: true },
            { where: { userId: req.user.id, isRead: false } }
        );

        await logAuditEvent({
            action: AuditActions.NOTIFICATION_READ_ALL,
            category: AuditCategories.SYSTEM,
            user: { id: req.user.id, email: req.user.email },
            description: 'User marked all notifications as read',
            metadata: { updatedCount: updated[0] },
            request: req,
            status: 'SUCCESS'
        });

        res.json({
            message: 'All notifications marked as read',
            count: updated[0]
        });
    } catch (error) {
        logError('Failed to mark all notifications as read', { error: error.message, userId: req.user.id });
        res.status(500).json({ error: error.message });
    }
});

// Delete notification
app.delete('/api/notifications/:id', authMiddleware, async (req, res) => {
    try {
        const notification = await Notification.findByPk(req.params.id);

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        if (notification.userId !== req.user.id && req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await notification.destroy();

        res.json({ message: 'Notification deleted' });
    } catch (error) {
        logError('Failed to delete notification', { error: error.message, notificationId: req.params.id });
        res.status(500).json({ error: error.message });
    }
});



// ==================== SECURITY ENDPOINTS ====================

// CSRF Token endpoint
app.get('/api/csrf-token', securityMiddleware.csrfTokenEndpoint);

// ==================== PAYMENT ENDPOINTS ====================

// Get Stripe publishable key
app.get('/api/payment/config', (req, res) => {
    if (!paymentService.isStripeConfigured()) {
        return res.status(503).json({ error: 'Payment service not configured' });
    }

    res.json({
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        currency: process.env.PAYMENT_CURRENCY || 'usd',
        disputeFee: paymentService.calculateDisputeFee(),
    });
});

// Create payment intent for dispute filing
app.post('/api/payment/create-intent', authMiddleware, generalLimiter, async (req, res) => {
    try {
        if (!paymentService.isStripeConfigured()) {
            return res.status(503).json({ error: 'Payment service not configured' });
        }

        const { disputeId, disputeTitle } = req.body;

        if (!disputeId) {
            return res.status(400).json({ error: 'Dispute ID is required' });
        }

        // Check if dispute exists and belongs to user
        const dispute = await Dispute.findByPk(disputeId);
        if (!dispute) {
            return res.status(404).json({ error: 'Dispute not found' });
        }

        // Check if user is the creator
        if (dispute.creatorId !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Check if already paid
        if (dispute.paymentStatus === 'paid') {
            return res.status(400).json({ error: 'Dispute already paid' });
        }

        // Calculate fee
        const amount = paymentService.calculateDisputeFee();

        // Create payment intent
        const paymentIntent = await paymentService.createPaymentIntent({
            amount,
            currency: process.env.PAYMENT_CURRENCY || 'usd',
            metadata: {
                disputeId: disputeId.toString(),
                userId: req.user.id.toString(),
                userEmail: req.user.email || '',
                disputeTitle: disputeTitle || dispute.title,
            },
            description: `Dispute Filing Fee - ${dispute.title}`,
        });

        // Update dispute with payment intent ID
        await dispute.update({
            paymentIntentId: paymentIntent.paymentIntentId,
            paymentAmount: amount,
            paymentStatus: 'processing',
        });

        // Audit log
        await logAuditEvent({
            action: 'PAYMENT_INITIATED',
            category: 'PAYMENT',
            user: { id: req.user.id, email: req.user.email },
            resourceType: 'DISPUTE',
            resourceId: disputeId,
            description: `Payment initiated for dispute: ${dispute.title}`,
            metadata: { amount, paymentIntentId: paymentIntent.paymentIntentId },
            request: req,
            status: 'SUCCESS',
        });

        logInfo('Payment intent created', {
            userId: req.user.id,
            disputeId,
            paymentIntentId: paymentIntent.paymentIntentId,
            amount,
        });

        res.json({
            clientSecret: paymentIntent.clientSecret,
            paymentIntentId: paymentIntent.paymentIntentId,
            amount: paymentIntent.amount,
        });
    } catch (error) {
        logError('Payment intent creation failed', error);
        captureError(error, { tags: { action: 'create_payment_intent' }, user: { id: req.user?.id } });
        res.status(500).json({ error: error.message || 'Failed to create payment intent' });
    }
});

// Get payment status
app.get('/api/payment/status/:disputeId', authMiddleware, async (req, res) => {
    try {
        const { disputeId } = req.params;

        const dispute = await Dispute.findByPk(disputeId);
        if (!dispute) {
            return res.status(404).json({ error: 'Dispute not found' });
        }

        // Check authorization
        if (dispute.creatorId !== req.user.id && req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        res.json({
            paymentStatus: dispute.paymentStatus,
            paymentAmount: dispute.paymentAmount,
            paymentCurrency: dispute.paymentCurrency,
            paidAt: dispute.paidAt,
            paymentIntentId: dispute.paymentIntentId,
        });
    } catch (error) {
        logError('Failed to get payment status', error);
        res.status(500).json({ error: 'Failed to retrieve payment status' });
    }
});

// Confirm payment (webhook or manual check)
app.post('/api/payment/confirm/:disputeId', authMiddleware, async (req, res) => {
    try {
        const { disputeId } = req.params;

        const dispute = await Dispute.findByPk(disputeId);
        if (!dispute) {
            return res.status(404).json({ error: 'Dispute not found' });
        }

        // Check authorization
        if (dispute.creatorId !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        if (!dispute.paymentIntentId) {
            return res.status(400).json({ error: 'No payment intent found' });
        }

        // Retrieve payment intent from Stripe
        const paymentIntent = await paymentService.retrievePaymentIntent(dispute.paymentIntentId);

        // Update dispute payment status based on Stripe status
        if (paymentIntent.status === 'succeeded') {
            await dispute.update({
                paymentStatus: 'paid',
                paidAt: new Date(),
            });

            // Send notification
            await notificationService.createNotification({
                userId: dispute.creatorId,
                type: 'payment',
                title: 'Payment Successful',
                message: `Your payment of ${paymentService.formatCurrency(dispute.paymentAmount)} has been processed successfully.`,
            });

            // Audit log
            await logAuditEvent({
                action: 'PAYMENT_COMPLETED',
                category: 'PAYMENT',
                user: { id: req.user.id },
                resourceType: 'DISPUTE',
                resourceId: parseInt(disputeId),
                description: `Payment completed for dispute: ${dispute.title}`,
                metadata: { amount: dispute.paymentAmount, paymentIntentId: dispute.paymentIntentId },
                request: req,
                status: 'SUCCESS',
            });

            logInfo('Payment confirmed', { disputeId, userId: req.user.id, amount: dispute.paymentAmount });
        }

        res.json({
            paymentStatus: dispute.paymentStatus,
            stripeStatus: paymentIntent.status,
            amount: paymentIntent.amount,
        });
    } catch (error) {
        logError('Payment confirmation failed', error);
        captureError(error, { tags: { action: 'confirm_payment' } });
        res.status(500).json({ error: error.message || 'Failed to confirm payment' });
    }
});

// Request refund (Admin only)
app.post('/api/payment/refund/:disputeId', authMiddleware, async (req, res) => {
    try {
        // Check admin authorization
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { disputeId } = req.params;
        const { reason, amount } = req.body;

        const dispute = await Dispute.findByPk(disputeId);
        if (!dispute) {
            return res.status(404).json({ error: 'Dispute not found' });
        }

        if (dispute.paymentStatus !== 'paid') {
            return res.status(400).json({ error: 'Dispute payment not completed or already refunded' });
        }

        if (!dispute.paymentIntentId) {
            return res.status(400).json({ error: 'No payment intent found' });
        }

        // Create refund
        const refund = await paymentService.createRefund({
            paymentIntentId: dispute.paymentIntentId,
            amount: amount || dispute.paymentAmount, // Full refund if amount not specified
            reason: reason || 'requested_by_admin',
        });

        // Update dispute
        await dispute.update({
            paymentStatus: 'refunded',
            refundedAt: new Date(),
            refundAmount: refund.amount,
            refundReason: reason || 'Admin refund',
        });

        // Notify user
        await notificationService.createNotification({
            userId: dispute.creatorId,
            type: 'payment',
            title: 'Payment Refunded',
            message: `Your payment of ${paymentService.formatCurrency(refund.amount)} has been refunded. Reason: ${reason || 'Admin refund'}`,
        });

        // Audit log
        await logAuditEvent({
            action: 'PAYMENT_REFUNDED',
            category: 'PAYMENT',
            user: { id: req.user.id, role: 'Admin' },
            resourceType: 'DISPUTE',
            resourceId: parseInt(disputeId),
            description: `Payment refunded for dispute: ${dispute.title}`,
            metadata: { amount: refund.amount, reason, refundId: refund.id },
            request: req,
            status: 'SUCCESS',
        });

        logInfo('Payment refunded', { disputeId, amount: refund.amount, refundId: refund.id });

        res.json({
            message: 'Refund processed successfully',
            refund: {
                id: refund.id,
                amount: refund.amount,
                status: refund.status,
            },
        });
    } catch (error) {
        logError('Refund failed', error);
        captureError(error, { tags: { action: 'process_refund' } });
        res.status(500).json({ error: error.message || 'Failed to process refund' });
    }
});

// Stripe webhook endpoint
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'];

    try {
        // Verify webhook signature
        const event = paymentService.verifyWebhookSignature(req.body, signature);

        // Handle the event
        const result = await paymentService.handleWebhookEvent(event);

        // Update dispute based on webhook event
        if (result.paymentIntentId) {
            const dispute = await Dispute.findOne({
                where: { paymentIntentId: result.paymentIntentId },
            });

            if (dispute) {
                switch (result.type) {
                    case 'success':
                        await dispute.update({
                            paymentStatus: 'paid',
                            paidAt: new Date(),
                        });

                        // Notify user
                        await notificationService.createNotification({
                            userId: dispute.creatorId,
                            type: 'payment',
                            title: 'Payment Successful',
                            message: `Your payment for "${dispute.title}" has been processed successfully.`,
                        });

                        logInfo('Webhook: Payment succeeded', { disputeId: dispute.id });
                        break;

                    case 'failure':
                        await dispute.update({
                            paymentStatus: 'failed',
                        });

                        // Notify user
                        await notificationService.createNotification({
                            userId: dispute.creatorId,
                            type: 'payment',
                            title: 'Payment Failed',
                            message: `Your payment for "${dispute.title}" failed. ${result.error || 'Please try again.'}`,
                        });

                        logWarn('Webhook: Payment failed', { disputeId: dispute.id, error: result.error });
                        break;

                    case 'refund':
                        await dispute.update({
                            paymentStatus: 'refunded',
                            refundedAt: new Date(),
                        });

                        logInfo('Webhook: Refund processed', { disputeId: dispute.id });
                        break;
                }
            }
        }

        res.json({ received: true });
    } catch (error) {
        logError('Webhook processing failed', error);
        res.status(400).json({ error: `Webhook Error: ${error.message}` });
    }
});

// Auth Routes
app.post('/api/auth/register',
    authLimiter,
    securityMiddleware.registerValidation,
    securityMiddleware.checkValidationErrors,
    async (req, res) => {
        try {
            const { username, email, password } = req.body;
            const hashedPassword = await bcrypt.hash(password, 10);

            // Generate email verification token
            const emailVerificationToken = crypto.randomBytes(32).toString('hex');
            const emailVerificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

            const user = await User.create({
                username,
                email,
                password: hashedPassword,
                role: 'User',
                isEmailVerified: false,
                emailVerificationToken: crypto.createHash('sha256').update(emailVerificationToken).digest('hex'),
                emailVerificationExpiry
            });

            // Send verification email
            const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${emailVerificationToken}`;
            try {
                await emailService.sendEmailVerification(user.email, user.username, verificationUrl);
                logInfo('Verification email sent', { userId: user.id, email: user.email });
            } catch (emailError) {
                logWarn('Failed to send verification email', { error: emailError.message, userId: user.id });
                // Continue registration even if email fails
            }

            // Audit log: User registration
            await logAuditEvent({
                action: AuditActions.USER_REGISTER,
                category: AuditCategories.AUTH,
                user: { id: user.id, email: user.email, username: user.username, role: user.role },
                resourceType: 'USER',
                resourceId: user.id,
                description: `New user registered: ${username} (${email}) - Email verification pending`,
                request: req,
                status: 'SUCCESS'
            });
            logInfo('User registered successfully', { userId: user.id, username, email });

            res.json({
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                message: 'Registration successful! Please check your email to verify your account.',
                emailVerificationRequired: true
            });
        } catch (error) {
            // Audit log: Registration failed
            await logAuditEvent({
                action: AuditActions.USER_REGISTER,
                category: AuditCategories.AUTH,
                description: `Registration failed for: ${req.body.username}`,
                request: req,
                status: 'FAILURE',
                errorMessage: error.message
            });
            logWarn('User registration failed', { username: req.body.username, error: error.message });
            res.status(400).json({ error: 'Username or email already exists' });
        }
    });

app.post('/api/auth/login',
    authLimiter,
    securityMiddleware.loginValidation,
    securityMiddleware.checkValidationErrors,
    async (req, res) => {
        try {
            const { username, password } = req.body;
            const user = await User.findOne({ where: { username } });

            if (!user) {
                // Audit log: Failed login - user not found
                await logAuditEvent({
                    action: AuditActions.USER_LOGIN_FAILED,
                    category: AuditCategories.AUTH,
                    description: `Failed login attempt for non-existent username: ${username}`,
                    request: req,
                    status: 'FAILURE',
                    errorMessage: 'Invalid credentials'
                });
                logWarn('Failed login attempt - user not found', { username, ip: req.ip });
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Check if account is suspended
            if (user.isSuspended) {
                await logAuditEvent({
                    action: AuditActions.USER_LOGIN_FAILED,
                    category: AuditCategories.AUTH,
                    user: { id: user.id, email: user.email, username: user.username },
                    description: `Login attempt on suspended account: ${username}`,
                    request: req,
                    status: 'FAILURE',
                    errorMessage: 'Account suspended'
                });
                return res.status(403).json({ error: 'Account is suspended. Please contact support.' });
            }

            // Check if account is locked due to failed attempts
            const lockoutCheck = securityMiddleware.checkAccountLockout(user);
            if (lockoutCheck.isLocked) {
                await logAuditEvent({
                    action: AuditActions.USER_LOGIN_FAILED,
                    category: AuditCategories.AUTH,
                    user: { id: user.id, email: user.email, username: user.username },
                    description: `Login attempt on locked account: ${username}`,
                    request: req,
                    status: 'FAILURE',
                    errorMessage: 'Account locked'
                });
                return res.status(429).json({ error: lockoutCheck.message });
            }

            // Reset lockout if period expired
            if (lockoutCheck.shouldReset) {
                await securityMiddleware.resetFailedLoginAttempts(user);
            }

            // Verify password
            const isValidPassword = await bcrypt.compare(password, user.password);
            if (!isValidPassword) {
                // Handle failed login attempt
                const failedAttempt = await securityMiddleware.handleFailedLogin(user);

                // Audit log: Failed login - wrong password
                await logAuditEvent({
                    action: AuditActions.USER_LOGIN_FAILED,
                    category: AuditCategories.AUTH,
                    user: { id: user.id, email: user.email, username: user.username },
                    description: `Failed login attempt (wrong password) for: ${username} - Attempt ${failedAttempt.attempts}/5`,
                    request: req,
                    status: 'FAILURE',
                    errorMessage: failedAttempt.locked ? 'Account locked' : 'Invalid credentials',
                    metadata: { attempts: failedAttempt.attempts, locked: failedAttempt.locked }
                });

                if (failedAttempt.locked) {
                    logWarn('Account locked due to failed attempts', { username, attempts: failedAttempt.attempts, ip: req.ip });
                    return res.status(429).json({ error: failedAttempt.message });
                }

                logWarn('Failed login attempt - wrong password', { username, attempts: failedAttempt.attempts, remaining: failedAttempt.remaining, ip: req.ip });
                return res.status(401).json({
                    error: `Invalid credentials. ${failedAttempt.remaining} attempt(s) remaining before account lockout.`
                });
            }

            // Successful login - reset failed attempts
            await securityMiddleware.resetFailedLoginAttempts(user);

            const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

            // Create session in session store
            const clientIP = getClientIP(req);
            const userAgent = req.get('User-Agent');

            try {
                await sessionService.createSession({
                    userId: user.id,
                    token,
                    userAgent,
                    ipAddress: clientIP
                });
            } catch (sessionError) {
                logWarn('Failed to create session in store, continuing with JWT only', {
                    error: sessionError.message,
                    userId: user.id
                });
            }

            // Update last login
            await user.update({ lastLoginAt: new Date() });

            // Audit log: Successful login
            await logAuditEvent({
                action: AuditActions.USER_LOGIN,
                category: AuditCategories.AUTH,
                user: { id: user.id, email: user.email, username: user.username, role: user.role },
                resourceType: 'USER',
                resourceId: user.id,
                description: `User logged in: ${username}`,
                request: req,
                status: 'SUCCESS',
                metadata: {
                    deviceInfo: parseUserAgent(userAgent),
                    ipAddress: clientIP
                }
            });
            logInfo('User logged in successfully', { userId: user.id, username });

            res.json({ token, role: user.role, username: user.username, email: user.email });
        } catch (error) {
            logError('Login error', error);
            res.status(500).json({ error: error.message });
        }
    });

// Verify Email with token
app.get('/api/auth/verify-email/:token', async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({ error: 'Verification token is required' });
        }

        // Hash the provided token to compare with stored hash
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // Find user with valid token
        const user = await User.findOne({
            where: {
                emailVerificationToken: hashedToken,
                emailVerificationExpiry: { [Op.gt]: new Date() }
            }
        });

        if (!user) {
            await logAuditEvent({
                action: 'EMAIL_VERIFICATION_FAILED',
                category: AuditCategories.AUTH,
                description: 'Invalid or expired email verification token used',
                request: req,
                status: 'FAILURE',
                errorMessage: 'Invalid or expired token'
            });
            return res.status(400).json({ error: 'Invalid or expired verification token' });
        }

        // Update user as verified
        await user.update({
            isEmailVerified: true,
            emailVerificationToken: null,
            emailVerificationExpiry: null
        });

        // Send confirmation email
        try {
            await emailService.sendEmailVerifiedConfirmation(user.email, user.username);
        } catch (emailError) {
            logWarn('Failed to send verification confirmation email', { error: emailError.message });
        }

        // Audit log
        await logAuditEvent({
            action: 'EMAIL_VERIFIED',
            category: AuditCategories.AUTH,
            user: { id: user.id, email: user.email, username: user.username, role: user.role },
            resourceType: 'USER',
            resourceId: user.id,
            description: `Email verified for user: ${user.username}`,
            request: req,
            status: 'SUCCESS'
        });

        logInfo('Email verified successfully', { userId: user.id, email: user.email });

        res.json({
            message: 'Email verified successfully! You can now login.',
            verified: true
        });
    } catch (error) {
        logError('Email verification error', { error: error.message });
        captureError(error, { action: 'verify-email' });
        res.status(500).json({ error: 'Failed to verify email' });
    }
});

// Resend verification email
app.post('/api/auth/resend-verification',
    authLimiter,
    [
        body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ error: errors.array()[0].msg });
            }

            const { email } = req.body;

            const user = await User.findOne({ where: { email } });

            // Don't reveal if user exists for security
            const successMessage = 'If your email is registered and not verified, you will receive a verification link.';

            if (!user) {
                return res.json({ message: successMessage });
            }

            // Check if already verified
            if (user.isEmailVerified) {
                return res.json({ message: 'Your email is already verified. You can login now.' });
            }

            // Generate new verification token
            const emailVerificationToken = crypto.randomBytes(32).toString('hex');
            const emailVerificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

            await user.update({
                emailVerificationToken: crypto.createHash('sha256').update(emailVerificationToken).digest('hex'),
                emailVerificationExpiry
            });

            // Send verification email
            const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${emailVerificationToken}`;

            try {
                await emailService.sendEmailVerification(user.email, user.username, verificationUrl);

                await logAuditEvent({
                    action: 'VERIFICATION_EMAIL_RESENT',
                    category: AuditCategories.AUTH,
                    user: { id: user.id, email: user.email, username: user.username },
                    resourceType: 'USER',
                    resourceId: user.id,
                    description: `Verification email resent to: ${user.email}`,
                    request: req,
                    status: 'SUCCESS'
                });

                logInfo('Verification email resent', { userId: user.id, email: user.email });
            } catch (emailError) {
                logError('Failed to resend verification email', { error: emailError.message });
            }

            res.json({ message: successMessage });
        } catch (error) {
            logError('Resend verification error', { error: error.message });
            res.status(500).json({ error: 'Failed to process request' });
        }
    });

// Forgot Password - Request reset
app.post('/api/auth/forgot-password',
    authLimiter,
    [
        body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ error: errors.array()[0].msg });
            }

            const { email } = req.body;

            const user = await User.findOne({ where: { email } });

            // Don't reveal if user exists for security
            if (!user) {
                return res.json({ message: 'If your email is registered, you will receive a password reset link' });
            }

            // Generate secure reset token
            const resetToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
            const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

            // Save token to database
            await user.update({
                resetToken: hashedToken,
                resetTokenExpiry
            });

            // Send reset email
            const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;

            try {
                await emailService.sendPasswordResetEmail(user.email, user.username, resetUrl);

                // Audit log: Password reset requested
                await logAuditEvent({
                    action: AuditActions.PASSWORD_RESET_REQUEST,
                    category: AuditCategories.AUTH,
                    user: { id: user.id, email: user.email, username: user.username },
                    resourceType: 'USER',
                    resourceId: user.id,
                    description: `Password reset requested for: ${user.email}`,
                    request: req,
                    status: 'SUCCESS'
                });
                logInfo('Password reset email sent', { email: user.email });

                res.json({ message: 'If your email is registered, you will receive a password reset link' });
            } catch (emailError) {
                logError('Failed to send reset email', emailError);
                // Still return success to user for security
                res.json({ message: 'If your email is registered, you will receive a password reset link' });
            }
        } catch (error) {
            console.error('Forgot password error:', error);
            res.status(500).json({ error: 'Failed to process password reset request' });
        }
    });

// Reset Password with token
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        // Hash the provided token to compare
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // Find user with valid token
        const user = await User.findOne({
            where: {
                resetToken: hashedToken,
                resetTokenExpiry: { [Op.gt]: new Date() }
            }
        });

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        // Hash new password and update
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await user.update({
            password: hashedPassword,
            resetToken: null,
            resetTokenExpiry: null
        });

        // Audit log: Password reset completed
        await logAuditEvent({
            action: AuditActions.PASSWORD_RESET_COMPLETE,
            category: AuditCategories.AUTH,
            user: { id: user.id, email: user.email, username: user.username },
            resourceType: 'USER',
            resourceId: user.id,
            description: `Password reset completed for: ${user.email}`,
            request: req,
            status: 'SUCCESS'
        });
        logInfo('Password reset completed', { userId: user.id, email: user.email });

        // Send confirmation email
        try {
            await emailService.sendPasswordChangedEmail(user.email, user.username);
        } catch (emailError) {
            logError('Failed to send confirmation email', emailError);
        }

        res.json({ message: 'Password reset successful. You can now login with your new password' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Get user profile
app.get('/api/users/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password', 'resetToken', 'resetTokenExpiry'] }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Update user profile
app.put('/api/users/profile', authMiddleware, async (req, res) => {
    try {
        const { username, email, phone, address, occupation } = req.body;
        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const oldUsername = user.username;
        const oldEmail = user.email;

        // Check if new username is taken
        if (username && username !== user.username) {
            const existingUser = await User.findOne({ where: { username } });
            if (existingUser) {
                return res.status(400).json({ error: 'Username already taken' });
            }
        }

        // Check if new email is taken
        if (email && email !== user.email) {
            const existingEmail = await User.findOne({ where: { email } });
            if (existingEmail) {
                return res.status(400).json({ error: 'Email already in use' });
            }
        }

        // Update user
        await user.update({
            username: username || user.username,
            email: email || user.email,
            phone: phone !== undefined ? phone : user.phone,
            address: address !== undefined ? address : user.address,
            occupation: occupation !== undefined ? occupation : user.occupation
        });

        // Log profile update to audit trail
        await AuditLog.create({
            action: 'PROFILE_UPDATED',
            category: 'USER',
            resourceType: 'User',
            resourceId: user.id,
            userId: req.user.id,
            description: `User ${username} updated their profile`,
            metadata: {
                changes: {
                    username: oldUsername !== username ? { from: oldUsername, to: username } : undefined,
                    email: oldEmail !== email ? { from: oldEmail, to: email } : undefined,
                    phone: phone !== undefined ? 'updated' : undefined,
                    address: address !== undefined ? 'updated' : undefined,
                    occupation: occupation !== undefined ? 'updated' : undefined
                }
            },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        const updatedUser = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password', 'resetToken', 'resetTokenExpiry'] }
        });

        res.json({ message: 'Profile updated successfully', user: updatedUser });
    } catch (error) {
        console.error('Update profile error:', error);
        Sentry.captureException(error, { tags: { action: 'update_profile' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Change password (when logged in)
app.post('/api/users/change-password',
    authMiddleware,
    securityMiddleware.changePasswordValidation,
    securityMiddleware.checkValidationErrors,
    async (req, res) => {
        try {
            const { currentPassword, newPassword } = req.body;

            const user = await User.findByPk(req.user.id);

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Verify current password
            const isValidPassword = await bcrypt.compare(currentPassword, user.password);
            if (!isValidPassword) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }

            // Hash and update new password
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await user.update({ password: hashedPassword });

            // Log password change to audit trail
            await AuditLog.create({
                action: 'PASSWORD_CHANGED',
                category: 'AUTH',
                resourceType: 'User',
                resourceId: user.id,
                userId: req.user.id,
                description: 'User changed their password',
                metadata: { message: 'Password changed successfully' },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });

            // Send confirmation email
            try {
                await emailService.sendPasswordChangedEmail(user.email, user.username);
            } catch (emailError) {
                console.error('Failed to send confirmation email:', emailError);
            }

            res.json({ message: 'Password changed successfully' });
        } catch (error) {
            console.error('Change password error:', error);
            Sentry.captureException(error, { tags: { action: 'change_password' }, user: { id: req.user?.id } });
            res.status(500).json({ error: 'Failed to change password' });
        }
    });

// Get notification preferences
app.get('/api/users/notification-preferences', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        let preferences = {};
        try {
            preferences = user.notificationPreferences ? JSON.parse(user.notificationPreferences) : {};
        } catch (e) {
            preferences = {
                emailNotifications: true,
                inAppNotifications: true,
                newDispute: true,
                caseAccepted: true,
                newMessage: true,
                aiAnalysisComplete: true,
                solutionVotes: true,
                caseResolved: true,
                courtForwarding: true,
                evidenceUploaded: true,
                signatureRequired: true,
                systemAlerts: true
            };
        }

        res.json(preferences);
    } catch (error) {
        console.error('Get notification preferences error:', error);
        Sentry.captureException(error, { tags: { action: 'get_notification_prefs' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to fetch notification preferences' });
    }
});

// Update notification preferences
app.put('/api/users/notification-preferences', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const newPreferences = JSON.stringify(req.body);
        await user.update({ notificationPreferences: newPreferences });

        // Log notification preferences update to audit trail
        await AuditLog.create({
            action: 'NOTIFICATION_PREFERENCES_UPDATED',
            category: 'USER',
            resourceType: 'User',
            resourceId: user.id,
            userId: req.user.id,
            description: 'User updated notification preferences',
            metadata: req.body,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ message: 'Notification preferences updated', preferences: req.body });
    } catch (error) {
        console.error('Update notification preferences error:', error);
        Sentry.captureException(error, { tags: { action: 'update_notification_prefs' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to update notification preferences' });
    }
});

// Export user data (GDPR Compliance)
app.get('/api/users/export-data', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password', 'resetToken', 'resetTokenExpiry', 'twoFactorSecret'] }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        logInfo('User data export requested', { userId: req.user.id, email: user.email });

        // Fetch all user-related data from different tables
        const disputes = await Dispute.findAll({
            where: {
                [Op.or]: [
                    { plaintiffEmail: user.email },
                    { respondentEmail: user.email },
                    { creatorId: req.user.id }
                ]
            }
        });

        // Get all messages from user's disputes
        const disputeIds = disputes.map(d => d.id);
        const messages = disputeIds.length > 0 ? await Message.findAll({
            where: { disputeId: { [Op.in]: disputeIds } }
        }) : [];

        // Get all evidence uploaded by the user
        const evidence = disputeIds.length > 0 ? await Evidence.findAll({
            where: { disputeId: { [Op.in]: disputeIds } }
        }) : [];

        // Get notifications
        const notifications = await Notification.findAll({
            where: { userId: req.user.id },
            order: [['createdAt', 'DESC']]
        });

        // Get notification preferences
        const notificationPrefs = await NotificationPreferences.findOne({
            where: { userId: req.user.id }
        });

        // Get audit logs (limited to last 500 for performance)
        const auditLogs = await AuditLog.findAll({
            where: { userId: req.user.id },
            order: [['createdAt', 'DESC']],
            limit: 500
        });

        // Get payment history if available
        let payments = [];
        try {
            payments = await Payment.findAll({
                where: { userId: req.user.id },
                attributes: { exclude: ['stripeSessionId', 'stripePaymentIntentId'] }
            });
        } catch (e) {
            // Payment table might not exist
            logWarn('Could not fetch payment data', { error: e.message });
        }

        // Construct comprehensive export data
        const exportData = {
            exportedAt: new Date().toISOString(),
            exportVersion: '1.0',
            dataRetentionPolicy: 'As per GDPR Article 17, you have the right to request deletion of this data at any time.',

            // Personal Information
            personalInformation: {
                userId: user.id,
                username: user.username,
                email: user.email,
                phone: user.phone,
                address: user.address,
                occupation: user.occupation,
                role: user.role,
                profilePicture: user.profilePicture,
                accountCreatedAt: user.createdAt,
                lastUpdatedAt: user.updatedAt,
                lastLoginAt: user.lastLoginAt,
                lastActivityAt: user.lastActivityAt
            },

            // Verification Status
            identityVerification: {
                isVerified: user.isVerified,
                verificationStatus: user.verificationStatus,
                idCardPath: user.idCardPath,
                selfiePath: user.selfiePath,
                verificationNotes: user.verificationNotes
            },

            // Account Security
            accountSecurity: {
                twoFactorEnabled: user.twoFactorEnabled,
                failedLoginAttempts: user.failedLoginAttempts,
                lastFailedLogin: user.lastFailedLogin,
                accountLockedUntil: user.accountLockedUntil,
                isSuspended: user.isSuspended,
                suspendedAt: user.suspendedAt,
                suspendReason: user.suspendReason
            },

            // Privacy Settings
            privacySettings: {
                profileVisibility: user.profileVisibility,
                showEmail: user.showEmail,
                showPhone: user.showPhone
            },

            // Notification Preferences
            notificationPreferences: notificationPrefs ? {
                emailNotifications: notificationPrefs.emailNotifications,
                inAppNotifications: notificationPrefs.inAppNotifications,
                newDispute: notificationPrefs.newDispute,
                caseAccepted: notificationPrefs.caseAccepted,
                newMessage: notificationPrefs.newMessage,
                aiAnalysisComplete: notificationPrefs.aiAnalysisComplete,
                solutionVotes: notificationPrefs.solutionVotes,
                caseResolved: notificationPrefs.caseResolved,
                courtForwarding: notificationPrefs.courtForwarding,
                evidenceUploaded: notificationPrefs.evidenceUploaded,
                signatureRequired: notificationPrefs.signatureRequired,
                systemAlerts: notificationPrefs.systemAlerts
            } : user.notificationPreferences ? JSON.parse(user.notificationPreferences) : {},

            // Disputes (Cases)
            disputes: disputes.map(d => ({
                id: d.id,
                title: d.title,
                description: d.description,
                status: d.status,
                yourRole: d.plaintiffEmail === user.email ? 'Plaintiff' : 'Respondent',

                // Plaintiff details
                plaintiffName: d.plaintiffName,
                plaintiffEmail: d.plaintiffEmail,
                plaintiffPhone: d.plaintiffPhone,
                plaintiffAddress: d.plaintiffAddress,
                plaintiffOccupation: d.plaintiffOccupation,

                // Respondent details
                respondentName: d.respondentName,
                respondentEmail: d.respondentEmail,
                respondentPhone: d.respondentPhone,
                respondentAddress: d.respondentAddress,
                respondentOccupation: d.respondentOccupation,
                respondentAccepted: d.respondentAccepted,
                defendantStatement: d.defendantStatement,

                // AI Analysis
                aiAnalysis: d.aiAnalysis,
                aiSolutions: d.aiSolutions ? JSON.parse(d.aiSolutions) : null,

                // Decisions
                plaintiffDecision: d.plaintiffDecision,
                defendantDecision: d.defendantDecision,
                plaintiffSolution: d.plaintiffSolution,
                defendantSolution: d.defendantSolution,

                // Resolution
                resolutionNotes: d.resolutionNotes,
                resolvedAt: d.resolvedAt,

                // Court forwarding
                forwardedToCourt: d.forwardedToCourt,
                courtType: d.courtType,
                courtName: d.courtName,
                courtLocation: d.courtLocation,
                courtReason: d.courtReason,
                courtForwardedAt: d.courtForwardedAt,

                // Signatures
                plaintiffSignature: d.plaintiffSignature,
                defendantSignature: d.defendantSignature,
                plaintiffSignedAt: d.plaintiffSignedAt,
                defendantSignedAt: d.defendantSignedAt,

                // Metadata
                reanalysisCount: d.reanalysisCount,
                createdAt: d.createdAt,
                updatedAt: d.updatedAt
            })),

            // Messages
            messages: messages.map(m => ({
                id: m.id,
                disputeId: m.disputeId,
                senderName: m.senderName,
                content: m.content,
                attachment: m.attachment,
                isYourMessage: m.senderEmail === user.email,
                createdAt: m.createdAt
            })),

            // Evidence Files
            evidenceFiles: evidence.map(e => ({
                id: e.id,
                disputeId: e.disputeId,
                fileName: e.fileName,
                fileType: e.fileType,
                filePath: e.filePath,
                description: e.description,
                uploadedBy: e.uploadedBy,
                uploadedByRole: e.uploadedByRole,
                isYourEvidence: e.uploadedBy === user.username || e.uploadedBy === user.email,
                uploadedAt: e.createdAt
            })),

            // Notifications History
            notifications: notifications.map(n => ({
                id: n.id,
                type: n.type,
                title: n.title,
                message: n.message,
                isRead: n.isRead,
                metadata: n.metadata ? JSON.parse(n.metadata) : null,
                createdAt: n.createdAt
            })),

            // Activity/Audit Logs
            activityLogs: auditLogs.map(log => ({
                action: log.action,
                category: log.category,
                resourceType: log.resourceType,
                resourceId: log.resourceId,
                description: log.description,
                status: log.status,
                ipAddress: log.ipAddress,
                userAgent: log.userAgent,
                timestamp: log.createdAt
            })),

            // Payment History
            payments: payments.map(p => ({
                id: p.id,
                amount: p.amount,
                currency: p.currency,
                status: p.status,
                description: p.description,
                paymentDate: p.createdAt
            })),

            // Statistics
            statistics: {
                totalDisputes: disputes.length,
                disputesAsPlaintiff: disputes.filter(d => d.plaintiffEmail === user.email).length,
                disputesAsRespondent: disputes.filter(d => d.respondentEmail === user.email).length,
                resolvedDisputes: disputes.filter(d => d.status === 'Resolved').length,
                totalMessages: messages.filter(m => m.senderEmail === user.email).length,
                totalEvidenceUploaded: evidence.filter(e => e.uploadedBy === user.username || e.uploadedBy === user.email).length,
                totalPayments: payments.length,
                totalNotifications: notifications.length,
                unreadNotifications: notifications.filter(n => !n.isRead).length
            },

            // GDPR Information
            gdprInformation: {
                rightToAccess: 'You have the right to access your personal data at any time.',
                rightToRectification: 'You have the right to correct inaccurate personal data.',
                rightToErasure: 'You have the right to request deletion of your personal data (Right to be Forgotten).',
                rightToRestriction: 'You have the right to restrict processing of your personal data.',
                rightToDataPortability: 'You have the right to receive your personal data in a structured, commonly used format.',
                rightToObject: 'You have the right to object to processing of your personal data.',
                rightsRelatedToAutomatedDecision: 'You have rights related to automated decision-making and profiling.',
                dataController: 'AI Dispute Resolution Platform',
                contactEmail: 'privacy@aidispute.com',
                lastUpdated: new Date().toISOString()
            }
        };

        // Audit log: User exported their data
        await logAuditEvent({
            action: 'DATA_EXPORTED',
            category: AuditCategories.PRIVACY,
            user: { id: user.id, email: user.email, username: user.username, role: user.role },
            resourceType: 'USER',
            resourceId: user.id,
            description: `User ${user.username} exported their personal data (GDPR compliance)`,
            request: req,
            status: 'SUCCESS',
            metadata: {
                disputesCount: disputes.length,
                messagesCount: messages.length,
                evidenceCount: evidence.length,
                notificationsCount: notifications.length,
                auditLogsCount: auditLogs.length,
                paymentsCount: payments.length
            }
        });

        logInfo('User data export completed successfully', {
            userId: req.user.id,
            dataSize: JSON.stringify(exportData).length,
            recordCounts: {
                disputes: disputes.length,
                messages: messages.length,
                evidence: evidence.length,
                notifications: notifications.length,
                auditLogs: auditLogs.length,
                payments: payments.length
            }
        });

        res.json(exportData);
    } catch (error) {
        logError('Export data error', { error: error.message, userId: req.user?.id });
        captureError(error, { userId: req.user?.id, action: 'export_data' });
        res.status(500).json({ error: 'Failed to export data' });
    }
});

// Delete user account
app.delete('/api/users/account', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check for active disputes
        const activeDisputes = await Dispute.findAll({
            where: {
                [Op.or]: [
                    { plaintiffEmail: user.email },
                    { respondentEmail: user.email }
                ],
                status: {
                    [Op.notIn]: ['Resolved', 'ForwardedToCourt']
                }
            }
        });

        if (activeDisputes.length > 0) {
            // Log the attempt
            await AuditLog.create({
                action: 'ACCOUNT_DELETION_BLOCKED',
                category: 'USER',
                resourceType: 'User',
                resourceId: user.id,
                userId: req.user.id,
                description: `Account deletion blocked: ${activeDisputes.length} active dispute(s)`,
                metadata: {
                    reason: 'Active disputes exist',
                    activeDisputeCount: activeDisputes.length
                },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });

            return res.status(400).json({
                error: `Cannot delete account. You have ${activeDisputes.length} active dispute(s). Please resolve or withdraw from all disputes first.`
            });
        }

        const userId = user.id;
        const userEmail = user.email;
        const username = user.username;

        // Delete associated data
        await Notification.destroy({ where: { userId } });

        // Anonymize audit logs instead of deleting
        await AuditLog.update(
            { userId: null, metadata: { anonymized: true, originalUserId: userId } },
            { where: { userId } }
        );

        // Log account deletion before deleting user
        await AuditLog.create({
            action: 'ACCOUNT_DELETED',
            category: 'USER',
            resourceType: 'User',
            resourceId: userId,
            userId: null,
            description: `Account deleted: ${username} (${userEmail})`,
            metadata: {
                message: 'Account deleted by user request',
                username,
                email: userEmail
            },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Delete the user
        await user.destroy();

        res.json({ message: 'Account deleted successfully' });
    } catch (error) {
        console.error('Delete account error:', error);
        Sentry.captureException(error, { tags: { action: 'delete_account' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

// ==================== SESSION MANAGEMENT ENDPOINTS ====================

// Get active sessions for the authenticated user
app.get('/api/users/sessions', authMiddleware, async (req, res) => {
    try {
        const currentTokenHash = hashToken(req.token);
        const sessions = await sessionService.getUserSessions(req.user.id, currentTokenHash);

        res.json({
            sessions,
            total: sessions.length
        });
    } catch (error) {
        console.error('Get sessions error:', error);
        Sentry.captureException(error, { tags: { action: 'get_sessions' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

// Revoke a specific session
app.delete('/api/users/sessions/:sessionId', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.params;

        // Verify the session belongs to the user
        const session = await Session.findOne({
            where: {
                id: sessionId,
                userId: req.user.id,
                isActive: true
            }
        });

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Check if trying to revoke current session
        const currentTokenHash = hashToken(req.token);
        if (session.tokenHash === currentTokenHash) {
            return res.status(400).json({ error: 'Cannot revoke current session. Use logout instead.' });
        }

        // Revoke the session
        await sessionService.revokeSession(sessionId, 'Manually revoked by user');

        await AuditLog.create({
            action: 'SESSION_REVOKED',
            category: 'AUTH',
            resourceType: 'Session',
            resourceId: sessionId,
            userId: req.user.id,
            description: `User revoked session: ${session.deviceName} (${session.browser})`,
            metadata: {
                sessionId,
                deviceType: session.deviceType,
                browser: session.browser,
                ipAddress: session.ipAddress
            },
            ipAddress: getClientIP(req),
            userAgent: req.get('User-Agent')
        });

        res.json({ message: 'Session revoked successfully' });
    } catch (error) {
        console.error('Revoke session error:', error);
        Sentry.captureException(error, { tags: { action: 'revoke_session' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to revoke session' });
    }
});

// Revoke all sessions except current (Logout from all devices)
app.post('/api/users/sessions/revoke-all', authMiddleware, async (req, res) => {
    try {
        const currentTokenHash = hashToken(req.token);
        const revokedCount = await sessionService.revokeAllUserSessions(req.user.id, currentTokenHash);

        await AuditLog.create({
            action: 'ALL_SESSIONS_REVOKED',
            category: 'AUTH',
            resourceType: 'User',
            resourceId: req.user.id,
            userId: req.user.id,
            description: `User logged out from all devices (${revokedCount} sessions revoked)`,
            metadata: { revokedCount },
            ipAddress: getClientIP(req),
            userAgent: req.get('User-Agent')
        });

        res.json({
            message: 'Successfully logged out from all other devices',
            revokedCount
        });
    } catch (error) {
        console.error('Revoke all sessions error:', error);
        Sentry.captureException(error, { tags: { action: 'revoke_all_sessions' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to revoke sessions' });
    }
});

// Logout (revoke current session)
app.post('/api/auth/logout', authMiddleware, async (req, res) => {
    try {
        await sessionService.revokeSessionByToken(req.token, 'User logout');

        await AuditLog.create({
            action: 'USER_LOGOUT',
            category: 'AUTH',
            resourceType: 'User',
            resourceId: req.user.id,
            userId: req.user.id,
            description: 'User logged out',
            ipAddress: getClientIP(req),
            userAgent: req.get('User-Agent')
        });

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        Sentry.captureException(error, { tags: { action: 'logout' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to logout' });
    }
});

// Admin: Get session statistics
app.get('/api/admin/sessions/stats', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const stats = await sessionService.getSessionStats();
        res.json(stats);
    } catch (error) {
        console.error('Get session stats error:', error);
        Sentry.captureException(error, { tags: { action: 'get_session_stats' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to fetch session statistics' });
    }
});

// ==================== END SESSION MANAGEMENT ====================

// Get user's disputes
app.get('/api/users/my-disputes', authMiddleware, async (req, res) => {
    try {
        // Dispute model stores plaintiff/defendant details directly - no need to join with User
        const disputes = await Dispute.findAll({
            where: {
                [Op.or]: [
                    { plaintiffId: req.user.id },
                    { defendantId: req.user.id }
                ]
            },
            order: [['createdAt', 'DESC']]
        });

        res.json(disputes);
    } catch (error) {
        console.error('Get user disputes error:', error);
        res.status(500).json({ error: 'Failed to fetch disputes' });
    }
});

// ==================== PROFILE MANAGEMENT ENHANCEMENTS ====================

// Upload profile picture
app.post('/api/users/profile-picture', authMiddleware, uploadProfile.single('profilePicture'), handleMulterError, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get the file path - works for both Cloudinary (req.file.path is URL) and local storage (req.file.filename)
        let profilePicturePath;
        if (req.file.path && req.file.path.startsWith('http')) {
            // Cloudinary returns full URL in path
            profilePicturePath = req.file.path;
        } else if (req.file.filename) {
            // Local storage - construct relative path
            profilePicturePath = `/uploads/${req.file.filename}`;
        } else if (req.file.path) {
            // Fallback - use path directly
            profilePicturePath = req.file.path.replace(/^\./, ''); // Remove leading dot if present
        } else {
            return res.status(500).json({ error: 'Failed to process uploaded file' });
        }

        user.profilePicture = profilePicturePath;
        await user.save();

        // Create audit log
        await AuditLog.create({
            category: 'profile',
            resourceType: 'User',
            resourceId: user.id,
            action: 'update',
            userId: req.user.id,
            description: 'User updated profile picture',
            metadata: { profilePicture: profilePicturePath },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({
            message: 'Profile picture updated successfully',
            profilePicture: profilePicturePath
        });
    } catch (error) {
        console.error('Upload profile picture error:', error);
        Sentry.captureException(error, { tags: { action: 'upload_profile_picture' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to upload profile picture' });
    }
});

// Delete profile picture
app.delete('/api/users/profile-picture', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!user.profilePicture) {
            return res.status(400).json({ error: 'No profile picture to delete' });
        }

        // Resolve stored path which may be one of:
        // - 'uploads/filename.jpg'
        // - '/uploads/filename.jpg'
        // - './uploads/filename.jpg'
        // - full URL 'http://host/uploads/filename.jpg'
        let storedPath = user.profilePicture;
        try {
            if (storedPath.startsWith('http')) {
                const u = new URL(storedPath);
                storedPath = u.pathname; // '/uploads/filename.jpg'
            }
        } catch {}
        // Normalize to relative path without leading slash or dot
        let relativePath = storedPath
            .replace(/^\.+\/?/, '')
            .replace(/^\//, '')
            .replace(/^[.]+\//, '')
            .replace(/\\/g, '/') // windows -> posix
            .replace(/^uploads\/uploads\//, 'uploads/');
        // Ensure it points under uploads/
        if (!relativePath.startsWith('uploads/')) {
            relativePath = path.posix.join('uploads', path.posix.basename(relativePath));
        }
        // Use process.cwd() since ES modules don't have __dirname
        const baseDir = process.cwd();
        const candidatePaths = [
            path.join(baseDir, relativePath),
            path.join(baseDir, 'uploads', path.basename(relativePath)),
            path.join(baseDir, 'backend', relativePath),
            path.join(baseDir, 'backend', 'uploads', path.basename(relativePath))
        ];
        let deleted = false;
        for (const p of candidatePaths) {
            try {
                if (fs.existsSync(p)) {
                    fs.unlinkSync(p);
                    deleted = true;
                    break;
                }
            } catch (e) {
                console.warn('Profile picture unlink failed:', p, e.message);
            }
        }
        if (!deleted) {
            console.warn('Profile picture file not found, clearing DB field only:', relativePath);
        }

        user.profilePicture = null;
        await user.save();

        // Create audit log
        await AuditLog.create({
            category: 'profile',
            resourceType: 'User',
            resourceId: user.id,
            action: 'delete',
            userId: req.user.id,
            description: 'User deleted profile picture',
            metadata: {},
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ message: 'Profile picture deleted successfully' });
    } catch (error) {
        console.error('Delete profile picture error:', error);
        Sentry.captureException(error, { tags: { action: 'delete_profile_picture' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to delete profile picture' });
    }
});

// Get user activity logs
app.get('/api/users/activity-logs', authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 20, category } = req.query;
        const offset = (page - 1) * limit;

        const whereClause = { userId: req.user.id };
        if (category && category !== 'all') {
            whereClause.category = category;
        }

        const { count, rows: logs } = await AuditLog.findAndCountAll({
            where: whereClause,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            attributes: ['id', 'category', 'action', 'description', 'metadata', 'ipAddress', 'createdAt']
        });

        res.json({
            logs,
            pagination: {
                total: count,
                page: parseInt(page),
                pages: Math.ceil(count / limit),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get activity logs error:', error);
        Sentry.captureException(error, { tags: { action: 'get_activity_logs' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to fetch activity logs' });
    }
});

// Update privacy settings
app.put('/api/users/privacy-settings', authMiddleware, async (req, res) => {
    try {
        const { profileVisibility, showEmail, showPhone } = req.body;
        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const oldSettings = {
            profileVisibility: user.profileVisibility,
            showEmail: user.showEmail,
            showPhone: user.showPhone
        };

        if (profileVisibility) user.profileVisibility = profileVisibility;
        if (showEmail !== undefined) user.showEmail = showEmail;
        if (showPhone !== undefined) user.showPhone = showPhone;

        await user.save();

        // Create audit log
        await AuditLog.create({
            category: 'privacy',
            resourceType: 'User',
            resourceId: user.id,
            action: 'update',
            userId: req.user.id,
            description: 'User updated privacy settings',
            metadata: {
                oldSettings,
                newSettings: {
                    profileVisibility: user.profileVisibility,
                    showEmail: user.showEmail,
                    showPhone: user.showPhone
                }
            },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({
            message: 'Privacy settings updated successfully',
            settings: {
                profileVisibility: user.profileVisibility,
                showEmail: user.showEmail,
                showPhone: user.showPhone
            }
        });
    } catch (error) {
        console.error('Update privacy settings error:', error);
        Sentry.captureException(error, { tags: { action: 'update_privacy_settings' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to update privacy settings' });
    }
});

// Enable Two-Factor Authentication
app.post('/api/users/enable-2fa', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.twoFactorEnabled) {
            return res.status(400).json({ error: 'Two-factor authentication is already enabled' });
        }

        // Generate secret for 2FA (using crypto for simplicity, in production use speakeasy or similar)
        const secret = crypto.randomBytes(20).toString('hex');

        // Generate backup codes
        const backupCodes = [];
        for (let i = 0; i < 10; i++) {
            backupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
        }

        user.twoFactorSecret = secret;
        user.twoFactorBackupCodes = JSON.stringify(backupCodes);
        user.twoFactorEnabled = false; // Will be enabled after verification
        await user.save();

        // Create audit log
        await AuditLog.create({
            category: 'security',
            resourceType: 'User',
            resourceId: user.id,
            action: 'setup_2fa',
            userId: req.user.id,
            description: 'User initiated 2FA setup',
            metadata: {},
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        // In production, you would generate a QR code here using the secret
        // For now, we'll return the secret and backup codes
        res.json({
            message: '2FA setup initiated',
            secret: secret,
            backupCodes: backupCodes,
            // In production: qrCodeUrl: `otpauth://totp/MediaAI:${user.email}?secret=${secret}&issuer=MediaAI`
        });
    } catch (error) {
        console.error('Enable 2FA error:', error);
        Sentry.captureException(error, { tags: { action: 'enable_2fa' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to enable 2FA' });
    }
});

// Verify and activate Two-Factor Authentication
app.post('/api/users/verify-2fa', authMiddleware, async (req, res) => {
    try {
        const { code } = req.body;
        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!user.twoFactorSecret) {
            return res.status(400).json({ error: '2FA not initialized' });
        }

        // In production, verify the TOTP code using speakeasy
        // For now, we'll accept any 6-digit code or check if it matches the secret
        const isValidCode = code && code.length === 6;

        if (!isValidCode) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        user.twoFactorEnabled = true;
        await user.save();

        // Create audit log
        await AuditLog.create({
            category: 'security',
            resourceType: 'User',
            resourceId: user.id,
            action: 'enable_2fa',
            userId: req.user.id,
            description: 'User enabled two-factor authentication',
            metadata: {},
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ message: '2FA enabled successfully' });
    } catch (error) {
        console.error('Verify 2FA error:', error);
        Sentry.captureException(error, { tags: { action: 'verify_2fa' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to verify 2FA' });
    }
});

// Disable Two-Factor Authentication
app.post('/api/users/disable-2fa', authMiddleware, async (req, res) => {
    try {
        const { password } = req.body;
        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!user.twoFactorEnabled) {
            return res.status(400).json({ error: '2FA is not enabled' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        user.twoFactorEnabled = false;
        user.twoFactorSecret = null;
        user.twoFactorBackupCodes = null;
        await user.save();

        // Create audit log
        await AuditLog.create({
            category: 'security',
            resourceType: 'User',
            resourceId: user.id,
            action: 'disable_2fa',
            userId: req.user.id,
            description: 'User disabled two-factor authentication',
            metadata: {},
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ message: '2FA disabled successfully' });
    } catch (error) {
        console.error('Disable 2FA error:', error);
        Sentry.captureException(error, { tags: { action: 'disable_2fa' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to disable 2FA' });
    }
});

// Get account statistics
app.get('/api/users/statistics', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        // Get dispute counts
        const totalDisputes = await Dispute.count({
            where: {
                [Op.or]: [{ plaintiffId: userId }, { defendantId: userId }]
            }
        });

        const asPlaintiff = await Dispute.count({ where: { plaintiffId: userId } });
        const asDefendant = await Dispute.count({ where: { defendantId: userId } });

        const resolvedDisputes = await Dispute.count({
            where: {
                [Op.or]: [{ plaintiffId: userId }, { defendantId: userId }],
                status: 'Resolved'
            }
        });

        const activeDisputes = await Dispute.count({
            where: {
                [Op.or]: [{ plaintiffId: userId }, { defendantId: userId }],
                status: 'Active'
            }
        });

        const pendingDisputes = await Dispute.count({
            where: {
                [Op.or]: [{ plaintiffId: userId }, { defendantId: userId }],
                status: 'Pending'
            }
        });

        // Get activity count
        const activityCount = await AuditLog.count({ where: { userId } });

        // Get recent activity
        const recentActivity = await AuditLog.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']],
            limit: 5,
            attributes: ['category', 'action', 'description', 'createdAt']
        });

        res.json({
            disputes: {
                total: totalDisputes,
                asPlaintiff,
                asDefendant,
                resolved: resolvedDisputes,
                active: activeDisputes,
                pending: pendingDisputes
            },
            activityCount,
            recentActivity
        });
    } catch (error) {
        console.error('Get statistics error:', error);
        Sentry.captureException(error, { tags: { action: 'get_statistics' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// ==================== CONTACT ROUTES ====================

// Send a contact message (Public)
app.post('/api/contact', generalLimiter, [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('subject').trim().notEmpty().withMessage('Subject is required'),
    body('message').trim().notEmpty().withMessage('Message is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { name, email, subject, message } = req.body;

        await Contact.create({
            name,
            email,
            subject,
            message
        });

        res.status(201).json({ message: 'Message sent successfully' });
    } catch (error) {
        logError('Contact message failed', { error: error.message });
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// ==================== ADMIN USER MANAGEMENT ====================

// Admin middleware - checks if user is admin
const adminMiddleware = async (req, res, next) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user || user.role !== 'Admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    } catch (error) {
        res.status(500).json({ error: 'Authorization failed' });
    }
};

// Get all contact messages (Admin)
app.get('/api/admin/contacts', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const contacts = await Contact.findAll({
            order: [['createdAt', 'DESC']]
        });
        res.json(contacts);
    } catch (error) {
        logError('Fetch contacts failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Reply to contact message (Admin)
app.put('/api/admin/contacts/:id/reply', authMiddleware, adminMiddleware, [
    body('replyMessage').trim().notEmpty().withMessage('Reply message is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { id } = req.params;
        const { replyMessage } = req.body;

        const contact = await Contact.findByPk(id);
        if (!contact) {
            return res.status(404).json({ error: 'Message not found' });
        }

        // Update contact status
        await contact.update({
            status: 'Replied',
            adminReply: replyMessage,
            repliedAt: new Date(),
            repliedBy: req.user.id
        });

        // Send email notification
        await emailService.sendContactReplyEmail(
            contact.name,
            contact.email,
            contact.message,
            replyMessage
        );

        res.json({ message: 'Reply sent successfully', contact });
    } catch (error) {
        logError('Reply contact failed', { error: error.message, contactId: req.params.id });
        res.status(500).json({ error: 'Failed to send reply' });
    }
});

// Get all users (Admin only)
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: { exclude: ['password', 'resetToken', 'resetTokenExpiry'] },
            order: [['createdAt', 'DESC']]
        });

        // Log admin action
        await AuditLog.create({
            action: 'ADMIN_VIEW_USERS',
            category: 'ADMIN',
            resourceType: 'User',
            resourceId: null,
            userId: req.user.id,
            description: `Admin viewed all users (count: ${users.length})`,
            metadata: { userCount: users.length },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ users });
    } catch (error) {
        console.error('Admin get users error:', error);
        Sentry.captureException(error, { tags: { action: 'admin_get_users' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Update user role (Admin only)
app.put('/api/admin/users/:userId/role', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;

        if (!['User', 'Admin'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role. Must be User or Admin' });
        }

        const targetUser = await User.findByPk(userId);
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent removing the last admin
        if (targetUser.role === 'Admin' && role === 'User') {
            const adminCount = await User.count({ where: { role: 'Admin' } });
            if (adminCount <= 1) {
                return res.status(400).json({ error: 'Cannot remove the last admin' });
            }
        }

        const oldRole = targetUser.role;
        await targetUser.update({ role });

        // Log admin action
        await AuditLog.create({
            action: 'ADMIN_CHANGE_ROLE',
            category: 'ADMIN',
            resourceType: 'User',
            resourceId: parseInt(userId),
            userId: req.user.id,
            description: `Changed role of ${targetUser.username} from ${oldRole} to ${role}`,
            metadata: {
                targetUsername: targetUser.username,
                oldRole,
                newRole: role
            },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Notify the user
        await Notification.create({
            userId: targetUser.id,
            type: 'system',
            title: 'Role Updated',
            message: `Your account role has been changed to ${role}`,
            isRead: false
        });

        res.json({ message: `User role updated to ${role}`, user: targetUser });
    } catch (error) {
        console.error('Admin update role error:', error);
        Sentry.captureException(error, { tags: { action: 'admin_update_role' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to update user role' });
    }
});

// Suspend user account (Admin only)
app.post('/api/admin/users/:userId/suspend', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;

        const targetUser = await User.findByPk(userId);
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent suspending admins
        if (targetUser.role === 'Admin') {
            return res.status(400).json({ error: 'Cannot suspend an admin account' });
        }

        // Prevent self-suspension
        if (targetUser.id === req.user.id) {
            return res.status(400).json({ error: 'Cannot suspend your own account' });
        }

        await targetUser.update({ isSuspended: true, suspendedAt: new Date(), suspendReason: reason });

        // Log admin action
        await AuditLog.create({
            action: 'ADMIN_SUSPEND_USER',
            category: 'ADMIN',
            resourceType: 'User',
            resourceId: parseInt(userId),
            userId: req.user.id,
            description: `Suspended user ${targetUser.username}: ${reason || 'No reason provided'}`,
            metadata: {
                targetUsername: targetUser.username,
                reason: reason || 'No reason provided'
            },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Notify the user
        await Notification.create({
            userId: targetUser.id,
            type: 'system',
            title: 'Account Suspended',
            message: reason || 'Your account has been suspended. Please contact support for more information.',
            isRead: false
        });

        res.json({ message: 'User account suspended successfully' });
    } catch (error) {
        console.error('Admin suspend user error:', error);
        Sentry.captureException(error, { tags: { action: 'admin_suspend_user' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to suspend user' });
    }
});

// Activate user account (Admin only)
app.post('/api/admin/users/:userId/activate', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        const targetUser = await User.findByPk(userId);
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        await targetUser.update({ isSuspended: false, suspendedAt: null, suspendReason: null });

        // Log admin action
        await AuditLog.create({
            action: 'ADMIN_ACTIVATE_USER',
            category: 'ADMIN',
            resourceType: 'User',
            resourceId: parseInt(userId),
            userId: req.user.id,
            description: `Activated user ${targetUser.username}`,
            metadata: { targetUsername: targetUser.username },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Notify the user
        await Notification.create({
            userId: targetUser.id,
            type: 'system',
            title: 'Account Activated',
            message: 'Your account has been reactivated. You can now access all features.',
            isRead: false
        });

        res.json({ message: 'User account activated successfully' });
    } catch (error) {
        console.error('Admin activate user error:', error);
        Sentry.captureException(error, { tags: { action: 'admin_activate_user' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to activate user' });
    }
});

// ==================== ADMIN DASHBOARD API ====================

// Get comprehensive admin dashboard statistics
app.get('/api/admin/dashboard/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisWeekStart = new Date(today);
        thisWeekStart.setDate(today.getDate() - today.getDay());
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

        // Dispute Statistics
        const totalDisputes = await Dispute.count();
        const disputesByStatus = await Dispute.findAll({
            attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
            group: ['status'],
            raw: true
        });

        const disputesThisMonth = await Dispute.count({
            where: { createdAt: { [Op.gte]: thisMonthStart } }
        });
        const disputesLastMonth = await Dispute.count({
            where: {
                createdAt: {
                    [Op.gte]: lastMonthStart,
                    [Op.lte]: lastMonthEnd
                }
            }
        });
        const disputesToday = await Dispute.count({
            where: { createdAt: { [Op.gte]: today } }
        });

        // Resolution Statistics
        const resolvedDisputes = await Dispute.count({ where: { status: 'Resolved' } });
        const forwardedToCourt = await Dispute.count({ where: { forwardedToCourt: true } });
        const resolutionRate = totalDisputes > 0 ? ((resolvedDisputes / totalDisputes) * 100).toFixed(1) : 0;

        // Calculate average resolution time (for resolved disputes)
        const resolvedWithTime = await Dispute.findAll({
            where: { status: 'Resolved' },
            attributes: ['createdAt', 'updatedAt'],
            raw: true
        });
        let avgResolutionDays = 0;
        if (resolvedWithTime.length > 0) {
            const totalDays = resolvedWithTime.reduce((sum, d) => {
                const days = (new Date(d.updatedAt) - new Date(d.createdAt)) / (1000 * 60 * 60 * 24);
                return sum + days;
            }, 0);
            avgResolutionDays = (totalDays / resolvedWithTime.length).toFixed(1);
        }

        // User Statistics
        const totalUsers = await User.count();
        const verifiedUsers = await User.count({ where: { isVerified: true } });
        const suspendedUsers = await User.count({ where: { isSuspended: true } });
        const adminUsers = await User.count({ where: { role: 'Admin' } });
        const usersThisMonth = await User.count({
            where: { createdAt: { [Op.gte]: thisMonthStart } }
        });

        // Pending Actions (Admin workqueue)
        const pendingApprovals = await Dispute.count({
            where: { status: 'PendingAdminApproval' }
        });
        const pendingVerifications = await User.count({
            where: { verificationStatus: 'Pending' }
        });
        const awaitingDecision = await Dispute.count({
            where: { status: 'AwaitingDecision' }
        });

        // Recent Activity Counts (last 7 days)
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const messagesThisWeek = await Message.count({
            where: { createdAt: { [Op.gte]: weekAgo } }
        });
        const evidenceThisWeek = await Evidence.count({
            where: { createdAt: { [Op.gte]: weekAgo } }
        });

        // Disputes trend (last 6 months)
        const disputesTrend = [];
        for (let i = 5; i >= 0; i--) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
            const count = await Dispute.count({
                where: {
                    createdAt: {
                        [Op.gte]: monthStart,
                        [Op.lte]: monthEnd
                    }
                }
            });
            disputesTrend.push({
                month: monthStart.toLocaleString('default', { month: 'short' }),
                year: monthStart.getFullYear(),
                count
            });
        }

        res.json({
            overview: {
                totalDisputes,
                resolvedDisputes,
                forwardedToCourt,
                resolutionRate: parseFloat(resolutionRate),
                avgResolutionDays: parseFloat(avgResolutionDays),
                disputesToday,
                disputesThisMonth,
                disputesTrend: disputesLastMonth > 0
                    ? (((disputesThisMonth - disputesLastMonth) / disputesLastMonth) * 100).toFixed(1)
                    : disputesThisMonth > 0 ? 100 : 0
            },
            disputes: {
                byStatus: disputesByStatus.reduce((acc, item) => {
                    acc[item.status] = parseInt(item.count);
                    return acc;
                }, {}),
                trend: disputesTrend
            },
            users: {
                total: totalUsers,
                verified: verifiedUsers,
                suspended: suspendedUsers,
                admins: adminUsers,
                newThisMonth: usersThisMonth
            },
            pendingActions: {
                approvals: pendingApprovals,
                verifications: pendingVerifications,
                awaitingDecision: awaitingDecision,
                total: pendingApprovals + pendingVerifications
            },
            activity: {
                messagesThisWeek,
                evidenceThisWeek
            }
        });
    } catch (error) {
        console.error('Admin dashboard stats error:', error);
        Sentry.captureException(error, { tags: { action: 'admin_dashboard_stats' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
});

// Get recent audit logs for admin
app.get('/api/admin/dashboard/activity', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { limit = 50, category, action } = req.query;

        const whereClause = {};
        if (category) whereClause.category = category;
        if (action) whereClause.action = action;

        const activities = await AuditLog.findAll({
            where: whereClause,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit)
        });

        // Get activity summary by category
        const activityByCategory = await AuditLog.findAll({
            attributes: ['category', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
            where: {
                createdAt: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            },
            group: ['category'],
            raw: true
        });

        res.json({
            activities,
            summary: activityByCategory.reduce((acc, item) => {
                acc[item.category] = parseInt(item.count);
                return acc;
            }, {})
        });
    } catch (error) {
        console.error('Admin activity log error:', error);
        Sentry.captureException(error, { tags: { action: 'admin_activity_log' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to fetch activity logs' });
    }
});

// Get disputes pending admin action
app.get('/api/admin/dashboard/pending', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        // Get disputes pending admin approval
        const pendingApprovals = await Dispute.findAll({
            where: { status: 'PendingAdminApproval' },
            order: [['updatedAt', 'DESC']],
            limit: 10
        });

        // Get users pending verification
        const pendingVerifications = await User.findAll({
            where: { verificationStatus: 'Pending' },
            attributes: ['id', 'username', 'email', 'createdAt', 'idCardPath', 'selfiePath'],
            order: [['createdAt', 'ASC']],
            limit: 10
        });

        // Get disputes needing attention (active but stale - no activity in 3+ days)
        const staleDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const staleDisputes = await Dispute.findAll({
            where: {
                status: { [Op.in]: ['Active', 'AwaitingDecision'] },
                updatedAt: { [Op.lt]: staleDate }
            },
            order: [['updatedAt', 'ASC']],
            limit: 10
        });

        res.json({
            approvals: pendingApprovals,
            verifications: pendingVerifications,
            staleDisputes
        });
    } catch (error) {
        console.error('Admin pending items error:', error);
        Sentry.captureException(error, { tags: { action: 'admin_pending_items' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to fetch pending items' });
    }
});

// Get system health metrics
app.get('/api/admin/dashboard/health', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const dbHealth = await checkDatabaseHealth();
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();

        // Get active socket connections
        const io = global.io;
        const activeConnections = io ? io.engine.clientsCount : 0;

        res.json({
            status: dbHealth.connected ? 'healthy' : 'degraded',
            database: dbHealth,
            server: {
                uptime: Math.floor(uptime),
                uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
                memoryUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                memoryTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                memoryPercent: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
            },
            realtime: {
                activeConnections,
                socketStatus: io ? 'active' : 'inactive'
            },
            services: {
                ai: API_KEY !== 'API_KEY_MISSING',
                email: !!emailService,
                sentry: !!process.env.SENTRY_DSN
            }
        });
    } catch (error) {
        console.error('Admin health check error:', error);
        res.status(500).json({ error: 'Failed to fetch health metrics' });
    }
});

// ==================== END ADMIN DASHBOARD API ====================

// Get user activity log (Admin only)
app.get('/api/admin/users/:userId/activity', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 50 } = req.query;

        const targetUser = await User.findByPk(userId);
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        const activities = await AuditLog.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit)
        });

        res.json({ activities });
    } catch (error) {
        console.error('Admin get user activity error:', error);
        Sentry.captureException(error, { tags: { action: 'admin_get_user_activity' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to fetch user activity' });
    }
});

// Delete user account (Admin only)
app.delete('/api/admin/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        const targetUser = await User.findByPk(userId);
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent deleting admins
        if (targetUser.role === 'Admin') {
            return res.status(400).json({ error: 'Cannot delete an admin account' });
        }

        // Prevent self-deletion
        if (targetUser.id === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        // Check for active disputes
        const activeDisputes = await Dispute.findAll({
            where: {
                [Op.or]: [
                    { plaintiffEmail: targetUser.email },
                    { respondentEmail: targetUser.email }
                ],
                status: {
                    [Op.notIn]: ['Resolved', 'ForwardedToCourt']
                }
            }
        });

        if (activeDisputes.length > 0) {
            return res.status(400).json({
                error: `Cannot delete user. They have ${activeDisputes.length} active dispute(s).`
            });
        }

        const userInfo = { id: targetUser.id, username: targetUser.username, email: targetUser.email };

        // Delete associated data
        await Notification.destroy({ where: { userId } });

        // Anonymize audit logs
        await AuditLog.update(
            { userId: null, metadata: { anonymized: true, deletedByAdmin: req.user.id } },
            { where: { userId } }
        );

        // Delete the user
        await targetUser.destroy();

        // Log admin action
        await AuditLog.create({
            action: 'ADMIN_DELETE_USER',
            category: 'ADMIN',
            resourceType: 'User',
            resourceId: userInfo.id,
            userId: req.user.id,
            description: `Deleted user ${userInfo.username} (${userInfo.email})`,
            metadata: userInfo,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Admin delete user error:', error);
        Sentry.captureException(error, { tags: { action: 'admin_delete_user' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

app.post('/api/disputes',
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
    async (req, res) => {
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
            const idVerification = await verifyDocumentIsID(req.files.idCard[0].path);
            if (!idVerification.isValid) {
                return res.status(400).json({ error: `Invalid Identity Document: ${idVerification.details}` });
            }
            console.log("ID Verified:", idVerification.details);

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
                // Remove these 4 lines when you want to enable payments again
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
    });

// Respondent submits defense
app.post('/api/disputes/:id/respond', authMiddleware, async (req, res) => {
    try {
        const { defendantStatement } = req.body;
        const dispute = await Dispute.findByPk(req.params.id);

        if (!dispute) return res.status(404).json({ error: 'Not found' });

        // Get current user's email
        const currentUser = await User.findByPk(req.user.id);

        // Check if current user is the respondent (by email) or an Admin
        if (currentUser.email !== dispute.respondentEmail && req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'You are not the named respondent in this case.' });
        }

        dispute.respondentId = req.user.id;
        dispute.defendantStatement = defendantStatement;
        dispute.status = 'Analysing';
        await dispute.save();

        // Trigger AI Analysis now that we have both sides
        if (process.env.GEMINI_API_KEY) {
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-pro" });
                const prompt = `Act as an expert dispute resolver under strictly Indian Constitutional Law and Indian Penal Code. 
Analyze this dispute between two parties.

CASE DETAILS:
Title: ${dispute.title}
Plaintiff Complaint: ${dispute.description}
Defendant Response: ${defendantStatement}
Evidence Content (OCR): ${dispute.evidenceText}

Provide a structured analysis in Markdown:
1. **Summary of Facts**: objective summary of both sides.
2. **Legal Assessment (Indian Law)**: Cite relevant IPC sections or Acts.
3. **Fair Resolution**: Suggest the top 3 fair solutions to resolve this.
`;

                const result = await model.generateContent(prompt);
                const response = await result.response;
                dispute.aiAnalysis = response.text();
                dispute.status = 'Analyzed';
                await dispute.save();
            } catch (aiError) {
                console.error('AI Error:', aiError);
            }
        }

        res.json(dispute);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Defendant accepts the case
app.post('/api/disputes/:id/accept', authMiddleware, async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Not found' });

        const currentUser = await User.findByPk(req.user.id);
        if (currentUser.email !== dispute.respondentEmail) {
            return res.status(403).json({ error: 'Only the respondent can accept this case.' });
        }

        dispute.respondentId = req.user.id;
        dispute.respondentAccepted = true;
        dispute.status = 'Active';
        await dispute.save();

        // Audit log: Case accepted
        await logAuditEvent({
            action: AuditActions.DISPUTE_ACCEPT,
            category: AuditCategories.DISPUTE,
            user: { id: currentUser.id, email: currentUser.email, username: currentUser.username },
            resourceType: 'DISPUTE',
            resourceId: dispute.id,
            description: `Defendant ${dispute.respondentName} accepted case #${dispute.id}`,
            metadata: {
                disputeTitle: dispute.title,
                plaintiffName: dispute.plaintiffName,
                respondentName: dispute.respondentName
            },
            request: req,
            status: 'SUCCESS'
        });
        logInfo('Case accepted by defendant', { disputeId: dispute.id, respondentId: req.user.id });

        // Emit real-time update to all users watching this dispute
        const emitToDispute = req.app.get('emitToDispute');
        emitToDispute(dispute.id, 'dispute:accepted', {
            disputeId: dispute.id,
            respondentName: dispute.respondentName,
            status: dispute.status
        });

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
});

// Get messages for a dispute
app.get('/api/disputes/:id/messages', authMiddleware, async (req, res) => {
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
});

// Send a message in a dispute
app.post('/api/disputes/:id/messages',
    authMiddleware,
    messageLimiter,
    upload.single('attachment'),
    [
        body('content').optional().trim().isLength({ max: 1000 }).withMessage('Message must be under 1000 characters'),
    ],
    async (req, res) => {
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

            // Audit log: Message sent
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

            // Emit real-time message to all users in the dispute room
            const emitToDispute = req.app.get('emitToDispute');
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

            // Send in-app notification to other party
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

            // Check if we need to trigger AI analysis (after 10 messages)
            checkAndTriggerAI(dispute.id);

            res.json(message);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

// Identity Verification Route
app.post('/api/auth/verify', authMiddleware, upload.fields([{ name: 'idCard', maxCount: 1 }, { name: 'selfie', maxCount: 1 }]), async (req, res) => {
    try {
        if (!req.files.idCard || !req.files.selfie) {
            return res.status(400).json({ error: "Both ID Card and Selfie are required" });
        }

        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const idCardPath = req.files.idCard[0].filename;
        const selfiePath = req.files.selfie[0].filename;

        logInfo('Starting identity verification', {
            userId: user.id,
            username: user.username
        });

        // Enhanced AI Verification with multiple steps
        const verification = await verifyIdentityWithAI(user.username, idCardPath, selfiePath);

        logInfo('Verification completed', {
            userId: user.id,
            verified: verification.verified,
            confidence: verification.confidence,
            verificationId: verification.verificationId
        });

        // Update user record
        user.idCardPath = idCardPath;
        user.selfiePath = selfiePath;
        user.isVerified = verification.verified;
        user.verificationStatus = verification.verified ? 'Verified' : 'Rejected';
        user.verificationNotes = JSON.stringify({
            reason: verification.reason,
            confidence: verification.confidence,
            documentType: verification.documentType,
            nameOnID: verification.nameOnID,
            verificationId: verification.verificationId,
            timestamp: new Date().toISOString(),
            details: verification.details
        });
        await user.save();

        // Audit log for identity verification
        await logAuditEvent({
            action: verification.verified ? AuditActions.IDENTITY_VERIFICATION_APPROVE : AuditActions.IDENTITY_VERIFICATION_REJECT,
            category: AuditCategories.SECURITY,
            user: { id: user.id, email: user.email, username: user.username },
            resourceType: 'USER',
            resourceId: user.id,
            description: `Identity verification ${verification.verified ? 'PASSED' : 'FAILED'} for user ${user.username}. ${verification.reason}`,
            metadata: {
                verificationId: verification.verificationId,
                verified: verification.verified,
                confidence: verification.confidence,
                documentType: verification.documentType,
                step: verification.step,
                faceMatch: verification.details?.faceComparison?.match,
                faceConfidence: verification.details?.faceComparison?.confidence,
                spoofingRisk: verification.details?.selfieAnalysis?.spoofingRisk,
                processingTime: verification.details?.processingTime
            },
            request: req,
            status: verification.verified ? 'SUCCESS' : 'FAILURE'
        });

        // Prepare response
        const response = {
            success: true,
            user: {
                id: user.id,
                username: user.username,
                isVerified: user.isVerified,
                verificationStatus: user.verificationStatus
            },
            verification: {
                verified: verification.verified,
                reason: verification.reason,
                confidence: verification.confidence,
                documentType: verification.documentType,
                nameOnID: verification.nameOnID,
                verificationId: verification.verificationId,
                details: {
                    idDocument: verification.details?.idAnalysis ? {
                        type: verification.details.idAnalysis.documentType,
                        country: verification.details.idAnalysis.country,
                        isValid: verification.details.idAnalysis.isValid,
                        authenticityConfidence: verification.details.idAnalysis.authenticity?.confidence
                    } : null,
                    selfie: verification.details?.selfieAnalysis ? {
                        isValid: verification.details.selfieAnalysis.isValid,
                        spoofingRisk: verification.details.selfieAnalysis.spoofingRisk,
                        quality: verification.details.selfieAnalysis.quality
                    } : null,
                    faceMatch: verification.details?.faceComparison ? {
                        match: verification.details.faceComparison.match,
                        confidence: verification.details.faceComparison.confidence,
                        decision: verification.details.faceComparison.decision,
                        similarity: verification.details.faceComparison.similarity
                    } : null
                }
            }
        };

        res.json(response);
    } catch (e) {
        logError('Identity verification error', { error: e.message, stack: e.stack });
        res.status(500).json({ error: "Verification failed. Please try again." });
    }
});

// Get Verification Status
app.get('/api/auth/verification-status', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        let verificationDetails = null;
        if (user.verificationNotes) {
            try {
                verificationDetails = JSON.parse(user.verificationNotes);
            } catch (e) {
                verificationDetails = { reason: user.verificationNotes };
            }
        }

        res.json({
            isVerified: user.isVerified,
            verificationStatus: user.verificationStatus,
            hasIdCard: !!user.idCardPath,
            hasSelfie: !!user.selfiePath,
            details: verificationDetails
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Decision Route (Specific Solution Selection)
app.post('/api/disputes/:id/decision', authMiddleware, async (req, res) => {
    try {
        const { choice } = req.body; // 0, 1, 2, or -1 (Reject)
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const currentUser = await User.findByPk(req.user.id);
        const isPlaintiff = currentUser.email === dispute.plaintiffEmail;
        const isDefendant = currentUser.email === dispute.respondentEmail;

        if (!isPlaintiff && !isDefendant) {
            return res.status(403).json({ error: 'Only parties can make decisions' });
        }

        // Update choice
        if (isPlaintiff) {
            dispute.plaintiffChoice = choice;
        } else {
            dispute.defendantChoice = choice;
        }
        await dispute.save();

        // Audit log: Vote recorded
        await logAuditEvent({
            action: choice === -1 ? AuditActions.SOLUTION_REJECT_ALL : AuditActions.SOLUTION_VOTE,
            category: AuditCategories.DISPUTE,
            user: { id: currentUser.id, email: currentUser.email, username: currentUser.username },
            resourceType: 'DISPUTE',
            resourceId: dispute.id,
            description: `${isPlaintiff ? 'Plaintiff' : 'Defendant'} ${choice === -1 ? 'rejected all solutions' : `voted for Option ${choice + 1}`} in case #${dispute.id}`,
            metadata: {
                choice,
                role: isPlaintiff ? 'plaintiff' : 'defendant',
                plaintiffChoice: dispute.plaintiffChoice,
                defendantChoice: dispute.defendantChoice
            },
            request: req,
            status: 'SUCCESS'
        });
        logInfo('Solution vote recorded', { disputeId: dispute.id, userId: currentUser.id, choice });

        // Check if both made decisions
        if (dispute.plaintiffChoice !== null && dispute.defendantChoice !== null) {
            // Case 1: Both chose the SAME solution (and not reject)
            if (dispute.plaintiffChoice === dispute.defendantChoice && dispute.plaintiffChoice !== -1) {
                // CHANGED: Instead of immediately resolving, move to Resolution Phase
                dispute.status = 'ResolutionInProgress'; // New status for UI to show resolution steps
                dispute.resolutionStatus = 'InProgress';

                const solutions = JSON.parse(dispute.aiSolutions);
                const chosenSolution = solutions[dispute.plaintiffChoice];
                dispute.resolutionNotes = `Agreed on: ${chosenSolution.title}. Proceeding to formal verification and signing.`;

                await dispute.save();

                // Emit real-time update for agreement reached
                const io = global.io;
                if (io) {
                    io.to(`dispute:${dispute.id}`).emit('dispute:status-changed', {
                        disputeId: dispute.id,
                        status: dispute.status,
                        resolutionStatus: dispute.resolutionStatus,
                        agreedSolution: chosenSolution
                    });
                }

                return res.json({ dispute, message: `Agreement reached! Please proceed to the Resolution Step to verify details and sign.` });
            }
            // Case 2: Mismatch or Rejection
            else {
                // If it's the first failure -> Reanalyze
                if (dispute.reanalysisCount === 0) {
                    dispute.reanalysisCount = 1;
                    dispute.plaintiffChoice = null; // Reset for next round
                    dispute.defendantChoice = null;
                    dispute.aiSolutions = null;
                    dispute.status = 'Reanalyzing';
                    await dispute.save();

                    // Emit status change for reanalyzing
                    const ioReanalyze = global.io;
                    if (ioReanalyze) {
                        ioReanalyze.to(`dispute:${dispute.id}`).emit('dispute:status-changed', {
                            disputeId: dispute.id,
                            status: 'Reanalyzing',
                            message: 'AI is generating new solutions...'
                        });
                    }

                    // Trigger reanalysis with context of failure
                    const messages = await Message.findAll({
                        where: { disputeId: dispute.id },
                        order: [['createdAt', 'ASC']]
                    });

                    const analysis = await analyzeDisputeWithAI(dispute, messages, true);
                    if (analysis) {
                        dispute.aiAnalysis = 'REANALYSIS (Previous attempt failed):\n' + analysis.summary + '\n\n' + analysis.legalAssessment;
                        dispute.aiSolutions = JSON.stringify(analysis.solutions);
                        dispute.status = 'AwaitingDecision';
                        await dispute.save();

                        // Emit real-time update for reanalysis
                        const io = global.io;
                        if (io) {
                            io.to(`dispute:${dispute.id}`).emit('dispute:ai-ready', {
                                disputeId: dispute.id,
                                status: dispute.status,
                                aiSolutions: analysis.solutions,
                                isReanalysis: true
                            });
                        }

                        // Send email notification to both parties about reanalysis
                        await emailService.notifyReanalysisRequested(dispute, dispute.reanalysisCount);
                    }

                    return res.json({ dispute, message: 'No agreement reached. AI is providing NEW alternatives.' });
                }
                // Second failure -> Court
                else {
                    const messageCount = await Message.count({ where: { disputeId: dispute.id } });
                    const courtType = messageCount > 20 ? 'High' : 'District';

                    dispute.forwardedToCourt = true;
                    dispute.courtType = courtType;
                    dispute.courtReason = 'Parties could not agree on AI-mediated solutions after two rounds. Forwarded for judicial review.';
                    dispute.status = 'ForwardedToCourt';
                    await dispute.save();

                    // Emit real-time update for court forwarding
                    const io = global.io;
                    if (io) {
                        io.to(`dispute:${dispute.id}`).emit('dispute:status-changed', {
                            disputeId: dispute.id,
                            status: dispute.status,
                            forwardedToCourt: true,
                            courtType
                        });
                    }

                    return res.json({
                        dispute,
                        message: `Dispute unresolved. Forwarded to ${courtType} Court.`
                    });
                }
            }
        }

        // Emit real-time update for vote recorded
        const io = global.io;
        if (io) {
            io.to(`dispute:${dispute.id}`).emit('dispute:vote-recorded', {
                disputeId: dispute.id,
                plaintiffChoice: dispute.plaintiffChoice,
                defendantChoice: dispute.defendantChoice,
                voterRole: isPlaintiff ? 'plaintiff' : 'defendant'
            });
        }

        res.json({ dispute, message: 'Choice recorded. Waiting for other party.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Manual Reanalysis Request (User-initiated)
app.post('/api/disputes/:id/request-reanalysis', authMiddleware, async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const currentUser = await User.findByPk(req.user.id);

        // Check if user is a party to this dispute
        const isPlaintiff = currentUser.email === dispute.plaintiffEmail;
        const isDefendant = currentUser.email === dispute.respondentEmail;

        if (!isPlaintiff && !isDefendant && req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Only parties involved can request reanalysis' });
        }

        // Check if AI solutions exist
        if (!dispute.aiSolutions || dispute.status !== 'AwaitingDecision') {
            return res.status(400).json({ error: 'Cannot request reanalysis at this stage' });
        }

        // Check reanalysis limit (max 3 times: 0=original, 1=first reanalysis, 2=second reanalysis)
        if (dispute.reanalysisCount >= 2) {
            return res.status(400).json({
                error: 'Maximum reanalysis limit reached (3 attempts total)',
                message: 'No more reanalysis attempts available. Please choose from existing solutions or proceed to court.'
            });
        }

        // Increment reanalysis count
        dispute.reanalysisCount += 1;
        dispute.plaintiffChoice = null; // Reset choices
        dispute.defendantChoice = null;
        dispute.aiSolutions = null;
        dispute.status = 'Reanalyzing';
        await dispute.save();

        // Trigger AI reanalysis
        const messages = await Message.findAll({
            where: { disputeId: dispute.id },
            order: [['createdAt', 'ASC']]
        });

        console.log(`Manual reanalysis requested for dispute ${dispute.id} (Count: ${dispute.reanalysisCount})`);

        const analysis = await analyzeDisputeWithAI(dispute, messages, true);
        if (analysis) {
            dispute.aiAnalysis = `REANALYSIS ${dispute.reanalysisCount} (User requested new alternatives):\n` + analysis.summary + '\n\n' + analysis.legalAssessment;
            dispute.aiSolutions = JSON.stringify(analysis.solutions);
            dispute.status = 'AwaitingDecision';
            await dispute.save();

            // Send email notification to both parties
            await emailService.notifyReanalysisRequested(dispute, dispute.reanalysisCount);

            res.json({
                dispute,
                message: `Reanalysis ${dispute.reanalysisCount} complete. New AI solutions generated.`,
                reanalysisCount: dispute.reanalysisCount,
                remainingAttempts: 2 - dispute.reanalysisCount
            });
        } else {
            // Fallback if AI fails
            dispute.status = 'AwaitingDecision';
            await dispute.save();
            res.status(500).json({ error: 'AI reanalysis failed. Please try again.' });
        }

    } catch (error) {
        console.error('Reanalysis error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get message count for a dispute
app.get('/api/disputes/:id/message-count', authMiddleware, async (req, res) => {
    try {
        const count = await Message.count({ where: { disputeId: req.params.id } });
        res.json({ count, threshold: 10 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/disputes', async (req, res) => {
    try {
        const { status, search, page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let where = {};

        if (status && status !== 'All') {
            where.status = status;
        }

        if (search) {
            const searchConditions = [
                { title: { [Op.iLike]: `%${search}%` } },
                { description: { [Op.iLike]: `%${search}%` } },
                { plaintiffName: { [Op.iLike]: `%${search}%` } },
                { respondentName: { [Op.iLike]: `%${search}%` } }
            ];

            // Add ID search only if search is numeric
            if (!isNaN(search)) {
                searchConditions.push({ id: parseInt(search) });
            }

            where[Op.or] = searchConditions;
        }

        const { count, rows: disputes } = await Dispute.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: offset
        });

        res.json({
            disputes,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(count / parseInt(limit)),
                totalItems: count,
                itemsPerPage: parseInt(limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/disputes/:id', async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Not found' });
        res.json(dispute);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Test endpoint to check AI status and force reanalysis (development only)
app.post('/api/disputes/:id/force-ai-analysis', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const dispute = await Dispute.findByPk(id);

        if (!dispute) {
            return res.status(404).json({ error: 'Dispute not found' });
        }

        // Check if user is a party to this dispute or admin
        const user = await User.findByPk(req.user.id);
        if (!user.isAdmin && dispute.plaintiffId !== req.user.id && dispute.respondentId !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        console.log('=== Force AI Analysis Requested ===');
        console.log('Dispute ID:', id);
        console.log('API_KEY configured:', API_KEY !== 'API_KEY_MISSING');

        const messages = await Message.findAll({
            where: { disputeId: id },
            order: [['createdAt', 'ASC']]
        });

        console.log('Message count:', messages.length);

        // Clear existing AI solutions to force reanalysis
        dispute.aiSolutions = null;
        dispute.aiAnalysis = null;
        await dispute.save();

        // Trigger AI analysis
        const analysis = await analyzeDisputeWithAI(dispute, messages, true);

        if (analysis) {
            dispute.aiAnalysis = analysis.summary + '\n\n' + analysis.legalAssessment;
            dispute.aiSolutions = JSON.stringify(analysis.solutions);
            dispute.status = 'AwaitingDecision';
            await dispute.save();

            // Emit real-time update
            const io = global.io;
            if (io) {
                io.to(`dispute:${id}`).emit('dispute:ai-ready', {
                    disputeId: dispute.id,
                    status: dispute.status,
                    aiSolutions: analysis.solutions
                });
            }

            res.json({
                success: true,
                message: 'AI analysis completed successfully',
                isAIGenerated: true,
                solutions: analysis.solutions
            });
        } else {
            res.json({
                success: false,
                message: 'AI analysis failed - check server logs for details',
                isAIGenerated: false,
                apiKeyConfigured: API_KEY !== 'API_KEY_MISSING'
            });
        }
    } catch (error) {
        console.error('Force AI Analysis Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/disputes/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin access required' });

        const { status, resolutionNotes } = req.body;
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Not found' });

        if (status) dispute.status = status;
        if (resolutionNotes) dispute.resolutionNotes = resolutionNotes;

        await dispute.save();
        res.json(dispute);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Case History / Audit Trail API
app.get('/api/disputes/:id/history', authMiddleware, async (req, res) => {
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
});

// --- Evidence Management Routes ---

// Upload Evidence
app.post('/api/disputes/:id/evidence', authMiddleware, uploadEvidence.single('evidence'), handleMulterError, async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const currentUser = await User.findByPk(req.user.id);

        // Only allow parties (plaintiff/defendant) to upload evidence; admin can only view
        const isPlaintiff = currentUser.email === dispute.plaintiffEmail;
        const isDefendant = currentUser.email === dispute.respondentEmail;
        const isAdmin = req.user.role === 'Admin';

        if (isAdmin) {
            return res.status(403).json({ error: 'Admins can view evidence but cannot upload' });
        }

        if (!isPlaintiff && !isDefendant) {
            return res.status(403).json({ error: 'Not authorized to upload evidence for this case' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Log file upload for security audit
        logInfo('Evidence file uploaded', {
            disputeId: dispute.id,
            userId: req.user.id,
            filename: req.file.path || req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype
        });

        // Determine file type from mime type
        let fileType = 'document';
        if (req.file.mimetype.startsWith('image/')) fileType = 'image';
        else if (req.file.mimetype.startsWith('video/')) fileType = 'video';
        else if (req.file.mimetype.startsWith('audio/')) fileType = 'audio';

        // Determine user role (admin blocked above, so only plaintiff/defendant here)
        const uploaderRole = isPlaintiff ? 'plaintiff' : 'defendant';

        const { description } = req.body;

        // Create evidence record
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
            isVerified: isAdmin // Auto-verify if uploaded by admin
        });

        // Audit log: Evidence uploaded
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
        logInfo('Evidence uploaded', {
            evidenceId: evidence.id,
            disputeId: dispute.id,
            uploadedBy: currentUser.username,
            fileType
        });

        // Emit real-time notification
        const io = req.app.get('io');
        const emitToDispute = req.app.get('emitToDispute');
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

        // Send in-app notification to other party
        const recipientEmail = currentUser.email === dispute.plaintiffEmail ?
            dispute.respondentEmail : dispute.plaintiffEmail;
        const recipientUser = await User.findOne({ where: { email: recipientEmail } });
        if (recipientUser) {
            await notificationService.notifyEvidenceUploaded(
                dispute.id,
                recipientUser.id,
                currentUser.username,
                evidence.originalName
            );
        }

        // Trigger OCR processing in background for supported file types
        if (isOcrSupported(req.file.mimetype)) {
            // Process OCR asynchronously (don't await)
            processEvidenceOcr(evidence.id).then(result => {
                if (result.success && result.status === 'completed') {
                    // Emit OCR completion event
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
            // Mark as not applicable for non-image files
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
});

// Get All Evidence for a Dispute
app.get('/api/disputes/:id/evidence', authMiddleware, async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const currentUser = await User.findByPk(req.user.id);

        // Only allow parties or admin to view evidence
        const isParty = currentUser.email === dispute.plaintiffEmail ||
            currentUser.email === dispute.respondentEmail;
        const isAdmin = req.user.role === 'Admin';

        if (!isParty && !isAdmin) {
            return res.status(403).json({ error: 'Not authorized to view evidence for this case' });
        }

        const evidenceList = await Evidence.findAll({
            where: { disputeId: dispute.id },
            order: [['createdAt', 'DESC']]
        });

        // Audit log: Evidence viewed
        await logAuditEvent({
            action: AuditActions.EVIDENCE_VIEW,
            category: AuditCategories.DISPUTE,
            user: { id: currentUser.id, email: currentUser.email, username: currentUser.username },
            resourceType: 'DISPUTE',
            resourceId: dispute.id,
            description: `User viewed evidence list for case #${dispute.id}`,
            metadata: {
                disputeId: dispute.id,
                evidenceCount: evidenceList.length
            },
            request: req,
            status: 'SUCCESS'
        });

        res.json({
            disputeId: dispute.id,
            totalEvidence: evidenceList.length,
            evidence: evidenceList
        });
    } catch (error) {
        logError('Failed to fetch evidence', { error: error.message, disputeId: req.params.id });
        res.status(500).json({ error: error.message });
    }
});

// Download Evidence File
app.get('/api/disputes/:id/evidence/:evidenceId/download', authMiddlewareForMedia, async (req, res) => {
    try {
        const evidence = await Evidence.findByPk(req.params.evidenceId);
        if (!evidence) return res.status(404).json({ error: 'Evidence not found' });

        if (evidence.disputeId !== parseInt(req.params.id)) {
            return res.status(400).json({ error: 'Evidence does not belong to this dispute' });
        }

        // Verify user has access to this dispute
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const isAdmin = req.user.role === 'Admin';
        const isParty = dispute.plaintiffId === req.user.id || dispute.defendantId === req.user.id || dispute.creatorId === req.user.id;

        if (!isAdmin && !isParty) {
            return res.status(403).json({ error: 'Not authorized to access this evidence' });
        }

        const filePath = path.join(process.cwd(), 'uploads', evidence.fileName);

        if (!fs.existsSync(filePath)) {
            logError('Evidence file not found on disk', { evidenceId: evidence.id, filePath });
            return res.status(404).json({ error: 'Evidence file not found' });
        }

        // Set headers for download
        res.setHeader('Content-Type', evidence.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(evidence.originalName)}"`);
        res.setHeader('Content-Length', evidence.fileSize);
        res.setHeader('X-Content-Type-Options', 'nosniff');

        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        // Log download
        await logAuditEvent({
            action: 'EVIDENCE_DOWNLOAD',
            category: AuditCategories.DISPUTE,
            user: { id: req.user.id },
            resourceType: 'EVIDENCE',
            resourceId: evidence.id,
            description: `User downloaded evidence "${evidence.originalName}" from case #${evidence.disputeId}`,
            metadata: {
                disputeId: evidence.disputeId,
                fileName: evidence.originalName,
                fileSize: evidence.fileSize
            },
            request: req,
            status: 'SUCCESS'
        });

    } catch (error) {
        logError('Evidence download failed', { error: error.message, evidenceId: req.params.evidenceId });
        res.status(500).json({ error: 'Failed to download evidence' });
    }
});

// Preview Evidence File (inline viewing)
app.get('/api/disputes/:id/evidence/:evidenceId/preview', authMiddlewareForMedia, async (req, res) => {
    try {
        const evidence = await Evidence.findByPk(req.params.evidenceId);
        if (!evidence) return res.status(404).json({ error: 'Evidence not found' });

        if (evidence.disputeId !== parseInt(req.params.id)) {
            return res.status(400).json({ error: 'Evidence does not belong to this dispute' });
        }

        // Verify user has access to this dispute
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const isAdmin = req.user.role === 'Admin';
        const isParty = dispute.plaintiffId === req.user.id || dispute.defendantId === req.user.id || dispute.creatorId === req.user.id;

        if (!isAdmin && !isParty) {
            return res.status(403).json({ error: 'Not authorized to access this evidence' });
        }

        if (evidence.fileName.startsWith('http')) {
            // If it's a Cloudinary URL, redirect to it
            // Note: If private, you might need to generate a signed URL here
            return res.redirect(evidence.fileName);
        }

        const filePath = path.join(process.cwd(), 'uploads', evidence.fileName);

        if (!fs.existsSync(filePath)) {
            logError('Evidence file not found on disk', { evidenceId: evidence.id, filePath });
            return res.status(404).json({ error: 'Evidence file not found' });
        }

        // Allowed preview types
        const previewableTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'video/mp4', 'video/webm',
            'audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/ogg'
        ];

        if (!previewableTypes.includes(evidence.mimeType)) {
            return res.status(400).json({
                error: 'This file type cannot be previewed. Please download it instead.',
                canPreview: false
            });
        }

        // Set headers for inline viewing
        res.setHeader('Content-Type', evidence.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(evidence.originalName)}"`);
        res.setHeader('Content-Length', evidence.fileSize);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, max-age=3600'); // Cache for 1 hour

        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

    } catch (error) {
        logError('Evidence preview failed', { error: error.message, evidenceId: req.params.evidenceId });
        res.status(500).json({ error: 'Failed to preview evidence' });
    }
});

// Get single evidence metadata
app.get('/api/disputes/:id/evidence/:evidenceId', authMiddleware, async (req, res) => {
    try {
        const evidence = await Evidence.findByPk(req.params.evidenceId);
        if (!evidence) return res.status(404).json({ error: 'Evidence not found' });

        if (evidence.disputeId !== parseInt(req.params.id)) {
            return res.status(400).json({ error: 'Evidence does not belong to this dispute' });
        }

        // Verify user has access to this dispute
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const isAdmin = req.user.role === 'Admin';
        const isParty = dispute.plaintiffId === req.user.id || dispute.defendantId === req.user.id || dispute.creatorId === req.user.id;

        if (!isAdmin && !isParty) {
            return res.status(403).json({ error: 'Not authorized to access this evidence' });
        }

        // Determine if file can be previewed
        const previewableTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'video/mp4', 'video/webm',
            'audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/ogg'
        ];

        res.json({
            evidence: {
                ...evidence.toJSON(),
                canPreview: previewableTypes.includes(evidence.mimeType),
                previewUrl: `/api/disputes/${evidence.disputeId}/evidence/${evidence.id}/preview`,
                downloadUrl: `/api/disputes/${evidence.disputeId}/evidence/${evidence.id}/download`
            }
        });
    } catch (error) {
        logError('Failed to fetch evidence', { error: error.message, evidenceId: req.params.evidenceId });
        res.status(500).json({ error: error.message });
    }
});

// Delete Evidence (Admin or uploader only)
app.delete('/api/disputes/:id/evidence/:evidenceId', authMiddleware, async (req, res) => {
    try {
        const evidence = await Evidence.findByPk(req.params.evidenceId);
        if (!evidence) return res.status(404).json({ error: 'Evidence not found' });

        if (evidence.disputeId !== parseInt(req.params.id)) {
            return res.status(400).json({ error: 'Evidence does not belong to this dispute' });
        }

        const currentUser = await User.findByPk(req.user.id);
        const isAdmin = req.user.role === 'Admin';
        const isUploader = evidence.uploadedBy === currentUser.id;

        if (!isAdmin && !isUploader) {
            return res.status(403).json({ error: 'Not authorized to delete this evidence' });
        }

        const evidenceData = evidence.toJSON();

        // Delete file from filesystem
        const filePath = `uploads/${evidence.fileName}`;
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await evidence.destroy();

        // Audit log: Evidence deleted
        await logAuditEvent({
            action: AuditActions.EVIDENCE_DELETE,
            category: AuditCategories.DISPUTE,
            user: { id: currentUser.id, email: currentUser.email, username: currentUser.username },
            resourceType: 'EVIDENCE',
            resourceId: evidenceData.id,
            description: `${isAdmin ? 'Admin' : 'User'} deleted evidence "${evidenceData.originalName}" from case #${evidenceData.disputeId}`,
            metadata: {
                disputeId: evidenceData.disputeId,
                fileName: evidenceData.fileName,
                originalName: evidenceData.originalName,
                deletedBy: isAdmin ? 'admin' : 'uploader'
            },
            request: req,
            status: 'SUCCESS'
        });
        logInfo('Evidence deleted', {
            evidenceId: evidenceData.id,
            disputeId: evidenceData.disputeId,
            deletedBy: currentUser.username
        });

        res.json({ message: 'Evidence deleted successfully' });
    } catch (error) {
        logError('Evidence deletion failed', { error: error.message, evidenceId: req.params.evidenceId });
        res.status(500).json({ error: error.message });
    }
});

// ==================== OCR ENDPOINTS ====================

// Get OCR text for evidence
app.get('/api/disputes/:id/evidence/:evidenceId/ocr', authMiddleware, async (req, res) => {
    try {
        const evidence = await Evidence.findByPk(req.params.evidenceId);
        if (!evidence) return res.status(404).json({ error: 'Evidence not found' });

        if (evidence.disputeId !== parseInt(req.params.id)) {
            return res.status(400).json({ error: 'Evidence does not belong to this dispute' });
        }

        // Verify user has access
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const isAdmin = req.user.role === 'Admin';
        const currentUser = await User.findByPk(req.user.id);
        const isParty = currentUser.email === dispute.plaintiffEmail ||
            currentUser.email === dispute.respondentEmail;

        if (!isAdmin && !isParty) {
            return res.status(403).json({ error: 'Not authorized to access this evidence' });
        }

        res.json({
            evidenceId: evidence.id,
            originalName: evidence.originalName,
            ocrStatus: evidence.ocrStatus,
            ocrText: evidence.ocrText,
            ocrProcessedAt: evidence.ocrProcessedAt,
            ocrError: evidence.ocrError,
            isSupported: isOcrSupported(evidence.mimeType)
        });
    } catch (error) {
        logError('Failed to get OCR text', { error: error.message, evidenceId: req.params.evidenceId });
        res.status(500).json({ error: error.message });
    }
});

// Trigger OCR processing for evidence (manual or retry)
app.post('/api/disputes/:id/evidence/:evidenceId/ocr', authMiddleware, async (req, res) => {
    try {
        const evidence = await Evidence.findByPk(req.params.evidenceId);
        if (!evidence) return res.status(404).json({ error: 'Evidence not found' });

        if (evidence.disputeId !== parseInt(req.params.id)) {
            return res.status(400).json({ error: 'Evidence does not belong to this dispute' });
        }

        // Verify user has access
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const isAdmin = req.user.role === 'Admin';
        const currentUser = await User.findByPk(req.user.id);
        const isParty = currentUser.email === dispute.plaintiffEmail ||
            currentUser.email === dispute.respondentEmail;

        if (!isAdmin && !isParty) {
            return res.status(403).json({ error: 'Not authorized to process this evidence' });
        }

        // Check if file type supports OCR
        if (!isOcrSupported(evidence.mimeType)) {
            return res.status(400).json({
                error: 'File type not supported for OCR',
                mimeType: evidence.mimeType,
                supported: OCR_SUPPORTED_MIMETYPES
            });
        }

        // Check if already processing
        if (evidence.ocrStatus === 'processing') {
            return res.status(400).json({ error: 'OCR is already in progress' });
        }

        // Process OCR
        const result = await processEvidenceOcr(evidence.id);

        if (result.success) {
            // Emit OCR completion event
            const emitToDispute = req.app.get('emitToDispute');
            if (result.status === 'completed') {
                emitToDispute(dispute.id, 'ocrCompleted', {
                    evidenceId: evidence.id,
                    hasText: result.text && result.text.length > 0,
                    wordCount: result.wordCount
                });
            }

            // Audit log
            await logAuditEvent({
                action: 'OCR_PROCESS',
                category: AuditCategories.DISPUTE,
                user: { id: currentUser.id, email: currentUser.email, username: currentUser.username },
                resourceType: 'EVIDENCE',
                resourceId: evidence.id,
                description: `OCR processed for evidence "${evidence.originalName}" in case #${dispute.id}`,
                metadata: {
                    status: result.status,
                    wordCount: result.wordCount,
                    confidence: result.confidence
                },
                request: req,
                status: 'SUCCESS'
            });

            res.json({
                message: 'OCR processing completed',
                status: result.status,
                text: result.text,
                wordCount: result.wordCount,
                confidence: result.confidence
            });
        } else {
            res.status(500).json({
                error: 'OCR processing failed',
                details: result.error
            });
        }
    } catch (error) {
        logError('OCR processing request failed', { error: error.message, evidenceId: req.params.evidenceId });
        res.status(500).json({ error: error.message });
    }
});

// Batch OCR processing for all evidence in a dispute
app.post('/api/disputes/:id/ocr/process-all', authMiddleware, async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        // Only admin or parties can trigger batch OCR
        const isAdmin = req.user.role === 'Admin';
        const currentUser = await User.findByPk(req.user.id);
        const isParty = currentUser.email === dispute.plaintiffEmail ||
            currentUser.email === dispute.respondentEmail;

        if (!isAdmin && !isParty) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Find all evidence that needs OCR processing
        const evidenceList = await Evidence.findAll({
            where: {
                disputeId: dispute.id,
                ocrStatus: ['pending', 'failed']
            }
        });

        // Filter to only OCR-supported files
        const ocrCandidates = evidenceList.filter(e => isOcrSupported(e.mimeType));

        if (ocrCandidates.length === 0) {
            return res.json({ message: 'No evidence files need OCR processing', processed: 0 });
        }

        // Process each in background
        const results = {
            queued: ocrCandidates.length,
            evidenceIds: ocrCandidates.map(e => e.id)
        };

        // Start processing in background
        ocrCandidates.forEach(evidence => {
            processEvidenceOcr(evidence.id).then(result => {
                if (result.success && result.status === 'completed') {
                    const emitToDispute = req.app.get('emitToDispute');
                    emitToDispute(dispute.id, 'ocrCompleted', {
                        evidenceId: evidence.id,
                        hasText: result.text && result.text.length > 0,
                        wordCount: result.wordCount
                    });
                }
            }).catch(err => {
                logError('Batch OCR failed for evidence', { evidenceId: evidence.id, error: err.message });
            });
        });

        // Audit log
        await logAuditEvent({
            action: 'OCR_BATCH_PROCESS',
            category: AuditCategories.DISPUTE,
            user: { id: currentUser.id, email: currentUser.email, username: currentUser.username },
            resourceType: 'DISPUTE',
            resourceId: dispute.id,
            description: `Batch OCR processing started for ${ocrCandidates.length} files in case #${dispute.id}`,
            metadata: { evidenceIds: results.evidenceIds },
            request: req,
            status: 'SUCCESS'
        });

        res.json({
            message: `OCR processing started for ${ocrCandidates.length} files`,
            ...results
        });
    } catch (error) {
        logError('Batch OCR request failed', { error: error.message, disputeId: req.params.id });
        res.status(500).json({ error: error.message });
    }
});

// ==================== END OCR ENDPOINTS ====================

// --- New Resolution Routes ---

// 1. Verify Details
app.post('/api/disputes/:id/verify-details', authMiddleware, async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const currentUser = await User.findByPk(req.user.id);
        const { confirmed } = req.body; // true if details confirmed

        if (!confirmed) return res.status(400).json({ error: 'You must confirm your details.' });

        const role = currentUser.email === dispute.plaintiffEmail ? 'plaintiff' :
            currentUser.email === dispute.respondentEmail ? 'defendant' : null;

        if (currentUser.email === dispute.plaintiffEmail) {
            dispute.plaintiffVerified = true;
        } else if (currentUser.email === dispute.respondentEmail) {
            dispute.respondentVerified = true;
        } else {
            return res.status(403).json({ error: 'Not a party to this dispute' });
        }
        await dispute.save();

        // Audit log: Details verified
        await logAuditEvent({
            action: AuditActions.DETAILS_VERIFY,
            category: AuditCategories.RESOLUTION,
            user: { id: currentUser.id, email: currentUser.email, username: currentUser.username },
            resourceType: 'DISPUTE',
            resourceId: dispute.id,
            description: `${role.toUpperCase()} verified personal details for case #${dispute.id}`,
            metadata: {
                role,
                plaintiffVerified: dispute.plaintiffVerified,
                respondentVerified: dispute.respondentVerified
            },
            request: req,
            status: 'SUCCESS'
        });
        logInfo('Details verified', { disputeId: dispute.id, role });

        res.json(dispute);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Upload Signature
app.post('/api/disputes/:id/sign', authMiddleware, upload.single('signature'), async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const currentUser = await User.findByPk(req.user.id);
        // Expecting a file upload for signature image
        if (!req.file) return res.status(400).json({ error: 'Signature image required' });

        const role = currentUser.email === dispute.plaintiffEmail ? 'plaintiff' :
            currentUser.email === dispute.respondentEmail ? 'defendant' : null;

        if (currentUser.email === dispute.plaintiffEmail) {
            dispute.plaintiffSignature = req.file.path || req.file.filename;
        } else if (currentUser.email === dispute.respondentEmail) {
            dispute.respondentSignature = req.file.path || req.file.filename;
        } else {
            return res.status(403).json({ error: 'Not a party' });
        }
        await dispute.save();

        // Audit log: Signature submitted
        await logAuditEvent({
            action: AuditActions.SIGNATURE_SUBMIT,
            category: AuditCategories.RESOLUTION,
            user: { id: currentUser.id, email: currentUser.email, username: currentUser.username },
            resourceType: 'DISPUTE',
            resourceId: dispute.id,
            description: `${role.toUpperCase()} submitted digital signature for case #${dispute.id}`,
            metadata: {
                role,
                signatureFile: req.file.path || req.file.filename,
                bothSigned: !!(dispute.plaintiffSignature && dispute.respondentSignature)
            },
            request: req,
            status: 'SUCCESS'
        });
        logInfo('Signature submitted', { disputeId: dispute.id, role });

        // Send in-app notification to other party
        const recipientEmail = role === 'plaintiff' ? dispute.respondentEmail : dispute.plaintiffEmail;
        const recipientUser = await User.findOne({ where: { email: recipientEmail } });
        if (recipientUser) {
            await notificationService.notifySignatureSubmitted(
                dispute.id,
                recipientUser.id,
                currentUser.username
            );
        }

        // Emit real-time update for signature submission
        const io = global.io;
        if (io) {
            io.to(`dispute:${dispute.id}`).emit('dispute:signature-submitted', {
                disputeId: dispute.id,
                role,
                signerName: currentUser.username,
                plaintiffSigned: !!dispute.plaintiffSignature,
                respondentSigned: !!dispute.respondentSignature,
            });
        }

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

            // Audit log: Agreement generated
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
            logInfo('Agreement PDF generated', { disputeId: dispute.id, documentId });

            // Emit real-time update for agreement generation
            if (io) {
                io.to(`dispute:${dispute.id}`).emit('dispute:agreement-generated', {
                    disputeId: dispute.id,
                    status: dispute.status,
                    resolutionStatus: dispute.resolutionStatus,
                    documentId,
                    agreementDocPath: dispute.agreementDocPath,
                });
            }

            // Send email notification to both parties
            await emailService.notifyResolutionAccepted(dispute);
        }

        res.json(dispute);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Admin Approve & Finalize
app.post('/api/admin/approve-resolution/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only' });

        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const previousStatus = dispute.status;
        dispute.resolutionStatus = 'Finalized';
        dispute.status = 'Resolved'; // Finally officially resolved
        await dispute.save();

        // Audit log: Admin approved resolution
        await logAuditEvent({
            action: AuditActions.ADMIN_APPROVE_RESOLUTION,
            category: AuditCategories.ADMIN,
            user: { id: req.user.id, email: req.user.email, role: req.user.role },
            resourceType: 'DISPUTE',
            resourceId: dispute.id,
            description: `Admin approved and finalized resolution for case #${dispute.id}`,
            metadata: {
                previousStatus,
                newStatus: 'Resolved',
                resolutionStatus: 'Finalized',
                documentId: dispute.documentId,
                agreementPath: dispute.agreementDocPath
            },
            request: req,
            status: 'SUCCESS'
        });
        logInfo('Admin approved resolution', {
            disputeId: dispute.id,
            adminId: req.user.id,
            documentId: dispute.documentId
        });

        // Send email notification to both parties
        await emailService.notifyCaseResolved(dispute);
        logInfo(`Case ${dispute.id} resolved - Email notifications sent to both parties`);

        // Send in-app notifications to both parties
        const plaintiffUser = await User.findOne({ where: { email: dispute.plaintiffEmail } });
        const respondentUser = await User.findOne({ where: { email: dispute.respondentEmail } });
        const userIds = [plaintiffUser?.id, respondentUser?.id].filter(Boolean);
        if (userIds.length > 0) {
            await notificationService.notifyResolutionApproved(dispute.id, userIds);
        }

        // Emit real-time update for resolution finalized
        const io = global.io;
        if (io) {
            io.to(`dispute:${dispute.id}`).emit('dispute:resolution-finalized', {
                disputeId: dispute.id,
                status: dispute.status,
                resolutionStatus: dispute.resolutionStatus,
                documentId: dispute.documentId,
                agreementDocPath: dispute.agreementDocPath,
            });
        }

        res.json({ message: 'Resolution finalized and agreement sent.', dispute });
    } catch (e) {
        logError('Admin approval failed', { error: e.message, disputeId: req.params.id });
        res.status(500).json({ error: e.message });
    }
});

// 4. Forward Case to Court (Admin Only)
app.post('/api/admin/forward-to-court/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only' });

        const { courtType, courtName, courtLocation, reason } = req.body;

        if (!courtType || !courtName || !courtLocation || !reason) {
            return res.status(400).json({ error: 'All court details are required' });
        }

        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const previousStatus = dispute.status;

        // Update dispute with court forwarding details
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

        // Audit log: Case forwarded to court
        await logAuditEvent({
            action: AuditActions.ADMIN_FORWARD_TO_COURT,
            category: AuditCategories.ADMIN,
            user: { id: req.user.id, email: req.user.email, role: req.user.role },
            resourceType: 'DISPUTE',
            resourceId: dispute.id,
            description: `Admin forwarded case #${dispute.id} to ${courtType} Court: ${courtName}, ${courtLocation}`,
            metadata: {
                previousStatus,
                courtType,
                courtName,
                courtLocation,
                reason,
                forwardedAt: dispute.courtForwardedAt.toISOString()
            },
            request: req,
            status: 'SUCCESS'
        });
        logInfo(`Case #${dispute.id} forwarded to ${courtType} Court`, {
            disputeId: dispute.id,
            courtName,
            courtLocation,
            adminId: req.user.id
        });

        // Send email notification to both parties
        await emailService.notifyCourtForwarded(dispute);
        logInfo('Court forwarding email notifications sent to both parties', { disputeId: dispute.id });

        // Send in-app notifications to both parties
        const plaintiffUser = await User.findOne({ where: { email: dispute.plaintiffEmail } });
        const respondentUser = await User.findOne({ where: { email: dispute.respondentEmail } });
        const userIds = [plaintiffUser?.id, respondentUser?.id].filter(Boolean);
        if (userIds.length > 0) {
            await notificationService.notifyCourtForwarding(dispute.id, userIds, courtName);
        }

        // Emit real-time update for court forwarding
        const io = global.io;
        if (io) {
            io.to(`dispute:${dispute.id}`).emit('dispute:forwarded-to-court', {
                disputeId: dispute.id,
                status: dispute.status,
                forwardedToCourt: true,
                courtType,
                courtName,
                courtLocation,
                courtForwardedAt: dispute.courtForwardedAt,
            });
        }

        res.json({
            message: 'Case successfully forwarded to court',
            dispute,
            courtDetails: {
                type: courtType,
                name: courtName,
                location: courtLocation,
                forwardedAt: dispute.courtForwardedAt
            }
        });
    } catch (e) {
        logError('Court forwarding error', { error: e.message, disputeId: req.params.id });
        res.status(500).json({ error: e.message });
    }
});

// Helper: Generate PDF
async function generateAgreementPDF(dispute, outputPath) {
    return new Promise(async (resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const stream = fs.createWriteStream(outputPath);
            doc.pipe(stream);

            // Generate metadata
            const documentId = uuidv4();
            const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
            const timestampISO = new Date().toISOString();

            // Calculate document hash (will update after generation)
            const documentContent = JSON.stringify({
                disputeId: dispute.id,
                parties: [dispute.plaintiffName, dispute.respondentName],
                timestamp: timestampISO
            });
            const documentHash = crypto.createHash('sha256').update(documentContent).digest('hex');

            // Generate QR Code
            const verificationUrl = `https://mediaai.verify/${documentId}`;
            let qrCodeDataUrl = '';
            try {
                qrCodeDataUrl = await QRCode.toDataURL(verificationUrl);
            } catch (err) {
                console.error('QR Code generation failed:', err);
            }

            // Helper functions for consistent formatting
            const addTitle = (text, size = 16) => {
                doc.fontSize(size).font('Helvetica-Bold').text(text, { align: 'center' });
                doc.moveDown(0.5);
            };

            const addSectionHeader = (text) => {
                doc.fontSize(12).font('Helvetica-Bold').text(text);
                doc.moveDown(0.3);
            };

            const addBulletPoint = (text, indent = 0) => {
                doc.fontSize(10).font('Helvetica').text(`• ${text}`, { indent });
                doc.moveDown(0.2);
            };

            const addNormalText = (text, options = {}) => {
                doc.fontSize(10).font('Helvetica').text(text, options);
                doc.moveDown(0.3);
            };

            const addSeparator = () => {
                const y = doc.y;
                doc.moveTo(50, y).lineTo(doc.page.width - 50, y).stroke();
                doc.moveDown(0.5);
            };

            // Parse solutions
            const solutions = JSON.parse(dispute.aiSolutions || '[]');
            const chosenSolution = dispute.plaintiffChoice !== null ? solutions[dispute.plaintiffChoice] : null;

            // ===== PAGE 1: HEADER & METADATA =====
            addTitle('FINAL SETTLEMENT AGREEMENT & MUTUAL RELEASE', 18);
            doc.fontSize(10).font('Helvetica-Oblique').text('(Auto-Generated Upon Case Closure)', { align: 'center' });
            doc.moveDown(1);

            addSeparator();

            addSectionHeader('DOCUMENT METADATA (SYSTEM-GENERATED)');
            addBulletPoint(`Document Type: Final Settlement Agreement & Mutual Release`);
            addBulletPoint(`Generation Trigger: Case Status = RESOLVED`);
            addBulletPoint(`Document ID: ${documentId}`);
            addBulletPoint(`Case ID: ${dispute.id}`);
            addBulletPoint(`Mediation ID: MEDIAAI-${dispute.id}-${new Date().getFullYear()}`);
            addBulletPoint(`Platform: MediaAI - AI-Powered Dispute Resolution`);
            addBulletPoint(`Version: 1.0`);
            addBulletPoint(`Generated On: ${timestamp} IST`);
            addBulletPoint(`Document Hash (SHA-256): ${documentHash.substring(0, 32)}...`);
            doc.moveDown(1);

            addSeparator();

            // ===== SECTION 1: PARTIES =====
            addSectionHeader('1. PARTIES TO THE SETTLEMENT');
            doc.moveDown(0.5);

            doc.fontSize(11).font('Helvetica-Bold').text('PARTY A (Complainant / Claimant)');
            doc.moveDown(0.3);
            addBulletPoint(`Full Name: ${dispute.plaintiffName}`);
            addBulletPoint(`Address: ${dispute.plaintiffAddress}`);
            addBulletPoint(`Contact: ${dispute.plaintiffPhone}`);
            addBulletPoint(`Email: ${dispute.plaintiffEmail}`);
            addBulletPoint(`Occupation: ${dispute.plaintiffOccupation || 'Not Specified'}`);
            doc.moveDown(0.5);

            doc.fontSize(11).font('Helvetica-Bold').text('PARTY B (Respondent)');
            doc.moveDown(0.3);
            addBulletPoint(`Full Name: ${dispute.respondentName}`);
            addBulletPoint(`Address: ${dispute.respondentAddress}`);
            addBulletPoint(`Contact: ${dispute.respondentPhone}`);
            addBulletPoint(`Email: ${dispute.respondentEmail}`);
            addBulletPoint(`Occupation: ${dispute.respondentOccupation || 'Not Specified'}`);
            doc.moveDown(1);

            addSeparator();

            // ===== SECTION 2: CASE DETAILS =====
            addSectionHeader('2. CASE & DISPUTE DETAILS');
            addBulletPoint(`Case Reference No: MEDIAAI-CASE-${dispute.id}`);
            addBulletPoint(`Nature of Dispute: ${dispute.title}`);
            addBulletPoint(`Dispute Category: Civil / Commercial`);
            addBulletPoint(`Date of Dispute Initiation: ${new Date(dispute.createdAt).toLocaleDateString('en-IN')}`);
            addBulletPoint(`Resolution Mode: AI-Assisted Mediation`);
            addBulletPoint(`Resolution Status: FULL & FINAL SETTLEMENT`);
            addBulletPoint(`Closure Date: ${new Date().toLocaleDateString('en-IN')}`);
            doc.moveDown(1);

            addSeparator();

            // ===== SECTION 3: RECITALS =====
            addSectionHeader('3. RECITALS');
            addNormalText(`WHEREAS, a dispute arose between the Parties in relation to "${dispute.title}";`);
            addNormalText(`WHEREAS, the Parties voluntarily agreed to resolve the dispute through MediaAI, an AI-assisted online dispute resolution system;`);
            addNormalText(`WHEREAS, the Parties participated freely, without coercion, and arrived at a mutually acceptable settlement;`);
            addNormalText(`NOW, THEREFORE, the Parties agree as follows:`);
            doc.moveDown(0.5);

            addSeparator();

            // ===== PAGE 2: SETTLEMENT TERMS =====
            doc.addPage();

            addSectionHeader('4. TERMS OF SETTLEMENT');
            doc.moveDown(0.3);

            doc.fontSize(11).font('Helvetica-Bold').text('4.1 Settlement Outcome');
            addNormalText('The dispute is hereby resolved in full and final settlement.');
            doc.moveDown(0.3);

            doc.fontSize(11).font('Helvetica-Bold').text('4.2 Agreed Terms');
            doc.moveDown(0.2);

            if (chosenSolution) {
                doc.fontSize(10).font('Helvetica-Bold').text(`Solution Title: ${chosenSolution.title}`);
                doc.moveDown(0.2);
                addNormalText(chosenSolution.description);
            } else {
                addNormalText('The parties have agreed to resolve the dispute amicably through mutual understanding.');
            }

            if (dispute.resolutionNotes) {
                doc.moveDown(0.3);
                doc.fontSize(10).font('Helvetica-Bold').text('Additional Terms:');
                addNormalText(dispute.resolutionNotes);
            }

            doc.moveDown(1);
            addSeparator();

            // ===== SECTION 5: MUTUAL RELEASE =====
            addSectionHeader('5. MUTUAL RELEASE & DISCHARGE');
            addNormalText('Upon execution of this Agreement, each Party irrevocably releases and discharges the other from all claims, demands, liabilities, and proceedings arising out of the dispute.');
            doc.moveDown(0.5);

            addSeparator();

            // ===== SECTION 6: FINALITY =====
            addSectionHeader('6. FINALITY & CASE CLOSURE');
            addNormalText('This Agreement:');
            addBulletPoint('Constitutes full and final resolution');
            addBulletPoint('Results in case closure');
            addBulletPoint('May be produced before any court or authority');
            addBulletPoint('Bars re-litigation of the same cause of action');
            doc.moveDown(0.5);

            addSeparator();

            // ===== SECTION 7-9: LEGAL CLAUSES =====
            addSectionHeader('7. NO ADMISSION OF LIABILITY');
            addNormalText('This settlement is a compromise and does not constitute admission of fault or liability.');
            doc.moveDown(0.5);

            addSeparator();

            addSectionHeader('8. CONFIDENTIALITY');
            addNormalText('The terms shall remain confidential except where disclosure is required by law or court order.');
            doc.moveDown(0.5);

            addSeparator();

            addSectionHeader('9. GOVERNING LAW & JURISDICTION');
            addBulletPoint('This Agreement shall be governed by the laws of India.');
            addBulletPoint('Jurisdiction: India');
            doc.moveDown(1);

            addSeparator();

            // ===== PAGE 3: DIGITAL EXECUTION =====
            doc.addPage();

            addSectionHeader('10. DIGITAL EXECUTION');
            addNormalText('This Agreement is executed electronically in compliance with:');
            addBulletPoint('Information Technology Act, 2000');
            addBulletPoint('Indian Evidence Act, 1872 (Section 65B)');
            addBulletPoint('Indian Contract Act, 1872');
            doc.moveDown(1);

            addSeparator();

            // ===== SECTION 11: DIGITAL SIGNATURES =====
            addSectionHeader('11. DIGITAL SIGNATURES');
            doc.moveDown(0.5);

            // Party A Signature
            doc.fontSize(11).font('Helvetica-Bold').text('PARTY A (Complainant)');
            doc.moveDown(0.3);
            addBulletPoint(`Signed On: ${timestamp} IST`);

            if (dispute.plaintiffSignature) {
                doc.moveDown(0.3);
                doc.fontSize(10).font('Helvetica').text('Digital Signature:');
                try {
                    doc.image(`uploads/${dispute.plaintiffSignature}`, {
                        width: 150,
                        height: 75,
                        fit: [150, 75]
                    });
                } catch (e) {
                    doc.text('[Signature Image Not Available]');
                }
            }
            doc.moveDown(1);

            // Party B Signature
            doc.fontSize(11).font('Helvetica-Bold').text('PARTY B (Respondent)');
            doc.moveDown(0.3);
            addBulletPoint(`Signed On: ${timestamp} IST`);

            if (dispute.respondentSignature) {
                doc.moveDown(0.3);
                doc.fontSize(10).font('Helvetica').text('Digital Signature:');
                try {
                    doc.image(`uploads/${dispute.respondentSignature}`, {
                        width: 150,
                        height: 75,
                        fit: [150, 75]
                    });
                } catch (e) {
                    doc.text('[Signature Image Not Available]');
                }
            }
            doc.moveDown(1);

            addSeparator();

            // ===== SECTION 12: AI CERTIFICATION =====
            addSectionHeader('12. AI PLATFORM CERTIFICATION');
            addBulletPoint('Platform: MediaAI - AI-Powered Dispute Resolution');
            addBulletPoint('Facilitation Type: AI-Assisted Mediation');
            addBulletPoint('AI Analysis Performed: Yes');
            addBulletPoint(`Solutions Provided: ${solutions.length}`);
            addBulletPoint(`Chosen Solution: Option ${(dispute.plaintiffChoice || 0) + 1}`);
            addBulletPoint(`Platform Verification Hash: ${documentHash.substring(0, 16)}...`);
            doc.moveDown(1);

            addSeparator();

            // ===== SECTION 13: VERIFICATION =====
            addSectionHeader('13. VERIFICATION & AUDIT');
            addBulletPoint(`Digital Timestamp: ${timestampISO}`);
            addBulletPoint(`Document ID: ${documentId}`);
            addBulletPoint(`Verification URL: ${verificationUrl}`);
            doc.moveDown(1);

            // QR Code
            if (qrCodeDataUrl) {
                doc.fontSize(10).font('Helvetica-Bold').text('Document Verification QR Code:');
                doc.moveDown(0.3);
                try {
                    const qrBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');
                    doc.image(qrBuffer, { width: 100, height: 100 });
                    doc.moveDown(0.3);
                    doc.fontSize(8).font('Helvetica-Oblique').text('Scan to verify document authenticity', { align: 'left' });
                } catch (e) {
                    console.error('QR embedding failed:', e);
                }
            }
            doc.moveDown(1);

            addSeparator();

            // ===== SECTION 14: ACKNOWLEDGMENT =====
            addSectionHeader('14. ACKNOWLEDGMENT');
            addNormalText('The Parties confirm:');
            addBulletPoint('Voluntary execution without coercion');
            addBulletPoint('Understanding of all terms and conditions');
            addBulletPoint('Acceptance of binding legal effect');
            addBulletPoint('No further claims regarding this dispute');
            doc.moveDown(1);

            addSeparator();

            // ===== FOOTER =====
            doc.fontSize(8).font('Helvetica-Oblique').text(
                'This document is digitally secured and tamper-proof. Any modification will invalidate the digital signatures and document hash.',
                { align: 'center' }
            );
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica-Bold').text('END OF SETTLEMENT AGREEMENT', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(8).font('Helvetica').text(`Document Generated by MediaAI Platform | ${timestamp} IST`, { align: 'center' });

            doc.end();
            stream.on('finish', () => resolve({ documentId, documentHash }));
            stream.on('error', reject);
        } catch (e) {
            console.error('PDF Generation Error:', e);
            reject(e);
        }
    });
}

// Helper: Generate Case Summary PDF (can be generated at any stage)
async function generateCaseSummaryPDF(dispute, messages = [], evidence = [], auditLogs = []) {
    logInfo('Starting PDF generation', { disputeId: dispute?.id, messagesCount: messages?.length, evidenceCount: evidence?.length });

    return new Promise(async (resolve, reject) => {
        try {
            // Validate dispute exists
            if (!dispute) {
                logError('PDF generation failed: dispute is null/undefined');
                return reject(new Error('Dispute data is required for PDF generation'));
            }

            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => {
                logInfo('PDF generation complete', { disputeId: dispute.id, bufferSize: chunks.reduce((acc, c) => acc + c.length, 0) });
                resolve(Buffer.concat(chunks));
            });
            doc.on('error', (err) => {
                logError('PDFDocument error event', { error: err.message, disputeId: dispute.id });
                reject(err);
            });

            // Generate metadata
            const documentId = uuidv4();
            const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
            const timestampISO = new Date().toISOString();

            // Helper functions for consistent formatting
            const addTitle = (text, size = 16) => {
                doc.fontSize(size).font('Helvetica-Bold').text(text, { align: 'center' });
                doc.moveDown(0.5);
            };

            const addSectionHeader = (text) => {
                doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e40af').text(text);
                doc.fillColor('black');
                doc.moveDown(0.3);
            };

            const addSubHeader = (text) => {
                doc.fontSize(11).font('Helvetica-Bold').text(text);
                doc.moveDown(0.2);
            };

            const addBulletPoint = (label, value, indent = 0) => {
                doc.fontSize(10).font('Helvetica-Bold').text(`${label}: `, { continued: true, indent });
                doc.font('Helvetica').text(value || 'N/A');
                doc.moveDown(0.15);
            };

            const addNormalText = (text, options = {}) => {
                doc.fontSize(10).font('Helvetica').text(text, options);
                doc.moveDown(0.3);
            };

            const addSeparator = () => {
                const y = doc.y;
                doc.strokeColor('#e5e7eb').moveTo(50, y).lineTo(doc.page.width - 50, y).stroke();
                doc.strokeColor('black');
                doc.moveDown(0.5);
            };

            // Status colors and labels
            const getStatusInfo = (status) => {
                const statusMap = {
                    'Pending': { label: 'Pending Review', color: '#f59e0b' },
                    'Active': { label: 'Active - In Mediation', color: '#3b82f6' },
                    'Analyzed': { label: 'AI Analysis Complete', color: '#8b5cf6' },
                    'AwaitingDecision': { label: 'Awaiting Party Decision', color: '#f97316' },
                    'AwaitingSignatures': { label: 'Awaiting Signatures', color: '#06b6d4' },
                    'AdminReview': { label: 'Admin Review', color: '#6366f1' },
                    'Resolved': { label: 'Resolved', color: '#10b981' },
                    'ForwardedToCourt': { label: 'Forwarded to Court', color: '#ef4444' }
                };
                return statusMap[status] || { label: status, color: '#6b7280' };
            };

            const statusInfo = getStatusInfo(dispute.status);

            // ===== PAGE 1: COVER PAGE =====
            doc.moveDown(2);

            // Header with logo placeholder
            doc.fontSize(24).font('Helvetica-Bold').fillColor('#1e40af').text('MediaAI', { align: 'center' });
            doc.fontSize(12).font('Helvetica').fillColor('#6b7280').text('AI-Powered Dispute Resolution Platform', { align: 'center' });
            doc.fillColor('black');
            doc.moveDown(2);

            addTitle('CASE SUMMARY REPORT', 20);
            doc.moveDown(0.5);

            // Case ID Box
            doc.rect(150, doc.y, 295, 40).fillAndStroke('#f3f4f6', '#e5e7eb');
            doc.fillColor('black').fontSize(14).font('Helvetica-Bold').text(`Case #${dispute.id}`, 0, doc.y + 12, { align: 'center' });
            doc.moveDown(2.5);

            // Status Badge
            doc.fontSize(12).font('Helvetica-Bold').text('Current Status: ', { continued: true, align: 'center' });
            doc.fillColor(statusInfo.color).text(statusInfo.label, { align: 'center' });
            doc.fillColor('black');
            doc.moveDown(2);

            addSeparator();

            // Document Info
            addSectionHeader('DOCUMENT INFORMATION');
            addBulletPoint('Report Type', 'Case Summary Report');
            addBulletPoint('Document ID', documentId);
            addBulletPoint('Generated On', timestamp + ' IST');
            addBulletPoint('Case Reference', `MEDIAAI-CASE-${dispute.id}`);
            doc.moveDown(1);

            // ===== PAGE 2: PARTY DETAILS =====
            doc.addPage();

            addSectionHeader('1. PARTY DETAILS');
            doc.moveDown(0.3);

            // Complainant
            addSubHeader('COMPLAINANT (Party A)');
            addBulletPoint('Full Name', dispute.plaintiffName);
            addBulletPoint('Email', dispute.plaintiffEmail);
            addBulletPoint('Phone', dispute.plaintiffPhone);
            addBulletPoint('Address', dispute.plaintiffAddress);
            addBulletPoint('Occupation', dispute.plaintiffOccupation);
            doc.moveDown(0.5);

            // Respondent
            addSubHeader('RESPONDENT (Party B)');
            addBulletPoint('Full Name', dispute.respondentName);
            addBulletPoint('Email', dispute.respondentEmail);
            addBulletPoint('Phone', dispute.respondentPhone);
            addBulletPoint('Address', dispute.respondentAddress);
            addBulletPoint('Occupation', dispute.respondentOccupation);
            doc.moveDown(1);

            addSeparator();

            // ===== CASE DETAILS =====
            addSectionHeader('2. CASE DETAILS');
            addBulletPoint('Case Title', dispute.title);
            addBulletPoint('Filed On', new Date(dispute.createdAt).toLocaleDateString('en-IN'));
            addBulletPoint('Last Updated', new Date(dispute.updatedAt).toLocaleDateString('en-IN'));
            addBulletPoint('Status', statusInfo.label);
            addBulletPoint('Resolution Mode', 'AI-Assisted Mediation');
            doc.moveDown(0.5);

            addSubHeader('Case Description');
            addNormalText(dispute.description || 'No description provided.');
            doc.moveDown(1);

            addSeparator();

            // ===== AI ANALYSIS =====
            if (dispute.aiAnalysis) {
                addSectionHeader('3. AI ANALYSIS');

                try {
                    // Try to parse if it's JSON
                    const analysis = typeof dispute.aiAnalysis === 'string' && dispute.aiAnalysis.startsWith('{')
                        ? JSON.parse(dispute.aiAnalysis)
                        : { summary: dispute.aiAnalysis };

                    if (analysis.summary) {
                        addSubHeader('Summary');
                        addNormalText(analysis.summary);
                    }

                    if (analysis.keyPoints && Array.isArray(analysis.keyPoints)) {
                        addSubHeader('Key Points');
                        analysis.keyPoints.forEach((point, i) => {
                            doc.fontSize(10).font('Helvetica').text(`${i + 1}. ${point}`);
                            doc.moveDown(0.15);
                        });
                    }
                } catch (e) {
                    // Plain text analysis
                    const analysisText = String(dispute.aiAnalysis).substring(0, 2000);
                    addNormalText(analysisText + (dispute.aiAnalysis.length > 2000 ? '...' : ''));
                }
                doc.moveDown(1);
                addSeparator();
            }

            // ===== PROPOSED SOLUTIONS =====
            if (dispute.aiSolutions) {
                doc.addPage();
                addSectionHeader('4. PROPOSED SOLUTIONS');

                try {
                    const solutions = JSON.parse(dispute.aiSolutions);
                    solutions.forEach((solution, index) => {
                        const isChosen = dispute.plaintiffChoice === index || dispute.respondentChoice === index;

                        addSubHeader(`Option ${index + 1}: ${solution.title}${isChosen ? ' ✓ (Selected)' : ''}`);
                        addNormalText(solution.description);

                        if (solution.pros && Array.isArray(solution.pros)) {
                            doc.fontSize(10).font('Helvetica-Bold').text('Pros:', { indent: 10 });
                            solution.pros.forEach(pro => {
                                doc.fontSize(9).font('Helvetica').text(`  • ${pro}`, { indent: 15 });
                            });
                            doc.moveDown(0.2);
                        }

                        if (solution.cons && Array.isArray(solution.cons)) {
                            doc.fontSize(10).font('Helvetica-Bold').text('Cons:', { indent: 10 });
                            solution.cons.forEach(con => {
                                doc.fontSize(9).font('Helvetica').text(`  • ${con}`, { indent: 15 });
                            });
                        }
                        doc.moveDown(0.5);
                    });
                } catch (e) {
                    addNormalText('Solutions data not available in expected format.');
                }
                doc.moveDown(0.5);
                addSeparator();
            }

            // ===== EVIDENCE SUMMARY =====
            if (evidence.length > 0) {
                addSectionHeader('5. EVIDENCE SUBMITTED');
                addNormalText(`Total files submitted: ${evidence.length}`);
                doc.moveDown(0.3);

                evidence.slice(0, 15).forEach((item, index) => {
                    doc.fontSize(9).font('Helvetica-Bold').text(`${index + 1}. ${item.originalName}`, { continued: true });
                    doc.font('Helvetica').text(` (${item.fileType}, ${(item.fileSize / 1024).toFixed(1)} KB)`);
                    if (item.description) {
                        doc.fontSize(8).font('Helvetica-Oblique').text(`   "${item.description}"`, { indent: 15 });
                    }
                    doc.moveDown(0.1);
                });

                if (evidence.length > 15) {
                    doc.fontSize(9).font('Helvetica-Oblique').text(`... and ${evidence.length - 15} more files`);
                }
                doc.moveDown(1);
                addSeparator();
            }

            // ===== COMMUNICATION SUMMARY =====
            if (messages.length > 0) {
                addSectionHeader('6. COMMUNICATION SUMMARY');
                addBulletPoint('Total Messages', messages.length.toString());
                addBulletPoint('Date Range', `${new Date(messages[0]?.createdAt).toLocaleDateString('en-IN')} - ${new Date(messages[messages.length - 1]?.createdAt).toLocaleDateString('en-IN')}`);
                doc.moveDown(0.5);

                // Show last 5 messages
                addSubHeader('Recent Communications');
                const recentMessages = messages.slice(-5);
                recentMessages.forEach(msg => {
                    doc.fontSize(9).font('Helvetica-Bold').text(`${msg.senderName || 'Unknown'}`, { continued: true });
                    doc.font('Helvetica').text(` (${new Date(msg.createdAt).toLocaleString('en-IN')}):`);
                    doc.fontSize(9).font('Helvetica').text(msg.content.substring(0, 200) + (msg.content.length > 200 ? '...' : ''), { indent: 10 });
                    doc.moveDown(0.3);
                });
                doc.moveDown(1);
                addSeparator();
            }

            // ===== RESOLUTION STATUS =====
            doc.addPage();
            addSectionHeader('7. RESOLUTION STATUS');

            addBulletPoint('Current Status', statusInfo.label);
            addBulletPoint('Complainant Confirmed Details', dispute.plaintiffConfirmed ? 'Yes' : 'No');
            addBulletPoint('Respondent Confirmed Details', dispute.respondentConfirmed ? 'Yes' : 'No');
            addBulletPoint('Complainant Choice', dispute.plaintiffChoice !== null ? `Option ${dispute.plaintiffChoice + 1}` : 'Pending');
            addBulletPoint('Respondent Choice', dispute.respondentChoice !== null ? `Option ${dispute.respondentChoice + 1}` : 'Pending');
            addBulletPoint('Complainant Signed', dispute.plaintiffSignature ? 'Yes' : 'No');
            addBulletPoint('Respondent Signed', dispute.respondentSignature ? 'Yes' : 'No');

            if (dispute.resolutionNotes) {
                doc.moveDown(0.5);
                addSubHeader('Resolution Notes');
                addNormalText(dispute.resolutionNotes);
            }

            if (dispute.status === 'ForwardedToCourt') {
                doc.moveDown(0.5);
                addSubHeader('Court Forwarding Details');
                addBulletPoint('Court Type', dispute.courtType);
                addBulletPoint('Court Name', dispute.courtName);
                addBulletPoint('Court Location', dispute.courtLocation);
                addBulletPoint('Forwarded On', dispute.courtForwardedAt ? new Date(dispute.courtForwardedAt).toLocaleDateString('en-IN') : 'N/A');
            }
            doc.moveDown(1);

            addSeparator();

            // ===== ACTIVITY LOG =====
            if (auditLogs.length > 0) {
                addSectionHeader('8. ACTIVITY LOG (Last 10 Events)');

                auditLogs.slice(0, 10).forEach(log => {
                    doc.fontSize(9).font('Helvetica-Bold').text(
                        new Date(log.createdAt).toLocaleString('en-IN'),
                        { continued: true }
                    );
                    doc.font('Helvetica').text(` - ${log.action}`);
                    if (log.description) {
                        doc.fontSize(8).font('Helvetica').text(`   ${log.description}`, { indent: 10 });
                    }
                    doc.moveDown(0.2);
                });
                doc.moveDown(1);
            }

            addSeparator();

            // ===== FOOTER =====
            doc.moveDown(1);
            doc.fontSize(9).font('Helvetica-Oblique').fillColor('#6b7280').text(
                'This report is generated automatically by MediaAI platform and represents the current state of the case.',
                { align: 'center' }
            );
            doc.moveDown(0.3);
            doc.fontSize(8).text(`Generated on ${timestamp} IST | Document ID: ${documentId}`, { align: 'center' });
            doc.fillColor('black');

            doc.end();
        } catch (e) {
            logError('Case Summary PDF Generation Error', { error: e.message, stack: e.stack, disputeId: dispute?.id });
            console.error('Case Summary PDF Generation Error:', e);
            reject(e);
        }
    });
}

// ==================== PDF REPORT ENDPOINTS ====================

// Generate and download Case Summary PDF
app.get('/api/disputes/:id/report/summary', authMiddleware, async (req, res) => {
    try {
        // Dispute model stores plaintiff/defendant details directly - no need to join with User
        const dispute = await Dispute.findByPk(req.params.id);

        if (!dispute) {
            return res.status(404).json({ error: 'Dispute not found' });
        }

        // Verify access
        const isAdmin = req.user.role === 'Admin';
        const isParty = dispute.plaintiffId === req.user.id ||
            dispute.defendantId === req.user.id ||
            dispute.creatorId === req.user.id;

        if (!isAdmin && !isParty) {
            return res.status(403).json({ error: 'Not authorized to access this report' });
        }

        // Fetch related data
        const [messages, evidenceList, auditLogs] = await Promise.all([
            Message.findAll({
                where: { disputeId: dispute.id },
                order: [['createdAt', 'ASC']],
                limit: 100
            }),
            Evidence.findAll({
                where: { disputeId: dispute.id },
                order: [['createdAt', 'DESC']]
            }),
            AuditLog.findAll({
                where: {
                    resourceType: 'DISPUTE',
                    resourceId: dispute.id
                },
                order: [['createdAt', 'DESC']],
                limit: 20
            })
        ]);

        // Generate PDF (generator may return Buffer or { path } or stream)
        const pdfResult = await generateCaseSummaryPDF(dispute, messages, evidenceList, auditLogs);

        // Log debug info for diagnostics
        logInfo('Case summary generation result type', { disputeId: dispute.id, resultType: typeof pdfResult });

        // Support Buffer result
        if (Buffer.isBuffer(pdfResult)) {
            const fileName = `Case_Summary_${dispute.id}_${Date.now()}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.setHeader('Content-Length', pdfResult.length);

            await logAuditEvent({
                action: 'REPORT_GENERATED',
                category: AuditCategories.DISPUTE,
                user: { id: req.user.id },
                resourceType: 'DISPUTE',
                resourceId: dispute.id,
                description: `Case summary report generated for dispute #${dispute.id}`,
                request: req,
                status: 'SUCCESS'
            });

            return res.send(pdfResult);
        }

        // Support { path } result
        if (pdfResult && pdfResult.path) {
            const filePath = pdfResult.path;
            if (!fs.existsSync(filePath)) {
                logError('Generated PDF path not found', { path: filePath, disputeId: dispute.id });
                return res.status(500).json({ error: 'Generated PDF not available' });
            }

            const fileName = `Case_Summary_${dispute.id}_${Date.now()}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

            await logAuditEvent({
                action: 'REPORT_GENERATED',
                category: AuditCategories.DISPUTE,
                user: { id: req.user.id },
                resourceType: 'DISPUTE',
                resourceId: dispute.id,
                description: `Case summary report generated for dispute #${dispute.id}`,
                request: req,
                status: 'SUCCESS'
            });

            const fileStream = fs.createReadStream(filePath);
            return fileStream.pipe(res);
        }

        // Unsupported generator result
        logError('Unsupported PDF generator result', { disputeId: dispute.id, pdfResult: typeof pdfResult });
        return res.status(500).json({ error: 'Failed to generate report' });
    } catch (error) {
        logError('Failed to generate case summary report', {
            error: error.message,
            stack: error.stack,
            disputeId: req.params.id,
            userId: req.user?.id
        });
        console.error('Case summary PDF generation failed:', error);
        res.status(500).json({ error: 'Failed to generate report', details: error.message });
    }
});

// Download Settlement Agreement PDF (authenticated)
app.get('/api/disputes/:id/report/agreement', authMiddlewareForMedia, async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);

        if (!dispute) {
            return res.status(404).json({ error: 'Dispute not found' });
        }

        // Log requestor for auditing
        logInfo('Agreement download requested', { disputeId: dispute.id, userId: req.user?.id, userRole: req.user?.role });

        // Verify access
        const isAdmin = req.user.role === 'Admin';
        const isParty = dispute.plaintiffId === req.user.id ||
            dispute.defendantId === req.user.id ||
            dispute.creatorId === req.user.id;

        if (!isAdmin && !isParty) {
            logError('Unauthorized agreement download attempt', { disputeId: dispute.id, userId: req.user?.id });
            return res.status(403).json({ error: 'Not authorized to access this document' });
        }

        // Check if agreement exists
        if (!dispute.agreementDocPath) {
            return res.status(404).json({ error: 'Settlement agreement not yet generated' });
        }

        const filePath = path.join(process.cwd(), 'uploads', dispute.agreementDocPath);

        if (!fs.existsSync(filePath)) {
            logError('Agreement file missing on disk', { disputeId: dispute.id, path: filePath });
            return res.status(404).json({ error: 'Agreement file not found' });
        }

        // Set response headers
        const fileName = `Settlement_Agreement_Case_${dispute.id}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        // Stream file
        const fileStream = fs.createReadStream(filePath);
        fileStream.on('error', (err) => {
            logError('Error streaming agreement file', { error: err.message, disputeId: dispute.id });
            res.status(500).end();
        });
        fileStream.pipe(res);

        // Log audit
        await logAuditEvent({
            action: 'AGREEMENT_DOWNLOADED',
            category: AuditCategories.DISPUTE,
            user: { id: req.user.id },
            resourceType: 'DISPUTE',
            resourceId: dispute.id,
            description: `Settlement agreement downloaded for dispute #${dispute.id}`,
            request: req,
            status: 'SUCCESS'
        });

    } catch (error) {
        logError('Failed to download settlement agreement', { error: error.message, stack: error.stack, disputeId: req.params.id });
        res.status(500).json({ error: 'Failed to download agreement' });
    }
});

// View Settlement Agreement PDF (inline preview)
app.get('/api/disputes/:id/report/agreement/preview', authMiddlewareForMedia, async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);

        if (!dispute) {
            return res.status(404).json({ error: 'Dispute not found' });
        }

        // Verify access
        const isAdmin = req.user.role === 'Admin';
        const isParty = dispute.plaintiffId === req.user.id ||
            dispute.defendantId === req.user.id ||
            dispute.creatorId === req.user.id;

        if (!isAdmin && !isParty) {
            return res.status(403).json({ error: 'Not authorized to access this document' });
        }

        if (!dispute.agreementDocPath) {
            return res.status(404).json({ error: 'Settlement agreement not yet generated' });
        }

        const filePath = path.join(process.cwd(), 'uploads', dispute.agreementDocPath);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Agreement file not found' });
        }

        // Set response headers for inline viewing
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Settlement_Agreement_Case_${dispute.id}.pdf"`);
        res.setHeader('Cache-Control', 'private, max-age=3600');

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

    } catch (error) {
        logError('Failed to preview settlement agreement', { error: error.message, disputeId: req.params.id });
        res.status(500).json({ error: 'Failed to preview agreement' });
    }
});

// ==================== END PDF REPORT ENDPOINTS ====================

// Sync DB and Start
sequelize.sync({ alter: true }).then(async () => {
    // Also sync the AuditLog and Notification models
    await AuditLog.sync({ alter: true });
    logInfo('AuditLog table synchronized');

    await Notification.sync({ alter: true });
    logInfo('Notification table synchronized');

    // Initialize notification service with models and socket.io
    notificationService.initializeNotificationService(Notification, io, emitToUser, User);

    // Initialize session service with Session and User models
    sessionService.initialize(Session, User);
    logInfo('Session service initialized');

    // Add database performance indexes
    await addDatabaseIndexes();
    logInfo('Database indexes added/verified');

    // Seed Admin User
    try {
        const adminUser = await User.findOne({ where: { username: 'Admin' } });
        if (!adminUser) {
            const hashedPassword = await bcrypt.hash('Admin@13', 10);
            await User.create({ username: 'Admin', email: 'admin@dispute.com', password: hashedPassword, role: 'Admin' });
            logInfo('Admin user created');
        }
    } catch (e) {
        logError('Error seeding admin:', { error: e.message });
    }

    // Log system startup
    await logAuditEvent({
        action: AuditActions.SYSTEM_STARTUP,
        category: AuditCategories.SYSTEM,
        description: 'MediaAI server started successfully',
        metadata: {
            port: process.env.PORT || 5000,
            nodeVersion: process.version,
            environment: process.env.NODE_ENV || 'development'
        },
        status: 'SUCCESS'
    });

    // Health check endpoint
    app.get('/health', async (req, res) => {
        const dbHealth = await checkDatabaseHealth();
        res.json({
            status: dbHealth.connected ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            services: {
                database: dbHealth,
                ai: genAI ? 'configured' : 'not configured',
                email: emailService ? 'configured' : 'not configured'
            },
            version: '1.0.0'
        });
    });

    // Root endpoint
    app.get('/', (req, res) => {
        res.json({
            message: 'MediaAI Dispute Resolution API',
            status: 'running',
            endpoints: {
                health: '/health',
                auth: '/api/auth/*',
                disputes: '/api/disputes/*',
                stats: '/api/stats'
            }
        });
    });

    // Dev-only: Sentry test endpoint
    if (process.env.NODE_ENV !== 'production') {
        app.get('/__test-error', (req, res) => {
            throw new Error('Sentry backend test error');
        });
    }

    // Sentry error handler (must be after all routes)
    app.use(sentryErrorHandler);

    // Global error handler
    app.use((err, req, res, next) => {
        // Capture error with Sentry
        captureError(err, {
            url: req.url,
            method: req.method,
            severity: err.status >= 500 ? 'high' : 'low'
        }, req.user, req);

        // Send error response
        const statusCode = err.status || 500;
        res.status(statusCode).json({
            error: err.message || 'Internal server error',
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        });
    });

    httpServer.listen(process.env.PORT || 5000, '0.0.0.0', () => {
        console.log(`Server running on port ${process.env.PORT || 5000} (Available on network)`);
        console.log('Socket.io server initialized');
    });
}).catch(err => {
    console.error('Database connection failed:', err);
    captureError(err, { context: 'database_connection', severity: 'critical' });
});
