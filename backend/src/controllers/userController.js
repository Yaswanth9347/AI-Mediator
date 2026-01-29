import { User, Dispute, Session, Notification } from '../models/index.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { logAuditEvent, AuditActions, AuditCategories } from '../services/auditService.js';
import { logInfo, logError } from '../services/logger.js';

/**
 * Upload profile picture
 */
export const uploadProfilePicture = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Delete old profile picture if exists
        if (user.profilePicture) {
            const oldPath = path.join(process.cwd(), user.profilePicture);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        // Set new profile picture path
        const filePath = req.file.path || `/uploads/${req.file.filename}`;
        user.profilePicture = filePath;
        await user.save();

        await logAuditEvent({
            userId: req.user.id,
            action: AuditActions.UPDATE,
            category: AuditCategories.AUTH,
            resource: 'profile_picture',
            details: { filename: req.file.originalname },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({
            message: 'Profile picture uploaded successfully',
            profilePicture: filePath
        });
    } catch (error) {
        logError('Upload profile picture failed', error);
        res.status(500).json({ error: 'Failed to upload profile picture' });
    }
};

/**
 * Delete profile picture
 */
export const deleteProfilePicture = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.profilePicture) {
            const filePath = path.join(process.cwd(), user.profilePicture);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            user.profilePicture = null;
            await user.save();
        }

        res.json({ message: 'Profile picture deleted successfully' });
    } catch (error) {
        logError('Delete profile picture failed', error);
        res.status(500).json({ error: 'Failed to delete profile picture' });
    }
};
/**
 * Get current user's profile
 */
export const getProfile = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password'] }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        logError('Get profile failed', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
};

/**
 * Update current user's profile
 */
export const updateProfile = async (req, res) => {
    try {
        const { fullName, phone, address, profileVisibility } = req.body;

        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update allowed fields
        if (fullName) user.fullName = fullName;
        if (phone) user.phone = phone;
        if (address) user.address = address;
        if (profileVisibility) user.profileVisibility = profileVisibility;

        await user.save();

        await logAuditEvent({
            userId: req.user.id,
            action: AuditActions.UPDATE,
            category: AuditCategories.AUTH,
            resource: 'user_profile',
            details: { updatedFields: Object.keys(req.body) },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        const userResponse = user.toJSON();
        delete userResponse.password;

        res.json({ message: 'Profile updated successfully', user: userResponse });
    } catch (error) {
        logError('Update profile failed', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
};

/**
 * Change password
 */
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }

        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        user.password = await bcrypt.hash(newPassword, 12);
        await user.save();

        await logAuditEvent({
            userId: req.user.id,
            action: AuditActions.UPDATE,
            category: AuditCategories.AUTH,
            resource: 'password',
            details: { success: true },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        logError('Change password failed', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
};

/**
 * Get user's disputes
 */
export const getMyDisputes = async (req, res) => {
    try {
        const disputes = await Dispute.findAll({
            where: {
                [require('sequelize').Op.or]: [
                    { plaintiffId: req.user.id },
                    { defendantId: req.user.id }
                ]
            },
            order: [['createdAt', 'DESC']],
            include: [
                { model: User, as: 'plaintiff', attributes: ['id', 'fullName', 'email'] },
                { model: User, as: 'defendant', attributes: ['id', 'fullName', 'email'] }
            ]
        });

        res.json({ disputes });
    } catch (error) {
        logError('Get my disputes failed', error);
        res.status(500).json({ error: 'Failed to fetch disputes' });
    }
};

/**
 * Get notification preferences
 */
export const getNotificationPreferences = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: ['notificationPreferences']
        });

        res.json({
            preferences: user?.notificationPreferences || {
                email: true,
                sms: false,
                push: true,
                caseUpdates: true,
                messages: true,
                marketing: false
            }
        });
    } catch (error) {
        logError('Get notification preferences failed', error);
        res.status(500).json({ error: 'Failed to fetch preferences' });
    }
};

/**
 * Update notification preferences
 */
export const updateNotificationPreferences = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.notificationPreferences = {
            ...user.notificationPreferences,
            ...req.body
        };
        await user.save();

        res.json({ message: 'Preferences updated', preferences: user.notificationPreferences });
    } catch (error) {
        logError('Update notification preferences failed', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
};

/**
 * Export user data (GDPR compliance)
 */
export const exportUserData = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password'] }
        });

        const disputes = await Dispute.findAll({
            where: {
                [require('sequelize').Op.or]: [
                    { plaintiffId: req.user.id },
                    { defendantId: req.user.id }
                ]
            }
        });

        const sessions = await Session.findAll({
            where: { userId: req.user.id }
        });

        const exportData = {
            exportDate: new Date().toISOString(),
            user: user?.toJSON(),
            disputes: disputes.map(d => d.toJSON()),
            sessions: sessions.map(s => ({
                ...s.toJSON(),
                token: undefined // Don't export tokens
            }))
        };

        await logAuditEvent({
            userId: req.user.id,
            action: AuditActions.READ,
            category: AuditCategories.AUTH,
            resource: 'user_data_export',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        res.json({ data: exportData });
    } catch (error) {
        logError('Export user data failed', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
};

/**
 * Delete user account
 */
export const deleteAccount = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check for active disputes
        const activeDisputes = await Dispute.count({
            where: {
                [require('sequelize').Op.or]: [
                    { plaintiffId: req.user.id },
                    { defendantId: req.user.id }
                ],
                status: {
                    [require('sequelize').Op.notIn]: ['Resolved', 'Closed', 'ForwardedToCourt']
                }
            }
        });

        if (activeDisputes > 0) {
            return res.status(400).json({
                error: 'Cannot delete account with active disputes. Please resolve or close all disputes first.'
            });
        }

        await logAuditEvent({
            userId: req.user.id,
            action: AuditActions.DELETE,
            category: AuditCategories.AUTH,
            resource: 'user_account',
            details: { email: user.email },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Delete sessions first
        await Session.destroy({ where: { userId: req.user.id } });

        // Delete user
        await user.destroy();

        res.json({ message: 'Account deleted successfully' });
    } catch (error) {
        logError('Delete account failed', error);
        res.status(500).json({ error: 'Failed to delete account' });
    }
};

/**
 * Get active sessions
 */
export const getActiveSessions = async (req, res) => {
    try {
        const sessions = await Session.findAll({
            where: {
                userId: req.user.id,
                isValid: true
            },
            attributes: ['id', 'deviceInfo', 'ipAddress', 'createdAt', 'lastActivity'],
            order: [['lastActivity', 'DESC']]
        });

        res.json({ sessions });
    } catch (error) {
        logError('Get active sessions failed', error);
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
};

/**
 * Revoke a session
 */
export const revokeSession = async (req, res) => {
    try {
        const { sessionId } = req.params;

        const session = await Session.findOne({
            where: {
                id: sessionId,
                userId: req.user.id
            }
        });

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        session.isValid = false;
        await session.save();

        res.json({ message: 'Session revoked successfully' });
    } catch (error) {
        logError('Revoke session failed', error);
        res.status(500).json({ error: 'Failed to revoke session' });
    }
};

export default {
    uploadProfilePicture,
    deleteProfilePicture,
    getProfile,
    updateProfile,
    changePassword,
    getMyDisputes,
    getNotificationPreferences,
    updateNotificationPreferences,
    exportUserData,
    deleteAccount,
    getActiveSessions,
    revokeSession
};
