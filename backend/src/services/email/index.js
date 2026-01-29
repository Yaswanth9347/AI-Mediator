// Email Service - Unified Export
// This file maintains backward compatibility with existing imports

import { initializeTransporter, sendEmail, getTransporter } from './transporter.js';
import {
    notifyCaseCreated,
    notifyCaseAccepted,
    notifyAIAnalysisReady,
    notifyResolutionAccepted,
    notifyCaseResolved,
    notifyCourtForwarded,
    notifyReanalysisRequested
} from './disputeEmails.js';
import {
    sendPasswordResetEmail,
    sendPasswordChangedEmail,
    sendEmailVerification,
    sendEmailVerifiedConfirmation,
    sendContactReplyEmail
} from './authEmails.js';

// Re-export all functions for backward compatibility
export default {
    // Dispute emails
    notifyCaseCreated,
    notifyCaseAccepted,
    notifyAIAnalysisReady,
    notifyResolutionAccepted,
    notifyCaseResolved,
    notifyCourtForwarded,
    notifyReanalysisRequested,

    // Auth emails
    sendPasswordResetEmail,
    sendPasswordChangedEmail,
    sendEmailVerification,
    sendEmailVerifiedConfirmation,
    sendContactReplyEmail,

    // Utility
    testEmailConfiguration: async () => {
        const transporter = getTransporter();
        if (!transporter) {
            return { success: false, message: 'Email not configured' };
        }
        try {
            await transporter.verify();
            return { success: true, message: 'Email configuration is valid' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }
};

// Named exports for individual imports
export {
    notifyCaseCreated,
    notifyCaseAccepted,
    notifyAIAnalysisReady,
    notifyResolutionAccepted,
    notifyCaseResolved,
    notifyCourtForwarded,
    notifyReanalysisRequested,
    sendPasswordResetEmail,
    sendPasswordChangedEmail,
    sendEmailVerification,
    sendEmailVerifiedConfirmation,
    sendContactReplyEmail,
    initializeTransporter,
    sendEmail
};
