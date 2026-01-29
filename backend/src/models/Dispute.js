import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Dispute = sequelize.define('dispute', {
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    status: { type: DataTypes.STRING, defaultValue: 'Pending' }, // Pending, Active, AwaitingDecision, Resolved, ForwardedToCourt
    evidenceText: { type: DataTypes.TEXT },
    evidenceImage: { type: DataTypes.STRING },
    aiAnalysis: { type: DataTypes.TEXT },
    resolutionNotes: { type: DataTypes.TEXT },
    creatorId: { type: DataTypes.INTEGER },

    // Plaintiff (Person 1) Details
    plaintiffName: { type: DataTypes.STRING, allowNull: false },
    plaintiffEmail: { type: DataTypes.STRING, allowNull: false },
    plaintiffPhone: { type: DataTypes.STRING, allowNull: false },
    plaintiffAddress: { type: DataTypes.TEXT, allowNull: false },
    plaintiffOccupation: { type: DataTypes.STRING, allowNull: false },

    // Respondent (Person 2) Details
    respondentName: { type: DataTypes.STRING, allowNull: false },
    respondentEmail: { type: DataTypes.STRING, allowNull: false },
    respondentPhone: { type: DataTypes.STRING, allowNull: false },
    respondentAddress: { type: DataTypes.TEXT, allowNull: false },
    respondentOccupation: { type: DataTypes.STRING, allowNull: false },

    respondentId: { type: DataTypes.INTEGER }, // Linked User ID when they respond
    respondentAccepted: { type: DataTypes.BOOLEAN, defaultValue: false }, // Whether defendant accepted the case
    defendantStatement: { type: DataTypes.TEXT }, // The respondent's initial side of the story

    // AI Solutions & Acceptance System
    aiSolutions: { type: DataTypes.TEXT }, // JSON array of 3 solutions
    // Specific Solution Choices (New)
    plaintiffChoice: { type: DataTypes.INTEGER, defaultValue: null }, // 0, 1, 2, or -1 (Reject All)
    defendantChoice: { type: DataTypes.INTEGER, defaultValue: null }, // 0, 1, 2, or -1 (Reject All)
    reanalysisCount: { type: DataTypes.INTEGER, defaultValue: 0 }, // 0 = first analysis, 1 = reanalysis done

    // Court Forwarding
    forwardedToCourt: { type: DataTypes.BOOLEAN, defaultValue: false },
    courtType: { type: DataTypes.STRING }, // 'District' or 'High'
    courtReason: { type: DataTypes.TEXT },
    courtName: { type: DataTypes.STRING },
    courtLocation: { type: DataTypes.STRING },
    courtForwardedAt: { type: DataTypes.DATE },
    courtForwardedBy: { type: DataTypes.INTEGER }, // Admin user ID who forwarded

    // Resolution Phase Fields
    resolutionStatus: { type: DataTypes.STRING, defaultValue: 'None' }, // None, InProgress, Signed, AdminReview, Finalized
    plaintiffVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
    respondentVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
    respondentIdVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
    respondentIdData: { type: DataTypes.TEXT }, // JSON string of verification data
    plaintiffSignature: { type: DataTypes.STRING }, // Path to sig image
    respondentSignature: { type: DataTypes.STRING }, // Path to sig image
    agreementDocPath: { type: DataTypes.STRING },
    resolutionViewed: { type: DataTypes.BOOLEAN, defaultValue: false },

    // Document Metadata (for verification)
    documentId: { type: DataTypes.STRING }, // UUID for document verification
    documentHash: { type: DataTypes.STRING }, // SHA-256 hash for tamper detection

    // Payment Information
    paymentStatus: {
        type: DataTypes.STRING,
        defaultValue: 'pending'
    }, // pending, processing, paid, failed, refunded
    paymentIntentId: { type: DataTypes.STRING }, // Stripe payment intent ID
    paymentAmount: { type: DataTypes.INTEGER }, // Amount in cents
    paymentCurrency: { type: DataTypes.STRING, defaultValue: 'usd' },
    paidAt: { type: DataTypes.DATE },
    refundedAt: { type: DataTypes.DATE },
    refundAmount: { type: DataTypes.INTEGER }, // Amount refunded in cents
    refundReason: { type: DataTypes.TEXT },
});

export default Dispute;
