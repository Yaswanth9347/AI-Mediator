import express from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/authController.js';
import securityMiddleware from '../middleware/security.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
// Based on server.js imports, it likely uses a middleware function.
// If it was inline in server.js, we might need to extract it too.
// Let's assume for now we use the one passed from server or import it.
// Checking server.js imports line 27-33... no authMiddleware imported. It might be defined in server.js.
// We will need to check server.js for authMiddleware definition.

const router = express.Router();

// Environment-aware rate limiters (need to be passed or re-imported. 
// Ideally rate limiters should be in a separate config or middleware file)
// For now, we'll re-create simple ones or import if we extract them.
// Let's assume we will extract rate limiters to a shared file later.
// For now, I will import them from a new middleware/rateLimiters.js if I create it, 
// or just define them here to match server.js logic.

import rateLimit from 'express-rate-limit';
const isDevelopment = process.env.NODE_ENV !== 'production';

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 50 : 5, // 50 dev, 5 prod (login attempts)
    message: 'Too many authentication attempts, please try again after 15 minutes.',
    skipSuccessfulRequests: true,
});

// Routes
router.post('/register',
    authLimiter,
    [
        body('username').trim().isLength({ min: 3 }).escape().withMessage('Username must be at least 3 characters'),
        body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    ],
    authController.register
);

router.post('/login',
    authLimiter,
    securityMiddleware.loginValidation,
    securityMiddleware.checkValidationErrors,
    authController.login
);

router.get('/verify-email/:token', authController.verifyEmail);

router.post('/resend-verification',
    authLimiter,
    [
        body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required')
    ],
    authController.resendVerification
);

router.post('/forgot-password',
    authLimiter,
    [
        body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
    ],
    authController.forgotPassword
);

router.post('/reset-password', authController.resetPassword);

router.post('/logout', authMiddleware, authController.logout);

export default router;
