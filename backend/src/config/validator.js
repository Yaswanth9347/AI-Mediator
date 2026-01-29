
import { logError, logWarn, logInfo } from '../services/logger.js';

export const validateSecrets = () => {
    let missingCritical = [];
    let missingOptional = [];

    // Critical Secrets (Must stop server if missing or invalid)
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        missingCritical.push('JWT_SECRET (must be at least 32 chars)');
    }

    if (!process.env.DATABASE_URL && (!process.env.DB_USER || !process.env.DB_PASS)) {
        // Assume if DATABASE_URL is missing, we need the individual params. 
        // Or if using sequelizerc... let's stick to standard env vars.
        // Actually, db.js usually handles defaults, but for production...
        // Let's keep it simple: strict check only if explicitly in PROD.
        if (process.env.NODE_ENV === 'production') {
            missingCritical.push('DATABASE_URL or DB credentials');
        }
    }

    // Optional / Feature-Specific Secrets (Warn but don't crash)

    // Stripe
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey.includes('test_your_stripe_secret_key')) {
        missingOptional.push('STRIPE_SECRET_KEY (Payment features disabled)');
    }

    // Cloudinary
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        missingOptional.push('CLOUDINARY_* credentials (Media upload will rely on local storage)');
    }

    // AI
    if (!process.env.GEMINI_API_KEY) {
        missingOptional.push('GEMINI_API_KEY (AI analysis disabled)');
    }

    // Email
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        missingOptional.push('EMAIL_* credentials (Email notifications disabled)');
    }

    // Report
    if (missingCritical.length > 0) {
        logError('❌ CRITICAL SECURITY CONFIGURATION MISSING:', null, { missing: missingCritical });
        console.error('SERVER HALTED. Please configure the following in your .env file:');
        missingCritical.forEach(s => console.error(` - ${s}`));
        process.exit(1);
    }

    if (missingOptional.length > 0) {
        logWarn('⚠️ Optional services not configured:', { missing: missingOptional });
        // Don't clutter console too much, logWarn serves the purpose.
    } else {
        logInfo('✅ All security and service configurations appear valid.');
    }
};
