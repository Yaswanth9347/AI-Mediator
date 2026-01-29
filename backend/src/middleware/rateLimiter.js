
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { logInfo, logError } from '../services/logger.js';

let store;

// Initialize Redis if configured
if (process.env.REDIS_URL) {
    try {
        const client = new Redis(process.env.REDIS_URL);
        client.on('error', (err) => {
            logError('Redis rate limit error', err);
        });
        client.on('connect', () => {
            logInfo('✅ Redis connected for rate limiting');
        });

        store = new RedisStore({
            sendCommand: (...args) => client.call(...args),
        });
    } catch (error) {
        logError('Failed to initialize Redis for rate limiting', error);
        // Store remains undefined, falling back to memory
    }
} else {
    logInfo('ℹ️ Redis not configured - using in-memory rate limiting');
}

// Helper to create limiters
const createLimiter = (options) => {
    return rateLimit({
        standardHeaders: true,
        legacyHeaders: false,
        store: store, // Unset (undefined) means memory store
        ...options,
    });
};

// General API Limiter (Basic DDoS protection)
export const generalLimiter = createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 1000,
    message: { error: 'Too many requests, please try again later.' }
});

// Auth Limiter (Brute-force protection)
export const authLimiter = createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 5 failed attempts per hour per IP (strict)
    message: { error: 'Too many login attempts, please try again later.' },
    skipSuccessfulRequests: true, // Only count failures
});

// Dispute Creation Limiter (Spam protection)
export const createDisputeLimiter = createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 disputes per hour
    message: { error: 'You are creating too many disputes. Please wait.' }
});

export default { generalLimiter, authLimiter, createDisputeLimiter };
