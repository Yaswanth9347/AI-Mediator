
import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { getStats } from '../controllers/statsController.js';

const router = express.Router();

router.get('/', authMiddleware, getStats);

export default router;
