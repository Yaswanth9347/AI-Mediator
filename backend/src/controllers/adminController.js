import { User, Dispute, Session } from '../models/index.js';
import Contact from '../models/Contact.js';
import { AuditLog, logAuditEvent, AuditActions, AuditCategories } from '../services/auditService.js';
import { logInfo, logError } from '../services/logger.js';
import { Op, fn, col } from 'sequelize';

/**
 * Get all users (Admin only)
 */
export const getAllUsers = async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: { exclude: ['password'] },
            order: [['createdAt', 'DESC']]
        });

        res.json({ users });
    } catch (error) {
        logError('Get all users failed', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};

/**
 * Update user role (Admin only)
 */
export const updateUserRole = async (req, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;

        if (!['User', 'Admin'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role. Must be User or Admin' });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent self-demotion
        if (user.id === req.user.id && role !== 'Admin') {
            return res.status(400).json({ error: 'Cannot demote yourself' });
        }

        const oldRole = user.role;
        user.role = role;
        await user.save();

        await logAuditEvent({
            userId: req.user.id,
            action: AuditActions.UPDATE,
            category: AuditCategories.AUTH,
            resource: 'user_role',
            resourceId: userId,
            details: { oldRole, newRole: role, targetUser: user.email },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ message: 'User role updated successfully', user: { id: user.id, role: user.role } });
    } catch (error) {
        logError('Update user role failed', error);
        res.status(500).json({ error: 'Failed to update user role' });
    }
};

/**
 * Suspend user (Admin only)
 */
export const suspendUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent self-suspension
        if (user.id === req.user.id) {
            return res.status(400).json({ error: 'Cannot suspend yourself' });
        }

        user.isSuspended = true;
        user.suspendedAt = new Date();
        user.suspendReason = reason || 'Account suspended by administrator';
        await user.save();

        // Invalidate all user sessions
        await Session.update(
            { isValid: false },
            { where: { userId: userId } }
        );

        await logAuditEvent({
            userId: req.user.id,
            action: AuditActions.UPDATE,
            category: AuditCategories.AUTH,
            resource: 'user_suspension',
            resourceId: userId,
            details: { reason, targetUser: user.email },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ message: 'User suspended successfully' });
    } catch (error) {
        logError('Suspend user failed', error);
        res.status(500).json({ error: 'Failed to suspend user' });
    }
};

/**
 * Activate user (Admin only)
 */
export const activateUser = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.isSuspended = false;
        user.suspendedAt = null;
        user.suspendReason = null;
        await user.save();

        await logAuditEvent({
            userId: req.user.id,
            action: AuditActions.UPDATE,
            category: AuditCategories.AUTH,
            resource: 'user_activation',
            resourceId: userId,
            details: { targetUser: user.email },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ message: 'User activated successfully' });
    } catch (error) {
        logError('Activate user failed', error);
        res.status(500).json({ error: 'Failed to activate user' });
    }
};

/**
 * Get user activity logs (Admin only)
 */
export const getUserActivity = async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 50 } = req.query;

        const user = await User.findByPk(userId, {
            attributes: ['id', 'fullName', 'email']
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const activities = await AuditLog.findAll({
            where: { userId: userId },
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit)
        });

        res.json({ user, activities });
    } catch (error) {
        logError('Get user activity failed', error);
        res.status(500).json({ error: 'Failed to fetch user activity' });
    }
};

/**
 * Delete user (Admin only)
 */
