import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const LegalKnowledge = sequelize.define('legal_knowledge', {
    // Type of legal knowledge
    type: {
        type: DataTypes.STRING,
        allowNull: false
    }, // 'precedent', 'law_article', 'resolution', 'principle'

    // Classification
    category: {
        type: DataTypes.STRING,
        allowNull: false
    }, // 'consumer', 'property', 'contract', etc.

    // Title/Name
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },

    // Full content
    content: {
        type: DataTypes.TEXT,
        allowNull: false
    },

    // Summary for quick matching
    summary: { type: DataTypes.TEXT },

    // Jurisdiction
    jurisdiction: {
        type: DataTypes.STRING,
        defaultValue: 'India'
    },

    // Vector embedding (stored as JSON array)
    embedding: { type: DataTypes.JSONB },

    // Additional metadata
    metadata: { type: DataTypes.JSONB }, // {source, date, court, citation, etc.}

    // Relevance and usage tracking
    usageCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    lastUsedAt: { type: DataTypes.DATE },

    // Status
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
    indexes: [
        { fields: ['type'] },
        { fields: ['category'] },
        { fields: ['jurisdiction'] },
        { fields: ['isActive'] }
    ]
});

export default LegalKnowledge;
