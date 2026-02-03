import crypto from 'crypto';
import { UAParser } from 'ua-parser-js';
import { Op } from 'sequelize';
import { logInfo, logWarn, logError } from './logger.js';

// Session configuration
const SESSION_CONFIG = {
    TOKEN_EXPIRY_MINUTES: parseInt(process.env.SESSION_TTL_MINUTES || '15', 10),
    MAX_SESSIONS_PER_USER: 10,
    CLEANUP_INTERVAL_HOURS: 6,
    ACTIVITY_UPDATE_INTERVAL_MS: 5 * 60 * 1000 // 5 minutes
};

/**
 * Parse User-Agent string to extract device information
 * @param {string} userAgent - The user agent string
 * @returns {Object} Parsed device info
 */
export function parseUserAgent(userAgent) {
    if (!userAgent) {
        return {
            deviceType: 'Unknown',
            deviceName: 'Unknown Device',
            browser: 'Unknown Browser',
            browserVersion: null,
            os: 'Unknown OS'
        };
    }

    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    // Determine device type
    let deviceType = 'Desktop';
    if (result.device.type === 'mobile') deviceType = 'Mobile';
    else if (result.device.type === 'tablet') deviceType = 'Tablet';
    else if (userAgent.toLowerCase().includes('postman')) deviceType = 'API Client';

    // Build device name
    let deviceName = 'Unknown Device';
    if (result.device.vendor && result.device.model) {
        deviceName = `${result.device.vendor} ${result.device.model}`;
    } else if (result.os.name) {
        deviceName = `${deviceType} (${result.os.name})`;
    }

    return {
        deviceType,
        deviceName,
        browser: result.browser.name || 'Unknown Browser',
        browserVersion: result.browser.version || null,
        os: result.os.name ? `${result.os.name} ${result.os.version || ''}`.trim() : 'Unknown OS'
    };
}

/**
 * Generate a secure session token hash
 * @param {string} token - The JWT token
 * @returns {string} SHA-256 hash of the token
 */
export function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Get client IP address from request
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
export function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           req.ip ||
           'Unknown';
}

/**
 * Session Store Service Class
 */
class SessionService {
    constructor() {
        this.Session = null;
        this.User = null;
        this.lastActivityUpdates = new Map(); // Cache for rate-limiting activity updates
    }

    /**
     * Initialize the service with models
     * @param {Object} Session - Session Sequelize model
     * @param {Object} User - User Sequelize model
     */
    initialize(Session, User) {
        this.Session = Session;
        this.User = User;
        logInfo('Session service initialized');
        
        // Start cleanup interval
        this.startCleanupInterval();
    }

    /**
     * Create a new session
     * @param {Object} params - Session parameters
     * @returns {Object} Created session
     */
    async createSession({ userId, token, userAgent, ipAddress }) {
        if (!this.Session) {
            throw new Error('Session service not initialized');
        }

        const deviceInfo = parseUserAgent(userAgent);
        const tokenHash = hashToken(token);
        const expiresAt = new Date(Date.now() + SESSION_CONFIG.TOKEN_EXPIRY_MINUTES * 60 * 1000);

        // Enforce max sessions per user
        const activeSessions = await this.Session.count({
            where: { userId, isActive: true }
        });

        if (activeSessions >= SESSION_CONFIG.MAX_SESSIONS_PER_USER) {
            // Revoke oldest session
            const oldestSession = await this.Session.findOne({
                where: { userId, isActive: true },
                order: [['createdAt', 'ASC']]
            });
            
            if (oldestSession) {
                await oldestSession.update({
                    isActive: false,
                    revokedAt: new Date(),
                    revokedReason: 'Max sessions reached - auto-revoked oldest session'
                });
                logInfo('Auto-revoked oldest session due to max sessions limit', { userId, sessionId: oldestSession.id });
            }
        }

        const session = await this.Session.create({
            userId,
            token,
            tokenHash,
            deviceType: deviceInfo.deviceType,
            deviceName: deviceInfo.deviceName,
            browser: deviceInfo.browser,
            browserVersion: deviceInfo.browserVersion,
            os: deviceInfo.os,
            ipAddress,
            location: 'Unknown', // Could integrate with IP geolocation service
            lastActivity: new Date(),
            expiresAt,
            isActive: true
        });

        logInfo('New session created', { 
            userId, 
            sessionId: session.id, 
            deviceType: deviceInfo.deviceType,
            browser: deviceInfo.browser 
        });

        return session;
    }

    /**
     * Validate a session token
     * @param {string} token - JWT token to validate
     * @returns {Object|null} Session if valid, null if invalid
     */
    async validateSession(token) {
        if (!this.Session) {
            throw new Error('Session service not initialized');
        }

        const tokenHash = hashToken(token);

        const session = await this.Session.findOne({
            where: {
                tokenHash,
                isActive: true,
                expiresAt: { [Op.gt]: new Date() }
            },
            include: [{
                model: this.User,
                as: 'user',
                attributes: ['id', 'username', 'email', 'role', 'isSuspended']
            }]
        });

        if (!session) {
            return null;
        }

        // Check if user is suspended
        if (session.user?.isSuspended) {
            await this.revokeSession(session.id, 'Account suspended');
            return null;
        }

        // Update last activity (rate-limited)
        await this.updateLastActivity(session.id);

        return session;
    }