export const deleteUserAdmin = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent self-deletion
        if (user.id === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete yourself' });
        }

        // Check for active disputes
        const activeDisputes = await Dispute.count({
            where: {
                [Op.or]: [
                    { plaintiffId: userId },
                    { defendantId: userId }
                ],
                status: {
                    [Op.notIn]: ['Resolved', 'Closed', 'ForwardedToCourt']
                }
            }
        });

        if (activeDisputes > 0) {
            return res.status(400).json({
                error: 'Cannot delete user with active disputes',
                activeDisputes
            });
        }

        const userEmail = user.email;

        // Delete sessions
        await Session.destroy({ where: { userId: userId } });

        // Delete user
        await user.destroy();

        await logAuditEvent({
            userId: req.user.id,
            action: AuditActions.DELETE,
            category: AuditCategories.AUTH,
            resource: 'user_account',
            resourceId: userId,
            details: { deletedUser: userEmail },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        logError('Delete user failed', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
};

/**
 * Get dashboard statistics (Admin only)
 */
export const getDashboardStats = async (req, res) => {
    try {
        // User stats
        const totalUsers = await User.count();
        const suspendedUsers = await User.count({ where: { isSuspended: true } });
        const verifiedUsers = await User.count({ where: { isVerified: true } });
        const adminUsers = await User.count({ where: { role: 'Admin' } });

        // New users this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const newUsersThisMonth = await User.count({
            where: { createdAt: { [Op.gte]: startOfMonth } }
        });

        // Dispute stats
        const totalDisputes = await Dispute.count();
        const resolvedDisputes = await Dispute.count({ where: { status: 'Resolved' } });
        const forwardedToCourt = await Dispute.count({ where: { status: 'ForwardedToCourt' } });
        const pendingApproval = await Dispute.count({ where: { status: 'PendingAdminApproval' } });

        // New disputes today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const disputesToday = await Dispute.count({
            where: { createdAt: { [Op.gte]: startOfDay } }
        });

        // Resolution rate
        const resolutionRate = totalDisputes > 0 ? Math.round((resolvedDisputes / totalDisputes) * 100) : 0;

        // Get disputes by status for chart
        const disputesByStatusRaw = await Dispute.findAll({
            attributes: ['status', [fn('COUNT', col('id')), 'count']],
            group: ['status'],
            raw: true
        });
        const byStatus = {};
        disputesByStatusRaw.forEach(item => {
            byStatus[item.status] = parseInt(item.count);
        });

        // Weekly activity (messages this week)
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - 7);
        const messagesThisWeek = 0; // Would need Message model
        const evidenceThisWeek = 0; // Would need Evidence model

        // Pending verifications
        const pendingVerifications = await User.count({ where: { verificationStatus: 'Pending' } });

        res.json({
            overview: {
                totalDisputes,
                resolvedDisputes,
                disputesToday,
                disputesTrend: '0',
                resolutionRate,
                avgResolutionDays: 7,
                forwardedToCourt
            },
            users: {
                total: totalUsers,
                verified: verifiedUsers,
                suspended: suspendedUsers,
                admins: adminUsers,
                newThisMonth: newUsersThisMonth
            },
            disputes: {
                byStatus,
                trend: [] // Would be populated with monthly data
            },
            activity: {
                messagesThisWeek,
                evidenceThisWeek
            },
            pendingActions: {
                total: pendingApproval + pendingVerifications,
                approvals: pendingApproval,
                verifications: pendingVerifications
            }
        });
    } catch (error) {
        logError('Get dashboard stats failed', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
};

/**
 * Get recent activity for admin dashboard
 */
export const getDashboardActivity = async (req, res) => {
    try {
        const { limit = 20 } = req.query;

        const activities = await AuditLog.findAll({
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit)
        });

        res.json({ activities });
    } catch (error) {
        logError('Get dashboard activity failed', error);
        res.status(500).json({ error: 'Failed to fetch dashboard activity' });
    }
};

/**
 * Get pending items requiring admin attention
 */
export const getDashboardPending = async (req, res) => {
    try {
        // Get disputes pending admin approval
        const approvals = await Dispute.findAll({
            where: { status: 'PendingAdminApproval' },
            order: [['createdAt', 'ASC']],
            limit: 10
        });

        // Get users with pending verification
        const verifications = await User.findAll({
            where: { verificationStatus: 'Pending' },
            attributes: ['id', 'username', 'email', 'createdAt'],
            order: [['createdAt', 'ASC']],
            limit: 10
        });

        // Get stale disputes (no activity in 3+ days)
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const staleDisputes = await Dispute.findAll({
            where: {
                status: { [Op.notIn]: ['Resolved', 'Closed', 'ForwardedToCourt'] },
                updatedAt: { [Op.lt]: threeDaysAgo }
            },
            order: [['updatedAt', 'ASC']],
            limit: 10
        });

        res.json({
            approvals,
            verifications,
            staleDisputes
        });
    } catch (error) {
        logError('Get dashboard pending failed', error);
        res.status(500).json({ error: 'Failed to fetch pending items' });
    }
};

/**
 * Get system health status
 */
export const getDashboardHealth = async (req, res) => {
    try {
        const uptime = process.uptime();
        const memory = process.memoryUsage();
        const memoryPercent = Math.round((memory.heapUsed / memory.heapTotal) * 100);

        // Format uptime
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const uptimeFormatted = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            server: {
                uptimeFormatted,
                uptime,
                memoryPercent,
                nodeVersion: process.version
            },
            realtime: {
                activeConnections: 0 // Would be populated from socket.io
            },
            services: {
                database: true,
                ai: true,
                email: true,
                sentry: false
            }
        };

        // Test database connection
        try {
            await User.findOne({ limit: 1 });
            health.services.database = true;
        } catch {
            health.status = 'degraded';
            health.services.database = false;
        }

        res.json(health);
    } catch (error) {
        logError('Get dashboard health failed', error);
        res.status(500).json({
            status: 'unhealthy',
            error: 'Failed to fetch health status'
        });
    }
};

export default {
    getAllUsers,
    updateUserRole,
    suspendUser,
    activateUser,
    getUserActivity,
    deleteUserAdmin,
    getDashboardStats,
    getDashboardActivity,
    getDashboardPending,
    getDashboardHealth
};

/**
 * Get all contact messages (Admin only)
 */
export const getContacts = async (req, res) => {
    try {
        const contacts = await Contact.findAll({
            order: [['createdAt', 'DESC']]
        });
        res.json(contacts);
    } catch (error) {
        logError('Get contacts failed', error);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
};

/**
 * Reply to a contact message (Admin only)
 */
export const replyToContact = async (req, res) => {
    try {
        const { id } = req.params;
        const { replyMessage } = req.body;

        const contact = await Contact.findByPk(id);
        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        contact.adminReply = replyMessage;
        contact.repliedAt = new Date();
        contact.repliedBy = req.user.id;
        contact.status = 'Replied';
        await contact.save();

        res.json({ message: 'Reply sent successfully', contact });
    } catch (error) {
        logError('Reply to contact failed', error);
        res.status(500).json({ error: 'Failed to send reply' });
    }
};
