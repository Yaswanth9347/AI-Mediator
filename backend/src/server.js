import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
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

// Import logger and audit services
import logger, { logInfo, logError, logWarn, logAudit, requestLogger, generateRequestId } from './services/logger.js';
import { AuditLog, logAuditEvent, getDisputeAuditLogs, AuditActions, AuditCategories } from './services/auditService.js';
import notificationService from './services/notificationService.js';
import { initializeSentry, captureError, sentryRequestHandler, sentryTracingHandler, sentryErrorHandler } from './services/sentryService.js';
import securityMiddleware from './middleware/security.js';
import paymentService from './services/paymentService.js';

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
}, {
    indexes: [
        { fields: ['disputeId'] },
        { fields: ['uploadedBy'] },
        { fields: ['createdAt'] },
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

// Multer setup with file validation
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
    }
});

const fileFilter = (req, file, cb) => {
    // Accept images and PDFs only
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and PDF files are allowed.'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Gemini Setup - Use GOOGLE_API_KEY
const API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || 'API_KEY_MISSING';
const genAI = new GoogleGenerativeAI(API_KEY);
console.log('AI API Key configured:', API_KEY !== 'API_KEY_MISSING' ? 'Yes' : 'No');

// Helper to read file to generatable part
function fileToGenerativePart(path, mimeType) {
    return {
        inlineData: {
            data: fs.readFileSync(path).toString("base64"),
            mimeType
        }
    };
}

// AI Analysis Helper Function (Multimodal)
async function analyzeDisputeWithAI(dispute, messages, isReanalysis = false) {
    if (API_KEY === 'API_KEY_MISSING') return null;

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

        const prompt = `You are an expert dispute resolver under Indian Constitutional Law and Indian Penal Code.
${isReanalysis ? 'The previous solutions were rejected by one or both parties. Provide a NEW alternative solution.' : ''}

DISPUTE CASE #${dispute.id}
Title: ${dispute.title}

PLAINTIFF: ${dispute.plaintiffName}
Occupation: ${dispute.plaintiffOccupation}
Initial Complaint: ${dispute.description}

DEFENDANT: ${dispute.respondentName}
Occupation: ${dispute.respondentOccupation}

CONVERSATION HISTORY:
${conversationHistory}

INSTRUCTIONS:
1. Analyze the dispute descriptions AND the attached evidence images (if any).
2. Reference Indian Constitutional Law/IPC.
3. Assess SERIOUSNESS level.

Respond in this EXACT JSON format:
{
    "summary": "Brief objective summary",
    "legalAssessment": "Legal perspective under Indian law",
    "seriousness": "LOW|MEDIUM|HIGH",
    "solutions": [
        {
            "title": "Title", "description": "Solution Details", "benefitsPlaintiff": "...", "benefitsDefendant": "..."
        },
        {
            "title": "Title", "description": "Solution Details", "benefitsPlaintiff": "...", "benefitsDefendant": "..."
        },
        {
            "title": "Title", "description": "Solution Details", "benefitsPlaintiff": "...", "benefitsDefendant": "..."
        }
    ],
    "courtRecommendation": "If HIGH, which court (District/High) and why"
}`;

        const parts = [prompt, ...evidenceParts];
        const result = await model.generateContent(parts);
        const response = await result.response;
        let text = response.text();

        console.log('AI Response received, length:', text.length);

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            console.log('AI Analysis parsed successfully');
            return parsed;
        }
        return null;
    } catch (error) {
        console.error('AI Analysis Error:', error.message || error);
        return null;
    }
}

