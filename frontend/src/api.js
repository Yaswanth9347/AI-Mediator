import axios from 'axios';
import * as Sentry from '@sentry/react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
    baseURL: API_URL,
});


api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token && !config.skipAuth) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle errors and capture to Sentry
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Handle 401 errors - redirect to login
        if (error.response?.status === 401) {
            const errorCode = error.response?.data?.code;
            const hadToken = !!localStorage.getItem('token');

            // Clear local storage for any auth error
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            localStorage.removeItem('username');

            // Show appropriate message based on error code (only if there was an active token)
            if (hadToken && errorCode === 'SESSION_INVALID') {
                sessionStorage.setItem('sessionExpiredMessage', 'Your session was ended. Please log in again.');
            } else if (hadToken && errorCode === 'TOKEN_EXPIRED') {
                sessionStorage.setItem('sessionExpiredMessage', 'Your session has expired. Please log in again.');
            }

            // Redirect to login if not already there
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
            return Promise.reject(error);
        }

        // Capture significant errors to Sentry
        const shouldCapture =
            error.response?.status >= 500 || // Server errors
            !error.response ||                // Network errors
            error.code === 'ECONNABORTED' ||  // Timeout errors
            error.code === 'ERR_NETWORK';     // Network failures

        if (shouldCapture) {
            Sentry.captureException(error, {
                tags: {
                    error_type: 'api_error',
                    status_code: error.response?.status,
                    endpoint: error.config?.url,
                    method: error.config?.method,
                },
                contexts: {
                    api: {
                        url: error.config?.url,
                        method: error.config?.method,
                        baseURL: error.config?.baseURL,
                        status: error.response?.status,
                        statusText: error.response?.statusText,
                    },
                },
                user: {
                    username: localStorage.getItem('username'),
                    email: localStorage.getItem('email'),
                },
            });
        }

        return Promise.reject(error);
    }
);
export const getDisputes = (params) => api.get('/disputes', { params });
export const getDispute = (id) => api.get(`/disputes/${id}`);
export const createDispute = (formData) => api.post('/disputes', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
});
export const updateDispute = (id, data) => api.put(`/disputes/${id}`, data);
export const respondToDispute = (id, data) => api.post(`/disputes/${id}/respond`, data);
export const acceptCase = (id, data) => api.post(`/disputes/${id}/respond`, data);
export const getMessages = (id, params) => api.get(`/disputes/${id}/messages`, { params });
export const sendMessage = (id, formData) => api.post(`/disputes/${id}/messages`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
});
export const submitDecision = (id, choice) => api.post(`/disputes/${id}/decision`, { choice });
export const requestReanalysis = (id) => api.post(`/disputes/${id}/request-reanalysis`);
export const getMessageCount = (id) => api.get(`/disputes/${id}/message-count`);

// Identity Verification APIs
export const verifyIdentity = (formData) => api.post('/auth/verify', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
});
export const getVerificationStatus = () => api.get('/auth/verification-status');

export const getStats = () => api.get('/stats');

// User Profile APIs
export const getUserProfile = () => api.get('/users/profile');
export const updateUserProfile = (data) => api.put('/users/profile', data);
export const changePassword = (data) => api.post('/users/change-password', data);
export const getMyDisputes = () => api.get('/users/my-disputes');

// Notification Preferences APIs
export const getNotificationPreferences = () => api.get('/users/notification-preferences');
export const updateNotificationPreferences = (data) => api.put('/users/notification-preferences', data);

// Privacy & Data APIs
export const exportUserData = () => api.get('/users/export-data');
export const deleteAccount = () => api.delete('/users/account');

// Session Management APIs
export const getActiveSessions = () => api.get('/users/sessions');
export const revokeSession = (sessionId) => api.delete(`/users/sessions/${sessionId}`);
export const revokeAllSessions = () => api.post('/users/sessions/revoke-all');
export const logout = () => api.post('/auth/logout');

// Password Reset APIs
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email });
export const resetPassword = (token, newPassword) => api.post('/auth/reset-password', { token, newPassword });

// Email Verification APIs
export const verifyEmail = (token) => api.get(`/auth/verify-email/${token}`, { skipAuth: true });
export const resendVerificationEmail = (email) => api.post('/auth/resend-verification', { email });

