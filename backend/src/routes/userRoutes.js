import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { uploadProfile, handleMulterError } from '../middleware/upload.js';
import {
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
} from '../controllers/userController.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Profile
router.get('/profile', getProfile);
router.put('/profile', updateProfile);

// Profile Picture
router.post('/profile-picture', uploadProfile.single('profilePicture'), handleMulterError, uploadProfilePicture);
router.delete('/profile-picture', deleteProfilePicture);

// Password
router.post('/change-password', changePassword);

// Disputes
router.get('/my-disputes', getMyDisputes);

// Notification Preferences
router.get('/notification-preferences', getNotificationPreferences);
router.put('/notification-preferences', updateNotificationPreferences);

// Privacy & Data (GDPR)
router.get('/export-data', exportUserData);
router.delete('/account', deleteAccount);

// Sessions
router.get('/sessions', getActiveSessions);
router.delete('/sessions/:sessionId', revokeSession);

export default router;

