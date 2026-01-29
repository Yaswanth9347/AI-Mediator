
import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getNotifications, markRead, markAllRead, deleteNotification } from '../controllers/notificationController.js';

const router = express.Router();

router.get('/', authMiddleware, asyncHandler(getNotifications));
router.put('/:id/read', authMiddleware, asyncHandler(markRead));
router.put('/mark-all-read', authMiddleware, asyncHandler(markAllRead));
router.delete('/:id', authMiddleware, asyncHandler(deleteNotification));

export default router;
