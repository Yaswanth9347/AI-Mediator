/**
 * Socket Event Constants
 * Shared event names for real-time communication
 * Keep in sync with backend socket emissions
 */

export const SOCKET_EVENTS = {
    // Connection events
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    CONNECT_ERROR: 'connect_error',
    RECONNECT: 'reconnect',
    RECONNECT_ATTEMPT: 'reconnect_attempt',
    RECONNECT_FAILED: 'reconnect_failed',

    // User presence
    USER_JOIN: 'user:join',
    USER_ONLINE: 'user:online',
    USER_OFFLINE: 'user:offline',

    // Dispute room
    DISPUTE_JOIN: 'dispute:join',
    DISPUTE_LEAVE: 'dispute:leave',

    // Typing indicators
    TYPING_START: 'typing:start',
    TYPING_STOP: 'typing:stop',
    USER_TYPING: 'user:typing',
    USER_STOP_TYPING: 'user:stop-typing',

    // Messages
    MESSAGE_NEW: 'message:new',
    MESSAGE_SENT: 'message:sent', // Acknowledgment for optimistic UI

    // Dispute state changes
    DISPUTE_ACCEPTED: 'dispute:accepted',
    DISPUTE_STATUS_CHANGED: 'dispute:status-changed',
    DISPUTE_UPDATED: 'dispute:updated',

    // AI Analysis
    DISPUTE_AI_READY: 'dispute:ai-ready',
    DISPUTE_AI_ANALYZING: 'dispute:ai-analyzing',

    // Voting
    DISPUTE_VOTE_RECORDED: 'dispute:vote-recorded',

    // Evidence
    EVIDENCE_UPLOADED: 'dispute:evidence-uploaded',
    EVIDENCE_OCR_COMPLETE: 'dispute:ocr-complete',

    // Resolution & Signing
    DISPUTE_SIGNATURE_SUBMITTED: 'dispute:signature-submitted',
    DISPUTE_AGREEMENT_GENERATED: 'dispute:agreement-generated',
    DISPUTE_RESOLUTION_FINALIZED: 'dispute:resolution-finalized',

    // Court forwarding
    DISPUTE_FORWARDED_TO_COURT: 'dispute:forwarded-to-court',

    // Admin actions
    ADMIN_ACTION: 'admin:action',

    // Notifications
    NOTIFICATION_NEW: 'notification:new',
    NOTIFICATION_COUNT: 'notification:count',

    // Sync
    SYNC_REQUEST: 'sync:request',
    SYNC_RESPONSE: 'sync:response',
};

export default SOCKET_EVENTS;
