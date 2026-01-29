
import { Notification } from '../models/index.js';

export const getNotifications = async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const notifications = await Notification.findAll({
            where: { userId: req.user.id },
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit)
        });
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const markRead = async (req, res) => {
    try {
        const notification = await Notification.findByPk(req.params.id);
        if (!notification) return res.status(404).json({ error: 'Notification not found' });

        if (notification.userId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        notification.isRead = true;
        await notification.save();
        res.json(notification);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const markAllRead = async (req, res) => {
    try {
        await Notification.update(
            { isRead: true },
            { where: { userId: req.user.id, isRead: false } }
        );
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteNotification = async (req, res) => {
    try {
        const notification = await Notification.findByPk(req.params.id);
        if (!notification) return res.status(404).json({ error: 'Notification not found' });

        if (notification.userId !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await notification.destroy();
        res.json({ message: 'Notification deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
