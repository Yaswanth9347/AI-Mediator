import { logInfo, logError } from './logger.js';
import { logAuditEvent, AuditActions, AuditCategories } from './auditService.js';
import * as smsService from './smsService.js';


/**
 * Notification Service
 * Manages creation and delivery of in-app notifications
 */

// Notification will be imported from server.js context
let Notification = null;
let User = null;
let io = null;
let emitToUser = null;

/**
 * Initialize notification service with models and socket.io
 */
export function initializeNotificationService(notificationModel, socketIo, emitUserFn, userModel = null) {
    Notification = notificationModel;
    User = userModel;
    io = socketIo;
    emitToUser = emitUserFn;
    logInfo('Notification service initialized');
}

/**
 * Create and send a notification to a user
 * @param {Object} options - Notification options
 * @param {number} options.userId - Recipient user ID
 * @param {string} options.type - Notification type (dispute, message, ai, resolution, admin, system)
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {number} options.disputeId - Related dispute ID (optional)
 * @param {number} options.relatedId - Related resource ID (optional)
 * @param {string} options.priority - Priority level (low, normal, high, urgent)
 * @param {Object} options.metadata - Additional metadata (optional)
 * @returns {Promise<Object>} Created notification
 */
export async function createNotification({
    userId,
    type,
    title,
    message,
    disputeId = null,
    relatedId = null,
    priority = 'normal',
    metadata = {}
}) {
    try {
        if (!Notification) {
            throw new Error('Notification service not initialized');
        }

        // Create notification in database
        const notification = await Notification.create({
            userId,
            type,
            title,
            message,
            disputeId,
            relatedId,
            isRead: false,
            priority,
            metadata
        });

        logInfo('Notification created', {
            notificationId: notification.id,
            userId,
            type,
            title
        });

        // Send real-time notification via Socket.io
        if (io && emitToUser) {
            emitToUser(userId, 'notification:new', {
                id: notification.id,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                disputeId: notification.disputeId,
                priority: notification.priority,
                createdAt: notification.createdAt,
                isRead: false
            });

            // Also send updated unread count
            try {
                const unreadCount = await Notification.count({
                    where: { userId, isRead: false }
                });
                emitToUser(userId, 'notification:count', { count: unreadCount });
            } catch (countErr) {
                logError('Failed to get unread notification count', { error: countErr.message, userId });
            }
        }

        // Audit log (minimal - don't log every notification)
        if (priority === 'high' || priority === 'urgent') {
            await logAuditEvent({
                action: AuditActions.NOTIFICATION_CREATE,
                category: AuditCategories.SYSTEM,
                resourceType: 'NOTIFICATION',
                resourceId: notification.id,
                description: `${priority.toUpperCase()} priority notification sent: ${title}`,
                metadata: {
                    userId,
                    type,
                    disputeId,
                    priority
                },
                status: 'SUCCESS'
            });
        }

        return notification;
    } catch (error) {
        logError('Failed to create notification', {
            error: error.message,
            userId,
            type,
            title
        });
        throw error;
    }
}

/**
 * Create notifications for multiple users
 * @param {Array<number>} userIds - Array of user IDs
 * @param {Object} notificationData - Notification data (same as createNotification)
 * @returns {Promise<Array<Object>>} Created notifications
 */
export async function createBulkNotifications(userIds, notificationData) {
    const notifications = [];

    for (const userId of userIds) {
        try {
            const notification = await createNotification({
                ...notificationData,
                userId
            });
            notifications.push(notification);
        } catch (error) {
            logError('Failed to create bulk notification for user', {
                userId,
                error: error.message
            });
        }
    }

    return notifications;
}

/**
 * Notify about new dispute
 */
export async function notifyDisputeCreated(disputeId, respondentUserId, plaintiffName, disputeTitle) {
    // Send in-app notification
    const notification = await createNotification({
        userId: respondentUserId,
        type: 'dispute',
        title: 'New Dispute Filed',
        message: `${plaintiffName} has filed a dispute against you. Please review and respond.`,
        disputeId,
        priority: 'high',
        metadata: { action: 'dispute_created' }
    });

    // Send SMS if user has phone number
    if (User && smsService.isSmsConfigured()) {
        try {
            const user = await User.findByPk(respondentUserId);
            if (user?.phone) {
                await smsService.sendDisputeCreatedSMS(user.phone, disputeId, plaintiffName, disputeTitle || 'Dispute');
            }
        } catch (error) {
            logError('Failed to send dispute created SMS', { error: error.message, disputeId });
        }
    }

    return notification;
}

/**
 * Notify about dispute acceptance
 */
export async function notifyDisputeAccepted(disputeId, plaintiffUserId, respondentName) {
    const notification = await createNotification({
        userId: plaintiffUserId,
        type: 'dispute',
        title: 'Dispute Accepted',
        message: `${respondentName} has accepted your dispute. The case is now active.`,
        disputeId,
        priority: 'high',
        metadata: { action: 'dispute_accepted' }
    });

    // Send SMS
    if (User && smsService.isSmsConfigured()) {
        try {
            const user = await User.findByPk(plaintiffUserId);
            if (user?.phone) {
                await smsService.sendDisputeAcceptedSMS(user.phone, disputeId, respondentName);
            }
        } catch (error) {
            logError('Failed to send dispute accepted SMS', { error: error.message });
        }
    }

    return notification;
}

