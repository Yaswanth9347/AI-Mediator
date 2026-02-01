import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const ConversationSummary = sequelize.define('conversation_summary', {
    disputeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'disputes',
            key: 'id'
        }
    },

    // Type of summary
    summaryType: {
        type: DataTypes.STRING,
        defaultValue: 'incremental'
    }, // 'incremental', 'full', 'key_points'

    // The summary content
    content: {
        type: DataTypes.TEXT,
        allowNull: false
    },

    // Message range this summary covers
    messagesFrom: { type: DataTypes.INTEGER }, // Starting message ID
    messagesTo: { type: DataTypes.INTEGER },   // Ending message ID
    messageCount: { type: DataTypes.INTEGER }, // Number of messages summarized

    // Key points extracted (for quick reference)
    keyPoints: { type: DataTypes.JSONB }, // ['point1', 'point2', ...]

    // Sentiment/tone tracking
    overallTone: { type: DataTypes.STRING }, // 'cooperative', 'adversarial', 'neutral', 'improving'

    // Version for tracking updates
    version: { type: DataTypes.INTEGER, defaultValue: 1 }
}, {
    indexes: [
        { fields: ['disputeId'] },
        { fields: ['summaryType'] },
        { fields: ['createdAt'] }
    ]
});

export default ConversationSummary;
