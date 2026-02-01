
import sequelize from '../config/db.js';
import User from './User.js';
import Session from './Session.js';
import Dispute from './Dispute.js';
import Message from './Message.js';
import Evidence from './Evidence.js';
import Notification from './Notification.js';
import Contact from './Contact.js';
import AuditLog from './AuditLog.js';
import ConversationSummary from './ConversationSummary.js';
import LegalKnowledge from './LegalKnowledge.js';

// Associations
User.hasMany(Session, { foreignKey: 'userId', as: 'sessions' });
Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Dispute associations
Dispute.hasMany(ConversationSummary, { foreignKey: 'disputeId', as: 'summaries' });
ConversationSummary.belongsTo(Dispute, { foreignKey: 'disputeId', as: 'dispute' });

export {
    sequelize,
    User,
    Session,
    Dispute,
    Message,
    Evidence,
    Notification,
    Contact,
    AuditLog,
    ConversationSummary,
    LegalKnowledge
};

