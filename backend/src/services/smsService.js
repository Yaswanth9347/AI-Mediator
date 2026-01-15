import twilio from 'twilio';
import { logInfo, logError, logWarn } from './logger.js';

/**
 * SMS Service using Twilio
 * Handles all SMS notifications for the platform
 */

// Twilio configuration
const TWILIO_CONFIG = {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER
};

let twilioClient = null;

/**
 * Initialize Twilio client
 */
function initializeTwilioClient() {
    if (!TWILIO_CONFIG.accountSid || !TWILIO_CONFIG.authToken || !TWILIO_CONFIG.phoneNumber) {
        logWarn('SMS notifications disabled: Twilio credentials not configured in .env file');
        return null;
    }

    try {
        twilioClient = twilio(TWILIO_CONFIG.accountSid, TWILIO_CONFIG.authToken);
        logInfo('Twilio SMS service initialized successfully', {
            phoneNumber: TWILIO_CONFIG.phoneNumber
        });
        return twilioClient;
    } catch (error) {
        logError('Failed to initialize Twilio SMS service', {
            error: error.message
        });
        return null;
    }
}

// Initialize on module load
initializeTwilioClient();

/**
 * Check if SMS service is configured
 */
export const isSmsConfigured = () => {
    return twilioClient !== null;
};

/**
 * Send SMS message
 * @param {string} to - Recipient phone number (E.164 format: +1234567890)
 * @param {string} message - SMS message content
 * @returns {Promise<Object>} Twilio response
 */
export const sendSMS = async (to, message) => {
    if (!twilioClient) {
        logWarn('SMS not sent: Twilio not configured', { to });
        return { success: false, reason: 'SMS service not configured' };
    }

    // Validate phone number format
    if (!to || !to.startsWith('+')) {
        logError('Invalid phone number format', { to });
        return { success: false, reason: 'Invalid phone number format. Use E.164 format (+1234567890)' };
    }

    try {
        const result = await twilioClient.messages.create({
            body: message,
            from: TWILIO_CONFIG.phoneNumber,
            to: to
        });

        logInfo('SMS sent successfully', {
            to,
            messageId: result.sid,
            status: result.status
        });

        return {
            success: true,
            messageId: result.sid,
            status: result.status,
            to: result.to
        };
    } catch (error) {
        logError('Failed to send SMS', {
            to,
            error: error.message,
            code: error.code
        });

        return {
            success: false,
            reason: error.message,
            code: error.code
        };
    }
};

/**
 * Send 2FA verification code via SMS
 */
export const send2FACode = async (phoneNumber, code, userName) => {
    const message = `[AI Mediator] Your 2FA verification code is: ${code}\n\nThis code will expire in 5 minutes.\n\nIf you didn't request this, please secure your account immediately.`;

    return await sendSMS(phoneNumber, message);
};

/**
 * Send dispute creation notification via SMS
 */
export const sendDisputeCreatedSMS = async (phoneNumber, disputeId, plaintiffName, disputeTitle) => {
    const message = `[AI Mediator] LEGAL NOTICE: ${plaintiffName} has filed a dispute against you.\n\nCase ID: #${disputeId}\nTitle: ${disputeTitle}\n\nPlease login to respond within 7 days.\n\nVisit: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`;

    return await sendSMS(phoneNumber, message);
};

/**
 * Send dispute accepted notification via SMS
 */
export const sendDisputeAcceptedSMS = async (phoneNumber, disputeId, respondentName) => {
    const message = `[AI Mediator] ${respondentName} has accepted your dispute (Case #${disputeId}).\n\nThe case is now active. Login to continue the discussion.`;

    return await sendSMS(phoneNumber, message);
};

/**
 * Send AI analysis complete notification via SMS
 */
