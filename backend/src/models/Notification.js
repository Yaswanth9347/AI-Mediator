import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Notification = sequelize.define('notification', {
    userId: { type: DataTypes.INTEGER, allowNull: false }, // Recipient user ID
    type: { type: DataTypes.STRING, allowNull: false }, // dispute, message, ai, resolution, admin, system
    title: { type: DataTypes.STRING, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    disputeId: { type: DataTypes.INTEGER }, // Related dispute (if applicable)
    relatedId: { type: DataTypes.INTEGER }, // Related resource ID (message, evidence, etc.)
    isRead: { type: DataTypes.BOOLEAN, defaultValue: false },
    priority: { type: DataTypes.STRING, defaultValue: 'normal' }, // low, normal, high, urgent
    metadata: { type: DataTypes.JSONB, defaultValue: {} }, // Additional data
}, {
    indexes: [
        { fields: ['userId'] },
        { fields: ['isRead'] },
        { fields: ['createdAt'] },
        { fields: ['userId', 'isRead'] },
    ]
});

export default Notification;
