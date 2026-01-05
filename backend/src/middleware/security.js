/**
 * Security Middleware
 * Provides password validation, input sanitization, and security checks
 */

import { body, validationResult } from 'express-validator';
import { logWarn } from '../services/logger.js';
import crypto from 'crypto';

// Simple in-memory CSRF token store (use Redis in production)
const csrfTokens = new Map();

/**
 * Generate CSRF Token
 * Creates a unique token for CSRF protection
 */
export const generateCSRFToken = () => {
    const token = crypto.randomBytes(32).toString('hex');
    const timestamp = Date.now();
    csrfTokens.set(token, timestamp);
    
    // Clean up old tokens (older than 1 hour)
    for (const [key, value] of csrfTokens.entries()) {
        if (timestamp - value > 3600000) {
            csrfTokens.delete(key);
        }
    }
    
    return token;
};

/**
 * Validate CSRF Token
 * Middleware to validate CSRF token in requests
 */
export const validateCSRFToken = (req, res, next) => {
    // Skip CSRF for GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }
    
    const token = req.headers['x-csrf-token'] || req.body._csrf;
    
    if (!token) {
        logWarn('CSRF token missing', { path: req.path, ip: req.ip });
        return res.status(403).json({ error: 'CSRF token missing' });
    }
    
    if (!csrfTokens.has(token)) {
        logWarn('Invalid CSRF token', { path: req.path, ip: req.ip });
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    
    // Token is valid, allow request
    next();
};

/**
 * CSRF Token endpoint
 * Provides CSRF token to frontend
 */
export const csrfTokenEndpoint = (req, res) => {
    const token = generateCSRFToken();
    res.json({ csrfToken: token });
};

/**
 * Password Strength Validation
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export const validatePasswordStrength = (password) => {
    const errors = [];
    
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Password must contain at least one special character (!@#$%^&* etc.)');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
};

/**
 * Express validator middleware for password strength
 */
export const passwordStrengthValidator = body('password')
    .custom((value) => {
        const validation = validatePasswordStrength(value);
        if (!validation.isValid) {
            throw new Error(validation.errors.join('. '));
        }
        return true;
    });

/**
 * Express validator middleware for registration
 */
export const registerValidation = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be between 3 and 50 characters')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
        .escape(),
    
    body('email')
        .trim()
        .isEmail()
        .withMessage('Invalid email address')
        .normalizeEmail()
        .escape(),
    
    passwordStrengthValidator,
];

/**
 * Express validator middleware for login
 */
export const loginValidation = [
    body('username')
        .trim()
        .notEmpty()
        .withMessage('Username is required')
        .escape(),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required'),
];

/**
 * Express validator middleware for password change
 */
export const changePasswordValidation = [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),
    
    passwordStrengthValidator,
];

/**
 * Express validator middleware for password reset
 */
export const resetPasswordValidation = [
    body('token')
        .trim()
        .notEmpty()
        .withMessage('Reset token is required')
        .escape(),
    
    passwordStrengthValidator,
];

/**
 * Validation result checker middleware
 * Call this after validation middleware to check for errors
 */
export const checkValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        logWarn('Validation errors', { 
            errors: errors.array(),
            path: req.path,
            ip: req.ip 
        });
        
        return res.status(400).json({ 
            error: errors.array()[0].msg,
            errors: errors.array()
        });
    }
    next();
};

/**
 * Account Lockout Check
 * Checks if user account is locked due to failed login attempts
 */
export const checkAccountLockout = (user) => {
    if (!user.accountLockedUntil) {
        return { isLocked: false };
    }
    
    const now = new Date();
    if (now < new Date(user.accountLockedUntil)) {
        const minutesRemaining = Math.ceil((new Date(user.accountLockedUntil) - now) / 60000);
        return {
            isLocked: true,
            message: `Account is locked. Try again in ${minutesRemaining} minute(s).`,
            lockedUntil: user.accountLockedUntil
        };
    }
    
    // Lock period expired, reset
    return { isLocked: false, shouldReset: true };
};

/**
 * Handle Failed Login Attempt
 * Increments failed login counter and locks account if threshold exceeded
 */
export const handleFailedLogin = async (user) => {
    const MAX_ATTEMPTS = 5;
    const LOCKOUT_DURATION_MINUTES = 15;
    
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    user.lastFailedLogin = new Date();
    
    if (user.failedLoginAttempts >= MAX_ATTEMPTS) {
        const lockoutUntil = new Date();
        lockoutUntil.setMinutes(lockoutUntil.getMinutes() + LOCKOUT_DURATION_MINUTES);
        user.accountLockedUntil = lockoutUntil;
        
        await user.save();
        
        return {
            locked: true,
            attempts: user.failedLoginAttempts,
            message: `Account locked due to ${MAX_ATTEMPTS} failed login attempts. Try again in ${LOCKOUT_DURATION_MINUTES} minutes.`
        };
    }
    
    await user.save();
    
    return {
        locked: false,
        attempts: user.failedLoginAttempts,
        remaining: MAX_ATTEMPTS - user.failedLoginAttempts
    };
};

/**
 * Reset Failed Login Attempts
 * Called after successful login
 */
export const resetFailedLoginAttempts = async (user) => {
    if (user.failedLoginAttempts > 0 || user.accountLockedUntil) {
        user.failedLoginAttempts = 0;
        user.lastFailedLogin = null;
        user.accountLockedUntil = null;
        await user.save();
    }
};

/**
 * Sanitize user input to prevent XSS
 */
export const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    
    return input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
};

/**
 * Rate limit error handler
 */
export const rateLimitErrorHandler = (req, res) => {
    logWarn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        userAgent: req.get('User-Agent')
    });
    
    res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfter: '15 minutes'
    });
};

export default {
    validatePasswordStrength,
    passwordStrengthValidator,
    registerValidation,
    loginValidation,
    changePasswordValidation,
    resetPasswordValidation,
    checkValidationErrors,
    checkAccountLockout,
    handleFailedLogin,
    resetFailedLoginAttempts,
    sanitizeInput,
    rateLimitErrorHandler,
    generateCSRFToken,
    validateCSRFToken,
    csrfTokenEndpoint
};