// AI Verification Helper
async function verifyIdentityWithAI(username, idCardPath, selfiePath) {
    if (API_KEY === 'API_KEY_MISSING') return { verified: false, reason: "API Key missing" };

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const idPart = fileToGenerativePart(`uploads/${idCardPath}`, "image/jpeg");
        const selfiePart = fileToGenerativePart(`uploads/${selfiePath}`, "image/jpeg");

        const prompt = `You are an Identity Verification Agent.
        Task: 
        1. Compare the face in the Selfie with the face in the ID Card. Are they the same person?
        2. Read the Name from the ID Card. Does it arguably match the username "${username}"? (Allow for minor spelling diffs or partial names).
        
        Respond in EXACT JSON:
        {
            "verified": true/false,
            "reason": "Explanation of match or mismatch",
            "nameOnID": "Name extracted from ID"
        }`;

        const result = await model.generateContent([prompt, idPart, selfiePart]);
        const response = await result.response;
        const text = response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : { verified: false, reason: "AI output error" };
    } catch (err) {
        console.error("Verification Error:", err);
        return { verified: false, reason: "Verification processing failed" };
    }
}

// Helper to verify if document is a valid ID (No selfie comparison, just document check)
async function verifyDocumentIsID(path) {
    if (API_KEY === 'API_KEY_MISSING') return { isValid: true, details: "Dev Mode: Verification Skipped" };

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const imagePart = fileToGenerativePart(path, "image/jpeg");
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
        const dispute = await Dispute.findByPk(disputeId);
        if (!dispute || dispute.aiSolutions || dispute.forwardedToCourt) return;

        const messageCount = await Message.count({ where: { disputeId } });

        if (messageCount >= 10) {
            const messages = await Message.findAll({
                where: { disputeId },
                order: [['createdAt', 'ASC']]
            });

            console.log(`Triggering AI analysis for dispute ${disputeId} (${messageCount} messages)`);
            let analysis = await analyzeDisputeWithAI(dispute, messages);

            // Fallback if AI fails
            if (!analysis) {
                console.log('AI failed, using fallback solutions');
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
            }

            dispute.aiAnalysis = analysis.summary + '\n\n' + analysis.legalAssessment;
            dispute.aiSolutions = JSON.stringify(analysis.solutions);
            dispute.status = 'AwaitingDecision';
            await dispute.save();
            logInfo('AI analysis completed for dispute', { disputeId });
            
            // Audit log: AI analysis completed
            await logAuditEvent({
                action: AuditActions.AI_ANALYSIS_COMPLETE,
                category: AuditCategories.AI,
                resourceType: 'DISPUTE',
                resourceId: disputeId,
                description: `AI analysis completed for case #${disputeId} - 3 solutions generated`,
                metadata: {
                    messageCount,
                    solutionsCount: analysis.solutions?.length || 0,
                    seriousness: analysis.seriousness || 'MEDIUM'
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
            version: process.env.npm_package_version || '1.0.0'
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

// Middleware
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
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
        const user = await User.create({ username, email, password: hashedPassword, role: 'User' });
        
        // Audit log: User registration
        await logAuditEvent({
            action: AuditActions.USER_REGISTER,
            category: AuditCategories.AUTH,
            user: { id: user.id, email: user.email, username: user.username, role: user.role },
            resourceType: 'USER',
            resourceId: user.id,
            description: `New user registered: ${username} (${email})`,
            request: req,
            status: 'SUCCESS'
        });
        logInfo('User registered successfully', { userId: user.id, username, email });
        
        res.json({ id: user.id, username: user.username, email: user.email, role: user.role });
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
        
        // Audit log: Successful login
        await logAuditEvent({
            action: AuditActions.USER_LOGIN,
            category: AuditCategories.AUTH,
            user: { id: user.id, email: user.email, username: user.username, role: user.role },
            resourceType: 'USER',
            resourceId: user.id,
            description: `User logged in: ${username}`,
            request: req,
            status: 'SUCCESS'
        });
        logInfo('User logged in successfully', { userId: user.id, username });
        
        res.json({ token, role: user.role, username: user.username, email: user.email });
    } catch (error) {
        logError('Login error', error);
        res.status(500).json({ error: error.message });
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

// Export user data
app.get('/api/users/export-data', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password', 'resetToken', 'resetTokenExpiry'] }
        });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Fetch all user data
        const disputes = await Dispute.findAll({
            where: {
                [Op.or]: [
                    { plaintiffEmail: user.email },
                    { respondentEmail: user.email }
                ]
            },
            include: [
                { model: Message, as: 'messages' },
                { model: Evidence, as: 'evidences' }
            ]
        });

        const notifications = await Notification.findAll({
            where: { userId: req.user.id }
        });

        const auditLogs = await AuditLog.findAll({
            where: { userId: req.user.id },
            order: [['createdAt', 'DESC']],
            limit: 100
        });

        const exportData = {
            exportedAt: new Date().toISOString(),
            profile: {
                username: user.username,
                email: user.email,
                phone: user.phone,
                address: user.address,
                occupation: user.occupation,
                role: user.role,
                isVerified: user.isVerified,
                verificationStatus: user.verificationStatus,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            },
            notificationPreferences: user.notificationPreferences ? JSON.parse(user.notificationPreferences) : {},
            disputes: disputes.map(d => ({
                id: d.id,
                title: d.title,
                description: d.description,
                status: d.status,
                role: d.plaintiffEmail === user.email ? 'Plaintiff' : 'Defendant',
                createdAt: d.createdAt,
                messagesCount: d.messages?.length || 0,
                evidenceCount: d.evidences?.length || 0
            })),
            notifications: notifications.map(n => ({
                type: n.type,
                title: n.title,
                message: n.message,
                isRead: n.isRead,
                createdAt: n.createdAt
            })),
            activityLog: auditLogs.map(a => ({
                action: a.action,
                resourceType: a.resourceType,
                createdAt: a.createdAt
            }))
        };

        // Log data export to audit trail
        await AuditLog.create({
            action: 'DATA_EXPORTED',
            category: 'USER',
            resourceType: 'User',
            resourceId: user.id,
            userId: req.user.id,
            description: 'User exported their data',
            metadata: { message: 'User data exported' },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json(exportData);
    } catch (error) {
        console.error('Export data error:', error);
        Sentry.captureException(error, { tags: { action: 'export_data' }, user: { id: req.user?.id } });
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

// Get active sessions (simplified - in production, you'd use a session store)
app.get('/api/users/sessions', authMiddleware, async (req, res) => {
    try {
        // In a production app, you'd store sessions in Redis or database
        // For now, return current session info
        const sessions = [
            {
                id: 'current',
                device: 'Current Session',
                browser: req.get('User-Agent')?.split(' ').pop() || 'Unknown',
                location: 'Current Location',
                lastActive: new Date().toISOString(),
                isCurrent: true
            }
        ];

        res.json({ sessions });
    } catch (error) {
        console.error('Get sessions error:', error);
        Sentry.captureException(error, { tags: { action: 'get_sessions' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

// Revoke a session
app.delete('/api/users/sessions/:sessionId', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // In a production app, you'd invalidate the session token here
        // For now, just log the action
        await AuditLog.create({
            action: 'SESSION_REVOKED',
            category: 'AUTH',
            resourceType: 'User',
            resourceId: req.user.id,
            userId: req.user.id,
            description: `User revoked session: ${sessionId}`,
            metadata: { sessionId },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ message: 'Session revoked successfully' });
    } catch (error) {
        console.error('Revoke session error:', error);
        Sentry.captureException(error, { tags: { action: 'revoke_session' }, user: { id: req.user?.id } });
        res.status(500).json({ error: 'Failed to revoke session' });
    }
});

// Get user's disputes
app.get('/api/users/my-disputes', authMiddleware, async (req, res) => {
    try {
        const disputes = await Dispute.findAll({
            where: {
                [Op.or]: [
                    { plaintiffId: req.user.id },
                    { defendantId: req.user.id }
                ]
            },
            include: [
                { model: User, as: 'plaintiff', attributes: ['username', 'email'] },
                { model: User, as: 'defendant', attributes: ['username', 'email'] }
            ],
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
app.post('/api/users/profile-picture', authMiddleware, upload.single('profilePicture'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Delete old profile picture if exists
        if (user.profilePicture) {
            const oldPath = path.join(__dirname, '..', user.profilePicture);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        // Save new profile picture path
        const profilePicturePath = `/uploads/${req.file.filename}`;
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

        // Delete file
        const filePath = path.join(__dirname, '..', user.profilePicture);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
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
                const worker = await createWorker('eng');
                const { data: { text } } = await worker.recognize(evidenceFile.path);
                evidenceText = text;
                await worker.terminate();
            } catch (ocrError) {
                console.error('OCR Error:', ocrError);
            }
        }

        let dispute = await Dispute.create({
            title,
            description,
            evidenceText,
            evidenceImage: evidenceFile ? evidenceFile.filename : null,
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
            status: 'Pending' // Waiting for respondent to see and respond
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
            attachmentPath: req.file ? req.file.filename : null
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
        if (!req.files.idCard || !req.files.selfie) return res.status(400).json({ error: "Both ID Card and Selfie are required" });

        const user = await User.findByPk(req.user.id);
        const idCardPath = req.files.idCard[0].filename;
        const selfiePath = req.files.selfie[0].filename;

        // AI Verification
        console.log(`Verifying user ${user.username}...`);
        const verification = await verifyIdentityWithAI(user.username, idCardPath, selfiePath);
        console.log('Verification Result:', verification);

        user.idCardPath = idCardPath;
        user.selfiePath = selfiePath;
        user.isVerified = verification.verified;
        user.verificationStatus = verification.verified ? 'Verified' : 'Rejected';
        user.verificationNotes = verification.reason;
        await user.save();

        res.json({ user, verification });
    } catch (e) {
        console.error('Verify error:', e);
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

                    return res.json({
                        dispute,
                        message: `Dispute unresolved. Forwarded to ${courtType} Court.`
                    });
                }
            }
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
app.post('/api/disputes/:id/evidence', authMiddleware, upload.single('evidence'), async (req, res) => {
    try {
        const dispute = await Dispute.findByPk(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

        const currentUser = await User.findByPk(req.user.id);
        
        // Only allow parties or admin to upload evidence
        const isPlaintiff = currentUser.email === dispute.plaintiffEmail;
        const isDefendant = currentUser.email === dispute.respondentEmail;
        const isAdmin = req.user.role === 'Admin';
        
        if (!isPlaintiff && !isDefendant && !isAdmin) {
            return res.status(403).json({ error: 'Not authorized to upload evidence for this case' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Determine file type from mime type
        let fileType = 'document';
        if (req.file.mimetype.startsWith('image/')) fileType = 'image';
        else if (req.file.mimetype.startsWith('video/')) fileType = 'video';
        else if (req.file.mimetype.startsWith('audio/')) fileType = 'audio';

        // Determine user role
        const uploaderRole = isAdmin ? 'admin' : (isPlaintiff ? 'plaintiff' : 'defendant');

        const { description } = req.body;

        // Create evidence record
        const evidence = await Evidence.create({
            disputeId: dispute.id,
            uploadedBy: currentUser.id,
            uploaderName: currentUser.username,
            uploaderRole,
            fileName: req.file.filename,
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
                fileName: req.file.filename,
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
        emitToDispute(dispute.id, 'evidenceUploaded', {
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

        res.status(201).json({ 
            message: 'Evidence uploaded successfully', 
            evidence 
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
            dispute.plaintiffSignature = req.file.filename;
        } else if (currentUser.email === dispute.respondentEmail) {
            dispute.respondentSignature = req.file.filename;
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
                signatureFile: req.file.filename,
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

// Sync DB and Start
sequelize.sync({ alter: true }).then(async () => {
    // Also sync the AuditLog and Notification models
    await AuditLog.sync({ alter: true });
    logInfo('AuditLog table synchronized');
    
    await Notification.sync({ alter: true });
    logInfo('Notification table synchronized');
    
    // Initialize notification service with models and socket.io
    notificationService.initializeNotificationService(Notification, io, emitToUser);
    
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
