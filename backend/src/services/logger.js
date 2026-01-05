import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for structured logging
const structuredFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `[${timestamp}] ${level}: ${message} ${metaStr}`;
    })
);

// Create the logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: structuredFormat,
    defaultMeta: { service: 'mediaai-backend' },
    transports: [
        // Error logs - separate file for quick debugging
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Combined logs - all levels
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 10,
        }),
        // Audit logs - separate file for audit trail
        new winston.transports.File({
            filename: path.join(logsDir, 'audit.log'),
            level: 'info',
            maxsize: 10485760, // 10MB
            maxFiles: 20,
        }),
    ],
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat,
    }));
}

// Request ID generator
export function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Specialized logging methods
export const logInfo = (message, meta = {}) => {
    logger.info(message, meta);
};

export const logWarn = (message, meta = {}) => {
    logger.warn(message, meta);
};

export const logError = (message, error = null, meta = {}) => {
    const errorMeta = error ? {
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name,
        ...meta
    } : meta;
    logger.error(message, errorMeta);
};

export const logDebug = (message, meta = {}) => {
    logger.debug(message, meta);
};

// Audit-specific logging (for legal compliance)
export const logAudit = (action, userId, meta = {}) => {
    logger.info(`AUDIT: ${action}`, {
        type: 'AUDIT',
        action,
        userId,
        timestamp: new Date().toISOString(),
        ...meta
    });
};

// Request logging middleware
export const requestLogger = (req, res, next) => {
    const requestId = generateRequestId();
    req.requestId = requestId;
    
    const startTime = Date.now();
    
    // Log incoming request
    logger.info('Incoming request', {
        requestId,
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id || null,
    });
    
    // Log response when finished
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
        
        logger[logLevel]('Request completed', {
            requestId,
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userId: req.user?.id || null,
        });
    });
    
    next();
};

export default logger;
