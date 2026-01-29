import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Contact = sequelize.define('contact', {
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false },
    subject: { type: DataTypes.STRING, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'Open' }, // Open, Replied, Closed
    adminReply: { type: DataTypes.TEXT },
    repliedAt: { type: DataTypes.DATE },
    repliedBy: { type: DataTypes.INTEGER } // Admin User ID
});

export default Contact;
