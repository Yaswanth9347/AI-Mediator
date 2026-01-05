import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import { logError, logInfo } from './logger.js';
import { logAuditEvent, AuditActions, AuditCategories } from './auditService.js';

/**
 * Initialize Sentry for error tracking and performance monitoring
 */
export function initializeSentry(app) {
    const SENTRY_DSN = process.env.SENTRY_DSN || null;
    const ENVIRONMENT = process.env.NODE_ENV || 'development';

    if (!SENTRY_DSN) {
        console.warn('⚠️  SENTRY_DSN not configured. Error tracking disabled.');
        logInfo('Sentry not initialized - DSN missing');
        return;
    }

    Sentry.init({
        dsn: SENTRY_DSN,
        environment: ENVIRONMENT,
        
        // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
        // We recommend adjusting this value in production
        tracesSampleRate: ENVIRONMENT === 'production' ? 0.1 : 1.0,
        
        // Set profilesSampleRate to 1.0 to profile every transaction.
        // Since profilesSampleRate is relative to tracesSampleRate,
        // the final profiling rate can be computed as tracesSampleRate * profilesSampleRate
        profilesSampleRate: 1.0,
        
        integrations: [
            // Enable HTTP calls tracing
            new Sentry.Integrations.Http({ tracing: true }),
            // Enable Express.js middleware tracing
            new Sentry.Integrations.Express({ app }),
            // Profiling integration
            new ProfilingIntegration(),
        ],
        
        // Ignore specific errors
        ignoreErrors: [
            'ECONNRESET',
            'ENOTFOUND',
            'ETIMEDOUT',
            'ECONNREFUSED',
            'No token provided',
            'Invalid token'
        ],
        
        // Before sending events, filter sensitive data
        beforeSend(event, hint) {
            // Don't send events in test environment
            if (process.env.NODE_ENV === 'test') {
                return null;
            }
            
            // Remove sensitive data from request
            if (event.request) {
                delete event.request.cookies;
                if (event.request.headers) {
                    delete event.request.headers.authorization;
                    delete event.request.headers.cookie;
                }
            }
            
            // Remove sensitive data from context
            if (event.contexts?.user) {
                delete event.contexts.user.ip_address;
            }
            
            return event;
        },
        
        // Enrich error events with additional context
        beforeBreadcrumb(breadcrumb, hint) {
            // Don't log SQL queries to reduce noise
            if (breadcrumb.category === 'query') {
                return null;
            }
            return breadcrumb;
        }
    });

    logInfo('Sentry initialized successfully', { environment: ENVIRONMENT });
    console.log('✅ Sentry error tracking enabled');
}

/**
 * Capture and log error with Sentry and audit trail
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 * @param {Object} user - User information
 * @param {Object} request - Express request object
 */
export async function captureError(error, context = {}, user = null, request = null) {
    // Log to Winston
    logError(error.message || 'Unknown error', {
        error: error.message,
        stack: error.stack,
        ...context
    });
    
    // Capture in Sentry
    Sentry.withScope((scope) => {
        // Add user context
        if (user) {
            scope.setUser({
                id: user.id,
                email: user.email,
                username: user.username
            });
        }
        
        // Add custom context
        Object.keys(context).forEach(key => {
            scope.setContext(key, context[key]);
        });
        
        // Add tags for filtering
        scope.setTag('error_type', error.name || 'Error');
        if (context.disputeId) {
            scope.setTag('dispute_id', context.disputeId);
        }
        
        // Capture the exception
        Sentry.captureException(error);
    });
    
    // Log to audit trail for critical errors
    if (context.severity === 'critical' || context.severity === 'high') {
        try {
            await logAuditEvent({
                action: AuditActions.SYSTEM_ERROR,
                category: AuditCategories.SYSTEM,
                user: user ? { id: user.id, email: user.email, username: user.username } : null,
                description: `Critical error: ${error.message}`,
                metadata: {
                    errorName: error.name,
                    errorMessage: error.message,
                    stack: error.stack?.substring(0, 500),
                    ...context
                },
                request,
                status: 'FAILURE',
                errorMessage: error.message
            });
        } catch (auditError) {
            // Don't let audit logging errors prevent error handling
            console.error('Failed to log error to audit trail:', auditError);
        }
    }
}

/**
 * Express error handler middleware for Sentry
 * Should be added after all routes but before other error handlers
 */
export const sentryErrorHandler = Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
        // Capture all errors except 4xx status codes (client errors)
        if (error.status && error.status >= 400 && error.status < 500) {
            return false;
        }
        return true;
    }
});

/**
 * Express request handler middleware for Sentry
 * Should be added before all routes
 */
export const sentryRequestHandler = Sentry.Handlers.requestHandler({
    user: ['id', 'email', 'username'],
    ip: false, // Don't track IP for privacy
    request: ['method', 'url', 'headers'],
    serverName: false,
    transaction: 'methodPath'
});

/**
 * Express tracing handler for performance monitoring
 */
export const sentryTracingHandler = Sentry.Handlers.tracingHandler();

export default {
    initializeSentry,
    captureError,
    sentryErrorHandler,
    sentryRequestHandler,
    sentryTracingHandler
};
