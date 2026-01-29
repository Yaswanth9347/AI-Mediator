
import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

// AuditLog Model - Immutable event log for legal compliance
const AuditLog = sequelize.define('auditLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    // Action category and type
    action: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Action type: USER_REGISTER, USER_LOGIN, DISPUTE_CREATE, etc.'
    },
    category: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'GENERAL',
        comment: 'Category: AUTH, DISPUTE, MESSAGE, ADMIN, SYSTEM'
    },
    // Actor information
    userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'User who performed the action (null for system actions)'
    },
    userEmail: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    userName: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    userRole: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    // Target/Resource information
    resourceType: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Type of resource affected: DISPUTE, USER, MESSAGE, etc.'
    },
    resourceId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'ID of the affected resource'
    },
    // Details
    description: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: 'Human-readable description of the action'
    },
    metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional structured data about the action'
    },
    // Request context
    ipAddress: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: 'IPv4 or IPv6 address'
    },
    userAgent: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    requestId: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Request ID for tracing'
    },
    // Outcome
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'SUCCESS',
        comment: 'SUCCESS, FAILURE, PENDING'
    },
    errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
}, {
    tableName: 'audit_logs',
    timestamps: true,
    updatedAt: false, // Audit logs are immutable - no updates
    indexes: [
        { fields: ['userId'] },
        { fields: ['action'] },
        { fields: ['category'] },
        { fields: ['resourceType', 'resourceId'] },
        { fields: ['createdAt'] },
        { fields: ['status'] },
    ],
});

export default AuditLog;