/**
 * Notify about new message
 */
export async function notifyNewMessage(disputeId, recipientUserId, senderName, preview) {
    return createNotification({
        userId: recipientUserId,
        type: 'message',
        title: 'New Message',
        message: `${senderName}: ${preview.substring(0, 100)}${preview.length > 100 ? '...' : ''}`,
        disputeId,
        priority: 'normal',
        metadata: { action: 'message_received' }
    });
}

/**
 * Notify about AI analysis completion
 */
export async function notifyAIAnalysisComplete(disputeId, userIds, solutionCount) {
    const notifications = await createBulkNotifications(userIds, {
        type: 'ai',
        title: 'AI Analysis Complete',
        message: `AI has analyzed your case and proposed ${solutionCount} solutions. Please review and vote.`,
        disputeId,
        priority: 'high',
        metadata: { action: 'ai_analysis_complete', solutionCount }
    });

    // Send SMS to all users
    if (User && smsService.isSmsConfigured()) {
        for (const userId of userIds) {
            try {
                const user = await User.findByPk(userId);
                if (user?.phone) {
                    await smsService.sendAIAnalysisCompleteSMS(user.phone, disputeId, solutionCount);
                }
            } catch (error) {
                logError('Failed to send AI analysis SMS', { error: error.message, userId });
            }
        }
    }

    return notifications;
}

/**
 * Notify about evidence upload
 */
export async function notifyEvidenceUploaded(disputeId, recipientUserId, uploaderName, fileName) {
    return createNotification({
        userId: recipientUserId,
        type: 'dispute',
        title: 'New Evidence Uploaded',
        message: `${uploaderName} uploaded new evidence: ${fileName}`,
        disputeId,
        priority: 'normal',
        metadata: { action: 'evidence_uploaded', fileName }
    });
}

/**
 * Notify about signature submission
 */
export async function notifySignatureSubmitted(disputeId, recipientUserId, signerName) {
    const notification = await createNotification({
        userId: recipientUserId,
        type: 'resolution',
        title: 'Signature Submitted',
        message: `${signerName} has signed the settlement agreement. Please submit your signature to proceed.`,
        disputeId,
        priority: 'high',
        metadata: { action: 'signature_submitted' }
    });

    // Send SMS
    if (User && smsService.isSmsConfigured()) {
        try {
            const user = await User.findByPk(recipientUserId);
            if (user?.phone) {
                await smsService.sendSignatureRequiredSMS(user.phone, disputeId, signerName);
            }
        } catch (error) {
            logError('Failed to send signature required SMS', { error: error.message });
        }
    }

    return notification;
}

/**
 * Notify about admin resolution approval
 */
export async function notifyResolutionApproved(disputeId, userIds) {
    const notifications = await createBulkNotifications(userIds, {
        type: 'resolution',
        title: 'Resolution Approved',
        message: 'Admin has approved the settlement agreement. Your case is now resolved.',
        disputeId,
        priority: 'urgent',
        metadata: { action: 'resolution_approved' }
    });

    // Send SMS to all users
    if (User && smsService.isSmsConfigured()) {
        for (const userId of userIds) {
            try {
                const user = await User.findByPk(userId);
                if (user?.phone) {
                    await smsService.sendResolutionApprovedSMS(user.phone, disputeId);
                }
            } catch (error) {
                logError('Failed to send resolution approved SMS', { error: error.message, userId });
            }
        }
    }

    return notifications;
}

/**
 * Notify about court forwarding
 */
export async function notifyCourtForwarding(disputeId, userIds, courtName, courtType) {
    const notifications = await createBulkNotifications(userIds, {
        type: 'admin',
        title: 'Case Forwarded to Court',
        message: `Your case has been forwarded to ${courtName}. You will receive further instructions from the court.`,
        disputeId,
        priority: 'urgent',
        metadata: { action: 'court_forwarded', courtName }
    });

    // Send SMS to all users
    if (User && smsService.isSmsConfigured()) {
        for (const userId of userIds) {
            try {
                const user = await User.findByPk(userId);
                if (user?.phone) {
                    await smsService.sendCourtForwardingSMS(user.phone, disputeId, courtName, courtType || 'District');
                }
            } catch (error) {
                logError('Failed to send court forwarding SMS', { error: error.message, userId });
            }
        }
    }

    return notifications;
}

export default {
    initializeNotificationService,
    createNotification,
    createBulkNotifications,
    notifyDisputeCreated,
    notifyDisputeAccepted,
    notifyNewMessage,
    notifyAIAnalysisComplete,
    notifyEvidenceUploaded,
    notifySignatureSubmitted,
    notifyResolutionApproved,
    notifyCourtForwarding
};