// Case History / Audit Trail
export const getCaseHistory = (id) => api.get(`/disputes/${id}/history`);

// Evidence Management APIs
export const uploadEvidence = (id, formData) => api.post(`/disputes/${id}/evidence`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
});
export const getEvidence = (id) => api.get(`/disputes/${id}/evidence`);
export const getEvidenceDetails = (disputeId, evidenceId) => api.get(`/disputes/${disputeId}/evidence/${evidenceId}`);
export const deleteEvidence = (disputeId, evidenceId) => api.delete(`/disputes/${disputeId}/evidence/${evidenceId}`);
export const downloadEvidence = (disputeId, evidenceId) => api.get(`/disputes/${disputeId}/evidence/${evidenceId}/download`, {
    responseType: 'blob'
});
export const getEvidencePreviewUrl = (disputeId, evidenceId) =>
    `${API_URL}/disputes/${disputeId}/evidence/${evidenceId}/preview`;

// OCR APIs
export const getEvidenceOcr = (disputeId, evidenceId) => api.get(`/disputes/${disputeId}/evidence/${evidenceId}/ocr`);
export const processEvidenceOcr = (disputeId, evidenceId) => api.post(`/disputes/${disputeId}/evidence/${evidenceId}/ocr`);
export const processAllOcr = (disputeId) => api.post(`/disputes/${disputeId}/ocr/process-all`);

// External OCR Service
export const verifyGovtId = (formData) => api.post('/external/ocr/verify', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
});

// Notification APIs
export const getNotifications = (params) => api.get('/notifications', { params });
export const markAsRead = (id) => api.post(`/notifications/${id}/read`);
export const markAllAsRead = () => api.post('/notifications/read-all');
export const deleteNotification = (id) => api.delete(`/notifications/${id}`);

// Admin User Management APIs
export const getAllUsers = () => api.get('/admin/users');
export const updateUserRole = (userId, role) => api.put(`/admin/users/${userId}/role`, { role });
export const suspendUser = (userId, reason) => api.post(`/admin/users/${userId}/suspend`, { reason });
export const activateUser = (userId) => api.post(`/admin/users/${userId}/activate`);
export const getUserActivity = (userId, limit = 50) => api.get(`/admin/users/${userId}/activity`, { params: { limit } });
export const deleteUserAdmin = (userId) => api.delete(`/admin/users/${userId}`);

// Payment APIs
export const getPaymentConfig = () => api.get('/payment/config');
export const createPaymentIntent = (disputeId, disputeTitle) => api.post('/payment/create-intent', { disputeId, disputeTitle });
export const getPaymentStatus = (disputeId) => api.get(`/payment/status/${disputeId}`);
export const confirmPayment = (disputeId) => api.post(`/payment/confirm/${disputeId}`);
export const requestRefund = (disputeId, reason, amount) => api.post(`/payment/refund/${disputeId}`, { reason, amount });

// Profile Management APIs
export const uploadProfilePicture = (formData) => api.post('/users/profile-picture', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
});
export const deleteProfilePicture = () => api.delete('/users/profile-picture');
export const getActivityLogs = (page = 1, limit = 20, category = 'all') => api.get('/users/activity-logs', {
    params: { page, limit, category }
});
export const updatePrivacySettings = (settings) => api.put('/users/privacy-settings', settings);
export const enable2FA = () => api.post('/users/enable-2fa');
export const verify2FA = (code) => api.post('/users/verify-2fa', { code });
export const disable2FA = (password) => api.post('/users/disable-2fa', { password });
export const getUserStatistics = () => api.get('/users/statistics');

// PDF Report APIs
export const downloadCaseSummaryReport = (disputeId) => api.get(`/disputes/${disputeId}/report/summary`, {
    responseType: 'blob'
});
export const downloadAgreementPDF = (disputeId) => api.get(`/disputes/${disputeId}/report/agreement`, {
    responseType: 'blob'
});
export const getAgreementPreviewUrl = (disputeId) => {
    const token = localStorage.getItem('token');
    return `${API_URL}/disputes/${disputeId}/report/agreement/preview?token=${encodeURIComponent(token)}`;
};

export default api;
