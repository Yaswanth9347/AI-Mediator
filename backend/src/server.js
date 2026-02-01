
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import bcrypt from 'bcryptjs';

import sequelize, { checkDatabaseHealth } from './config/db.js';
import { initializeSentry, captureError, sentryRequestHandler, sentryTracingHandler, sentryErrorHandler } from './services/sentryService.js';
import { requestLogger, logInfo, logError } from './services/logger.js';
import { AuditLog, logAuditEvent, AuditActions, AuditCategories } from './services/auditService.js';
import notificationService from './services/notificationService.js';
import { initializeSocket, getIO, emitToUser } from './services/socketService.js';
import sessionService from './services/sessionService.js';
import { User, Session, Notification } from './models/index.js';

// Routes
import authRoutes from './routes/authRoutes.js';
import disputeRoutes from './routes/disputeRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import externalRoutes from './routes/externalRoutes.js';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { authMiddleware } from './middleware/authMiddleware.js';


dotenv.config();

// ==================== SECURITY: VALIDATE CONFIG ====================
import { validateSecrets } from './config/validator.js';
validateSecrets();

const app = express();
const httpServer = createServer(app);

// Initialize Sentry
initializeSentry(app);

// ==================== SECURITY MIDDLEWARE ====================
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
}));

// CORS
const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL
        : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Sentry Request Handler
app.use(sentryRequestHandler);
app.use(sentryTracingHandler);

// Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


// Logger
app.use(requestLogger);
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Rate Limiting
import { generalLimiter } from './middleware/rateLimiter.js';
app.use('/api/', generalLimiter);


// ==================== ROUTES ====================
app.use('/api/auth', authRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/external', externalRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);



// Root & Health
app.get('/health', async (req, res) => {
    const dbHealth = await checkDatabaseHealth();
    res.json({
        status: dbHealth.connected ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: { database: dbHealth },
        version: '1.0.0'
    });
});

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

// Sentry Error Handler
app.use(sentryErrorHandler);

// Global Error Handler
app.use((err, req, res, next) => {
    captureError(err, { url: req.url, method: req.method }, req.user, req);
    const statusCode = err.status || 500;
    res.status(statusCode).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});


// ==================== STARTUP ====================
import { runMigrations } from './config/migrator.js';

// Run migrations, then sync (without alter) to ensure models match but relying on migrations for changes
runMigrations().then(async () => {
    // We still call sync() without arguments to ensure Sequelize knows about the models,
    // but it won't alter tables if they exist.
    // Actually, sync() creates tables if they don't exist, which is fine for fresh installs.
    // But we removed `alter: true`.
    await sequelize.sync();

    await AuditLog.sync();
    await Notification.sync();

    // Sync new AI feature models
    const { ConversationSummary, LegalKnowledge } = await import('./models/index.js');
    await ConversationSummary.sync();
    await LegalKnowledge.sync();


    // Initialize Socket
    const io = initializeSocket(httpServer);


    // Initialize Services
    notificationService.initializeNotificationService(Notification, io, emitToUser, User);
    sessionService.initialize(Session, User);

    // Create Admin if not exists

    try {
        const adminUser = await User.findOne({ where: { username: 'Admin' } });
        if (!adminUser) {
            const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@13', 10);
            await User.create({
                username: 'Admin',
                email: process.env.ADMIN_EMAIL || 'admin@dispute.com',
                password: hashedPassword,
                role: 'Admin'
            });
            logInfo('Admin user created/verified');
        }
    } catch (e) {
        logError('Error seeding admin', { error: e.message });
    }

    // Seed legal knowledge base for RAG (runs only if empty)
    try {
        const { seedLegalKnowledge } = await import('./services/ragService.js');
        await seedLegalKnowledge();
        logInfo('Legal knowledge base initialized');
    } catch (e) {
        logError('Error seeding legal knowledge', { error: e.message });
    }

    await logAuditEvent({
        action: AuditActions.SYSTEM_STARTUP,
        category: AuditCategories.SYSTEM,
        description: 'MediaAI server started',
        status: 'SUCCESS'
    });

    const PORT = process.env.PORT || 5000;
    httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
        logInfo(`Server started on port ${PORT}`);
    });

}).catch(err => {
    console.error('Database connection failed:', err);
    captureError(err, { context: 'startup', severity: 'critical' });
});