export const sendAIAnalysisCompleteSMS = async (phoneNumber, disputeId, solutionCount) => {
    const message = `[AI Mediator] AI analysis complete for Case #${disputeId}.\n\n${solutionCount} solutions proposed. Please review and vote.\n\nLogin to view: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/disputes/${disputeId}`;

    return await sendSMS(phoneNumber, message);
};

/**
 * Send signature required notification via SMS
 */
export const sendSignatureRequiredSMS = async (phoneNumber, disputeId, otherPartyName) => {
    const message = `[AI Mediator] ${otherPartyName} has signed the settlement agreement for Case #${disputeId}.\n\nYour signature is required to finalize the resolution.\n\nLogin to sign now.`;

    return await sendSMS(phoneNumber, message);
};

/**
 * Send resolution approved notification via SMS
 */
export const sendResolutionApprovedSMS = async (phoneNumber, disputeId) => {
    const message = `[AI Mediator] ✓ Your case #${disputeId} has been resolved!\n\nAdmin has approved the settlement agreement. Both parties can now download the final document.\n\nThank you for using our platform.`;

    return await sendSMS(phoneNumber, message);
};

/**
 * Send court forwarding notification via SMS
 */
export const sendCourtForwardingSMS = async (phoneNumber, disputeId, courtName, courtType) => {
    const message = `[AI Mediator] IMPORTANT: Case #${disputeId} has been forwarded to ${courtType} Court.\n\nCourt: ${courtName}\n\nYou will receive further instructions from the court. Login for details.`;

    return await sendSMS(phoneNumber, message);
};

/**
 * Send password reset code via SMS
 */
export const sendPasswordResetSMS = async (phoneNumber, resetCode, userName) => {
    const message = `[AI Mediator] Your password reset code is: ${resetCode}\n\nThis code will expire in 15 minutes.\n\nIf you didn't request this, please ignore this message.`;

    return await sendSMS(phoneNumber, message);
};

/**
 * Send new message notification via SMS
 */
export const sendNewMessageSMS = async (phoneNumber, disputeId, senderName, messagePreview) => {
    const preview = messagePreview.length > 50 ? messagePreview.substring(0, 50) + '...' : messagePreview;
    const message = `[AI Mediator] New message from ${senderName} in Case #${disputeId}:\n\n"${preview}"\n\nLogin to reply.`;

    return await sendSMS(phoneNumber, message);
};

/**
 * Send evidence uploaded notification via SMS
 */
export const sendEvidenceUploadedSMS = async (phoneNumber, disputeId, uploaderName) => {
    const message = `[AI Mediator] ${uploaderName} has uploaded new evidence in Case #${disputeId}.\n\nLogin to review the evidence.`;

    return await sendSMS(phoneNumber, message);
};

/**
 * Bulk SMS send (with rate limiting consideration)
 */
export const sendBulkSMS = async (recipients) => {
    if (!twilioClient) {
        logWarn('Bulk SMS not sent: Twilio not configured');
        return { success: false, reason: 'SMS service not configured' };
    }

    const results = [];

    for (const recipient of recipients) {
        try {
            // Add delay to avoid rate limiting (Twilio allows ~1 message/second on trial)
            await new Promise(resolve => setTimeout(resolve, 1000));

            const result = await sendSMS(recipient.to, recipient.message);
            results.push({ ...result, to: recipient.to });
        } catch (error) {
            logError('Bulk SMS error', { to: recipient.to, error: error.message });
            results.push({ success: false, to: recipient.to, reason: error.message });
        }
    }

    return {
        success: true,
        total: recipients.length,
        sent: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
    };
};

export default {
    isSmsConfigured,
    sendSMS,
    send2FACode,
    sendDisputeCreatedSMS,
    sendDisputeAcceptedSMS,
    sendAIAnalysisCompleteSMS,
    sendSignatureRequiredSMS,
    sendResolutionApprovedSMS,
    sendCourtForwardingSMS,
    sendPasswordResetSMS,
    sendNewMessageSMS,
    sendEvidenceUploadedSMS,
    sendBulkSMS
};