    /**
     * Update session last activity (rate-limited)
     * @param {string} sessionId - Session ID
     */
    async updateLastActivity(sessionId) {
        const lastUpdate = this.lastActivityUpdates.get(sessionId);
        const now = Date.now();

        // Only update if enough time has passed
        if (!lastUpdate || (now - lastUpdate) >= SESSION_CONFIG.ACTIVITY_UPDATE_INTERVAL_MS) {
            await this.Session.update(
                { lastActivity: new Date() },
                { where: { id: sessionId } }
            );
            this.lastActivityUpdates.set(sessionId, now);
        }
    }

    /**
     * Get all active sessions for a user
     * @param {number} userId - User ID
     * @param {string} currentTokenHash - Hash of current token to identify current session
     * @returns {Array} List of active sessions
     */
    async getUserSessions(userId, currentTokenHash = null) {
        if (!this.Session) {
            throw new Error('Session service not initialized');
        }

        const sessions = await this.Session.findAll({
            where: {
                userId,
                isActive: true,
                expiresAt: { [Op.gt]: new Date() }
            },
            order: [['lastActivity', 'DESC']],
            attributes: [
                'id', 'deviceType', 'deviceName', 'browser', 'browserVersion',
                'os', 'ipAddress', 'location', 'lastActivity', 'createdAt', 'tokenHash'
            ]
        });

        // Mark current session
        return sessions.map(session => {
            const sessionData = session.toJSON();
            delete sessionData.tokenHash; // Don't expose token hash
            
            return {
                ...sessionData,
                isCurrent: currentTokenHash === session.tokenHash
            };
        });
    }

    /**
     * Revoke a specific session
     * @param {string} sessionId - Session ID to revoke
     * @param {string} reason - Reason for revocation
     * @returns {boolean} Success status
     */
    async revokeSession(sessionId, reason = 'Manual revocation') {
        if (!this.Session) {
            throw new Error('Session service not initialized');
        }

        const result = await this.Session.update(
            {
                isActive: false,
                revokedAt: new Date(),
                revokedReason: reason
            },
            { where: { id: sessionId } }
        );

        if (result[0] > 0) {
            logInfo('Session revoked', { sessionId, reason });
            return true;
        }

        return false;
    }

    /**
     * Revoke all sessions for a user except current
     * @param {number} userId - User ID
     * @param {string} exceptTokenHash - Token hash to exclude (current session)
     * @returns {number} Number of sessions revoked
     */
    async revokeAllUserSessions(userId, exceptTokenHash = null) {
        if (!this.Session) {
            throw new Error('Session service not initialized');
        }

        const whereClause = {
            userId,
            isActive: true
        };

        if (exceptTokenHash) {
            whereClause.tokenHash = { [Op.ne]: exceptTokenHash };
        }

        const result = await this.Session.update(
            {
                isActive: false,
                revokedAt: new Date(),
                revokedReason: 'Logged out from all devices'
            },
            { where: whereClause }
        );

        const revokedCount = result[0];
        if (revokedCount > 0) {
            logInfo('All user sessions revoked', { userId, count: revokedCount, keptCurrent: !!exceptTokenHash });
        }

        return revokedCount;
    }

    /**
     * Revoke session by token
     * @param {string} token - JWT token
     * @param {string} reason - Reason for revocation
     * @returns {boolean} Success status
     */
    async revokeSessionByToken(token, reason = 'Logout') {
        if (!this.Session) {
            throw new Error('Session service not initialized');
        }

        const tokenHash = hashToken(token);

        const result = await this.Session.update(
            {
                isActive: false,
                revokedAt: new Date(),
                revokedReason: reason
            },
            { where: { tokenHash } }
        );

        return result[0] > 0;
    }

    /**
     * Cleanup expired and revoked sessions
     * @returns {number} Number of sessions cleaned up
     */
    async cleanupSessions() {
        if (!this.Session) {
            return 0;
        }

        try {
            // Delete sessions that are either:
            // 1. Expired more than 7 days ago
            // 2. Revoked more than 30 days ago
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            const result = await this.Session.destroy({
                where: {
                    [Op.or]: [
                        { expiresAt: { [Op.lt]: sevenDaysAgo } },
                        { 
                            isActive: false,
                            revokedAt: { [Op.lt]: thirtyDaysAgo }
                        }
                    ]
                }
            });

            if (result > 0) {
                logInfo('Session cleanup completed', { deletedCount: result });
            }

            return result;
        } catch (error) {
            logError('Session cleanup failed', error);
            return 0;
        }
    }

    /**
     * Start periodic cleanup interval
     */
    startCleanupInterval() {
        const intervalMs = SESSION_CONFIG.CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000;
        
        setInterval(() => {
            this.cleanupSessions();
        }, intervalMs);

        // Run initial cleanup after a short delay
        setTimeout(() => this.cleanupSessions(), 30000);
    }

    /**
     * Get session statistics for admin
     * @returns {Object} Session statistics
     */
    async getSessionStats() {
        if (!this.Session) {
            throw new Error('Session service not initialized');
        }

        const [
            totalActive,
            totalRevoked,
            totalExpired,
            uniqueUsers
        ] = await Promise.all([
            this.Session.count({ where: { isActive: true, expiresAt: { [Op.gt]: new Date() } } }),
            this.Session.count({ where: { isActive: false } }),
            this.Session.count({ where: { expiresAt: { [Op.lt]: new Date() } } }),
            this.Session.count({
                distinct: true,
                col: 'userId',
                where: { isActive: true, expiresAt: { [Op.gt]: new Date() } }
            })
        ]);

        return {
            totalActive,
            totalRevoked,
            totalExpired,
            uniqueUsersWithActiveSessions: uniqueUsers
        };
    }
}

// Export singleton instance
const sessionService = new SessionService();
export default sessionService;
