import express from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/authMiddleware.js';
import {
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
} from '../controllers/adminController.js';
import { getContacts, replyToContact } from '../controllers/adminController.js';

const router = express.Router();

// All routes require authentication + admin access
router.use(authMiddleware);
router.use(adminMiddleware);

// Dashboard
router.get('/dashboard/stats', getDashboardStats);
router.get('/dashboard/activity', getDashboardActivity);
router.get('/dashboard/pending', getDashboardPending);
router.get('/dashboard/health', getDashboardHealth);

// User management
router.get('/users', getAllUsers);
router.put('/users/:userId/role', updateUserRole);
router.post('/users/:userId/suspend', suspendUser);
router.post('/users/:userId/activate', activateUser);
router.get('/users/:userId/activity', getUserActivity);
router.delete('/users/:userId', deleteUserAdmin);

// Contact/Support messages
router.get('/contacts', getContacts);
router.put('/contacts/:id/reply', replyToContact);

export default router;


