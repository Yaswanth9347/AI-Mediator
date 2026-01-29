import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Message = sequelize.define('message', {
    disputeId: { type: DataTypes.INTEGER, allowNull: false },
    senderId: { type: DataTypes.INTEGER, allowNull: false },
    senderName: { type: DataTypes.STRING, allowNull: false },
    senderRole: { type: DataTypes.STRING, allowNull: false }, // 'plaintiff' or 'defendant'
    content: { type: DataTypes.TEXT, allowNull: false },
    attachmentPath: { type: DataTypes.STRING }, // Optional file attachment
});

export default Message;
