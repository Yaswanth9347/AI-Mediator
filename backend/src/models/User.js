import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const User = sequelize.define('user', {
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    email: { type: DataTypes.STRING, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, defaultValue: 'User' }, // 'User' or 'Admin'
    // Additional Profile Fields
    phone: { type: DataTypes.STRING },
    address: { type: DataTypes.TEXT },
    occupation: { type: DataTypes.STRING },
    // Identity Verification (New)
    isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
    verificationStatus: { type: DataTypes.STRING, defaultValue: 'Unverified' }, // Unverified, Pending, Verified, Rejected
    idCardPath: { type: DataTypes.STRING },
    selfiePath: { type: DataTypes.STRING },
    verificationNotes: { type: DataTypes.TEXT }, // AI's reasoning for verification
    // Account Suspension
    isSuspended: { type: DataTypes.BOOLEAN, defaultValue: false },
    suspendedAt: { type: DataTypes.DATE },
    suspendReason: { type: DataTypes.TEXT },
    // Failed Login Tracking (Security)
    failedLoginAttempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    lastFailedLogin: { type: DataTypes.DATE },
    accountLockedUntil: { type: DataTypes.DATE },
    // Password Reset
    resetToken: { type: DataTypes.STRING },
    resetTokenExpiry: { type: DataTypes.DATE },
    // Email Verification
    isEmailVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
    emailVerificationToken: { type: DataTypes.STRING },
    emailVerificationExpiry: { type: DataTypes.DATE },
    // Profile Picture
    profilePicture: { type: DataTypes.STRING }, // Path to profile image
    // Two-Factor Authentication
    twoFactorEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    twoFactorSecret: { type: DataTypes.STRING },
    twoFactorBackupCodes: { type: DataTypes.TEXT }, // JSON array of backup codes
    // Privacy Settings
    profileVisibility: { type: DataTypes.STRING, defaultValue: 'public' }, // public, private, contacts
    showEmail: { type: DataTypes.BOOLEAN, defaultValue: false },
    showPhone: { type: DataTypes.BOOLEAN, defaultValue: false },
    // Last Activity
    lastLoginAt: { type: DataTypes.DATE },
    lastActivityAt: { type: DataTypes.DATE },
    // Notification Preferences (JSON)
    notificationPreferences: {
        type: DataTypes.TEXT,
        defaultValue: JSON.stringify({
            emailNotifications: true,
            inAppNotifications: true,
            newDispute: true,
            caseAccepted: true,
            newMessage: true,
            aiAnalysisComplete: true,
            solutionVotes: true,
            caseResolved: true,
            courtForwarding: true,
            evidenceUploaded: true,
            signatureRequired: true,
            systemAlerts: true
        })
    }
});

export default User;
