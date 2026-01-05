/**
 * Payment Service
 * Handles all payment processing using Stripe
 */

import Stripe from 'stripe';
import { logInfo, logError, logWarn } from './logger.js';

// Initialize Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
let stripe = null;

if (stripeSecretKey && stripeSecretKey !== 'sk_test_your_stripe_secret_key_here') {
    stripe = new Stripe(stripeSecretKey, {
        apiVersion: '2023-10-16',
    });
    logInfo('Stripe payment service initialized');
} else {
    logWarn('Stripe not configured - payment features will be disabled');
}

/**
 * Check if Stripe is configured
 */
export const isStripeConfigured = () => {
    return stripe !== null;
};

/**
 * Create Payment Intent
 * Creates a Stripe payment intent for dispute filing fee
 */
export const createPaymentIntent = async ({ amount, currency, metadata, description }) => {
    if (!stripe) {
        throw new Error('Payment service not configured. Please contact support.');
    }

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount, // Amount in cents
            currency: currency || process.env.PAYMENT_CURRENCY || 'usd',
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: metadata || {},
            description: description || 'Dispute Filing Fee',
        });

        logInfo('Payment intent created', {
            paymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
        });

        return {
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: paymentIntent.status,
        };
    } catch (error) {
        logError('Failed to create payment intent', error);
        throw new Error(`Payment initialization failed: ${error.message}`);
    }
};

/**
 * Retrieve Payment Intent
 * Gets the current status of a payment intent
 */
export const retrievePaymentIntent = async (paymentIntentId) => {
    if (!stripe) {
        throw new Error('Payment service not configured');
    }

    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        return {
            id: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: paymentIntent.status,
            metadata: paymentIntent.metadata,
            created: paymentIntent.created,
            charges: paymentIntent.charges?.data || [],
        };
    } catch (error) {
        logError('Failed to retrieve payment intent', error);
        throw new Error(`Failed to retrieve payment status: ${error.message}`);
    }
};

/**
 * Confirm Payment
 * Confirms a payment intent (server-side confirmation if needed)
 */
export const confirmPayment = async (paymentIntentId) => {
    if (!stripe) {
        throw new Error('Payment service not configured');
    }

    try {
        const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId);

        logInfo('Payment confirmed', {
            paymentIntentId: paymentIntent.id,
            status: paymentIntent.status,
        });

        return {
            id: paymentIntent.id,
            status: paymentIntent.status,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
        };
    } catch (error) {
        logError('Failed to confirm payment', error);
        throw new Error(`Payment confirmation failed: ${error.message}`);
    }
};

/**
 * Cancel Payment Intent
 * Cancels a payment intent if it hasn't been completed
 */
export const cancelPaymentIntent = async (paymentIntentId, reason = 'requested_by_customer') => {
    if (!stripe) {
        throw new Error('Payment service not configured');
    }

    try {
        const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId, {
            cancellation_reason: reason,
        });

        logInfo('Payment intent cancelled', {
            paymentIntentId: paymentIntent.id,
            reason,
        });

        return {
            id: paymentIntent.id,
            status: paymentIntent.status,
        };
    } catch (error) {
        logError('Failed to cancel payment intent', error);
        throw new Error(`Payment cancellation failed: ${error.message}`);
    }
};

/**
 * Create Refund
 * Issues a refund for a successful payment
 */
export const createRefund = async ({ paymentIntentId, amount, reason }) => {
    if (!stripe) {
        throw new Error('Payment service not configured');
    }

    try {
        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            amount: amount, // Optional - if not provided, refunds full amount
            reason: reason || 'requested_by_customer',
        });

        logInfo('Refund created', {
            refundId: refund.id,
            paymentIntentId,
            amount: refund.amount,
            status: refund.status,
        });

        return {
            id: refund.id,
            paymentIntentId: paymentIntentId,
            amount: refund.amount,
            currency: refund.currency,
            status: refund.status,
            reason: refund.reason,
        };
    } catch (error) {
        logError('Failed to create refund', error);
        throw new Error(`Refund failed: ${error.message}`);
    }
};

