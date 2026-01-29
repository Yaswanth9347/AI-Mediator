import jwt from 'jsonwebtoken';
import { User } from '../models/index.js'; // Updated import path
import sessionService from '../services/sessionService.js';
import { logError } from '../services/logger.js';

const JWT_SECRET = process.env.JWT_SECRET;

// Middleware - Enhanced with session store validation
export const authMiddleware = async (req, res, next) => {
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
        const fullUser = await User.findByPk(decoded.id);
        if (!fullUser) {
            return res.status(401).json({ error: 'User not found' });
        }
        req.user = fullUser;
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
export const authMiddlewareForMedia = async (req, res, next) => {
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

        const fullUser = await User.findByPk(decoded.id);
        if (!fullUser) {
            return res.status(401).json({ error: 'User not found' });
        }
        req.user = fullUser;
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

export const adminMiddleware = async (req, res, next) => {
    try {
        // req.user is set by authMiddleware
        if (!req.user || req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    } catch (error) {
        res.status(500).json({ error: 'Authorization failed' });
    }
};

export default authMiddleware;
