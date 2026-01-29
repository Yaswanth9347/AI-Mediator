import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Session = sequelize.define('session', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    token: {
        type: DataTypes.STRING(512),
        allowNull: false,
        unique: true
    },
    tokenHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true
    },
    deviceType: {
        type: DataTypes.STRING(50),
        defaultValue: 'Unknown'
    },
    deviceName: {
        type: DataTypes.STRING(100),
        defaultValue: 'Unknown Device'
    },
    browser: {
        type: DataTypes.STRING(100),
        defaultValue: 'Unknown Browser'
    },
    browserVersion: {
        type: DataTypes.STRING(50)
    },
    os: {
        type: DataTypes.STRING(100),
        defaultValue: 'Unknown OS'
    },
    ipAddress: {
        type: DataTypes.STRING(45) // IPv6 compatible
    },
    location: {
        type: DataTypes.STRING(200),
        defaultValue: 'Unknown Location'
    },
    lastActivity: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    revokedAt: {
        type: DataTypes.DATE
    },
    revokedReason: {
        type: DataTypes.STRING(200)
    }
}, {
    indexes: [
        { fields: ['userId'] },
        { fields: ['tokenHash'] },
        { fields: ['isActive'] },
        { fields: ['expiresAt'] }
    ]
});

export default Session;