/**
 * List Customer Payments
 * Retrieves payment history for a customer
 */
export const listCustomerPayments = async (customerEmail, limit = 10) => {
    if (!stripe) {
        throw new Error('Payment service not configured');
    }

    try {
        const paymentIntents = await stripe.paymentIntents.list({
            limit,
        });

        // Filter by customer email in metadata
        const customerPayments = paymentIntents.data.filter(
            (pi) => pi.metadata?.customerEmail === customerEmail
        );

        return customerPayments.map((pi) => ({
            id: pi.id,
            amount: pi.amount,
            currency: pi.currency,
            status: pi.status,
            created: pi.created,
            description: pi.description,
            metadata: pi.metadata,
        }));
    } catch (error) {
        logError('Failed to list customer payments', error);
        throw new Error(`Failed to retrieve payment history: ${error.message}`);
    }
};

/**
 * Verify Webhook Signature
 * Validates that webhook events are from Stripe
 */
export const verifyWebhookSignature = (payload, signature) => {
    if (!stripe) {
        throw new Error('Payment service not configured');
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        throw new Error('Webhook secret not configured');
    }

    try {
        const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        return event;
    } catch (error) {
        logError('Webhook signature verification failed', error);
        throw new Error(`Invalid webhook signature: ${error.message}`);
    }
};

/**
 * Handle Webhook Event
 * Processes Stripe webhook events
 */
export const handleWebhookEvent = async (event) => {
    logInfo('Processing webhook event', {
        type: event.type,
        id: event.id,
    });

    switch (event.type) {
        case 'payment_intent.succeeded':
            // Payment was successful
            logInfo('Payment succeeded', {
                paymentIntentId: event.data.object.id,
                amount: event.data.object.amount,
            });
            return {
                type: 'success',
                paymentIntentId: event.data.object.id,
                status: 'succeeded',
            };

        case 'payment_intent.payment_failed':
            // Payment failed
            logWarn('Payment failed', {
                paymentIntentId: event.data.object.id,
                error: event.data.object.last_payment_error?.message,
            });
            return {
                type: 'failure',
                paymentIntentId: event.data.object.id,
                status: 'failed',
                error: event.data.object.last_payment_error?.message,
            };

        case 'payment_intent.canceled':
            // Payment was canceled
            logInfo('Payment canceled', {
                paymentIntentId: event.data.object.id,
            });
            return {
                type: 'canceled',
                paymentIntentId: event.data.object.id,
                status: 'canceled',
            };

        case 'charge.refunded':
            // Refund was issued
            logInfo('Refund processed', {
                chargeId: event.data.object.id,
                amount: event.data.object.amount_refunded,
            });
            return {
                type: 'refund',
                chargeId: event.data.object.id,
                status: 'refunded',
            };

        default:
            logWarn('Unhandled webhook event type', { type: event.type });
            return { type: 'unhandled', eventType: event.type };
    }
};

/**
 * Calculate Dispute Filing Fee
 * Returns the fee amount based on dispute type or value
 */
export const calculateDisputeFee = (disputeType, disputeValue) => {
    // Base fee from environment or default $25.00
    const baseFee = parseInt(process.env.DISPUTE_FILING_FEE) || 2500; // in cents

    // You can add logic here to adjust fees based on dispute type or value
    // For now, returning base fee
    return baseFee;
};

/**
 * Format Currency Amount
 * Converts cents to dollars for display
 */
export const formatCurrency = (amountInCents, currency = 'usd') => {
    const amount = amountInCents / 100;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
    }).format(amount);
};

export default {
    isStripeConfigured,
    createPaymentIntent,
    retrievePaymentIntent,
    confirmPayment,
    cancelPaymentIntent,
    createRefund,
    listCustomerPayments,
    verifyWebhookSignature,
    handleWebhookEvent,
    calculateDisputeFee,
    formatCurrency,
};
