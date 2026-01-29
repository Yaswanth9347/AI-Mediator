
import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';
import { logInfo, logError } from './logger.js';
import { AuditLog } from '../models/index.js';


// Action Types Constants
export const AuditActions = {
    // Authentication
    USER_REGISTER: 'USER_REGISTER',
    USER_LOGIN: 'USER_LOGIN',
    USER_LOGOUT: 'USER_LOGOUT',
    USER_LOGIN_FAILED: 'USER_LOGIN_FAILED',
    PASSWORD_RESET_REQUEST: 'PASSWORD_RESET_REQUEST',
    PASSWORD_RESET_COMPLETE: 'PASSWORD_RESET_COMPLETE',
    PASSWORD_CHANGE: 'PASSWORD_CHANGE',

    // User Verification
    IDENTITY_VERIFICATION_SUBMIT: 'IDENTITY_VERIFICATION_SUBMIT',
    IDENTITY_VERIFICATION_APPROVE: 'IDENTITY_VERIFICATION_APPROVE',
    IDENTITY_VERIFICATION_REJECT: 'IDENTITY_VERIFICATION_REJECT',

    // Dispute Lifecycle
    DISPUTE_CREATE: 'DISPUTE_CREATE',
    DISPUTE_ACCEPT: 'DISPUTE_ACCEPT',
    DISPUTE_REJECT: 'DISPUTE_REJECT',
    DISPUTE_VIEW: 'DISPUTE_VIEW',

    // Messaging
    MESSAGE_SEND: 'MESSAGE_SEND',
    ATTACHMENT_UPLOAD: 'ATTACHMENT_UPLOAD',

    // Evidence Management
    EVIDENCE_UPLOAD: 'EVIDENCE_UPLOAD',
    EVIDENCE_VIEW: 'EVIDENCE_VIEW',
    EVIDENCE_DELETE: 'EVIDENCE_DELETE',
    EVIDENCE_VERIFY: 'EVIDENCE_VERIFY',

    // AI Analysis
    AI_ANALYSIS_TRIGGER: 'AI_ANALYSIS_TRIGGER',
    AI_ANALYSIS_COMPLETE: 'AI_ANALYSIS_COMPLETE',
    AI_ANALYSIS_FAILED: 'AI_ANALYSIS_FAILED',
    AI_REANALYSIS_REQUEST: 'AI_REANALYSIS_REQUEST',

    // Decision & Voting
    SOLUTION_VOTE: 'SOLUTION_VOTE',
    SOLUTION_REJECT_ALL: 'SOLUTION_REJECT_ALL',

    // Resolution Process
    DETAILS_VERIFY: 'DETAILS_VERIFY',
    SIGNATURE_SUBMIT: 'SIGNATURE_SUBMIT',
    AGREEMENT_GENERATE: 'AGREEMENT_GENERATE',

    // Admin Actions
    ADMIN_APPROVE_RESOLUTION: 'ADMIN_APPROVE_RESOLUTION',
    ADMIN_FORWARD_TO_COURT: 'ADMIN_FORWARD_TO_COURT',
    ADMIN_USER_BAN: 'ADMIN_USER_BAN',
    ADMIN_USER_UNBAN: 'ADMIN_USER_UNBAN',

    // Notifications
    NOTIFICATION_CREATE: 'NOTIFICATION_CREATE',
    NOTIFICATION_READ: 'NOTIFICATION_READ',
    NOTIFICATION_DELETE: 'NOTIFICATION_DELETE',
    NOTIFICATION_READ_ALL: 'NOTIFICATION_READ_ALL',

    // System Events
    SYSTEM_ERROR: 'SYSTEM_ERROR',
    SYSTEM_STARTUP: 'SYSTEM_STARTUP',
    EMAIL_SENT: 'EMAIL_SENT',
    EMAIL_FAILED: 'EMAIL_FAILED',
};

// Categories
export const AuditCategories = {
    AUTH: 'AUTH',
    DISPUTE: 'DISPUTE',
    MESSAGE: 'MESSAGE',
    AI: 'AI',
    RESOLUTION: 'RESOLUTION',
    ADMIN: 'ADMIN',
    SYSTEM: 'SYSTEM',
    PRIVACY: 'PRIVACY',
};

/**
 * Log an audit event
 * @param {Object} options - Audit log options
 * @param {string} options.action - Action type (use AuditActions constant)
 * @param {string} options.category - Category (use AuditCategories constant)
 * @param {Object} options.user - User object { id, email, username, role }
 * @param {string} options.resourceType - Type of resource (DISPUTE, USER, etc.)
 * @param {number} options.resourceId - ID of affected resource
 * @param {string} options.description - Human-readable description
 * @param {Object} options.metadata - Additional structured data
 * @param {Object} options.request - Express request object for IP/UserAgent
 * @param {string} options.status - SUCCESS, FAILURE, or PENDING
 * @param {string} options.errorMessage - Error message if status is FAILURE
 */
export async function logAuditEvent(options) {
    const {
        action,
        category = AuditCategories.SYSTEM,
        user = {},
        resourceType = null,
        resourceId = null,
        description,
        metadata = {},
        request = null,
        status = 'SUCCESS',
        errorMessage = null,
    } = options;

    try {
        const auditEntry = await AuditLog.create({
            action,
            category,
            userId: user.id || null,
            userEmail: user.email || null,
            userName: user.username || null,
            userRole: user.role || null,
            resourceType,
            resourceId,
            description,
            metadata,
            ipAddress: request?.ip || request?.connection?.remoteAddress || null,
            userAgent: request?.get?.('User-Agent') || null,
            requestId: request?.requestId || null,
            status,
            errorMessage,
        });

        // Also log to file for redundancy
        logInfo(`AUDIT: ${action}`, {
            auditId: auditEntry.id,
            category,
            userId: user.id,
            resourceType,
            resourceId,
            status,
        });

        return auditEntry;
    } catch (error) {
        // Don't let audit logging failures crash the application
        logError('Failed to create audit log entry', error, { action, category });
        return null;
    }
}

/**
 * Get audit logs for a specific dispute (for Case History feature)
 * @param {number} disputeId - Dispute ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Audit log entries
 */
export async function getDisputeAuditLogs(disputeId, options = {}) {
    const { limit = 100, offset = 0 } = options;

    try {
        const logs = await AuditLog.findAll({
            where: {
                resourceType: 'DISPUTE',
                resourceId: disputeId,
            },
            order: [['createdAt', 'DESC']],
            limit,
            offset,
        });

        return logs;
    } catch (error) {
        logError('Failed to fetch dispute audit logs', error, { disputeId });
        return [];
    }
}

/**
 * Get all audit logs for a user
 * @param {number} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Audit log entries
 */
export async function getUserAuditLogs(userId, options = {}) {
    const { limit = 100, offset = 0 } = options;

    try {
        const logs = await AuditLog.findAll({
            where: { userId },
            order: [['createdAt', 'DESC']],
            limit,
            offset,
        });

        return logs;
    } catch (error) {
        logError('Failed to fetch user audit logs', error, { userId });
        return [];
    }
}

export { AuditLog };
export default AuditLog;
