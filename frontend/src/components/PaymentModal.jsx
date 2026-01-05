import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { createPaymentIntent, getPaymentConfig, confirmPayment } from '../api';
import toast from 'react-hot-toast';
import { DollarSign, CreditCard, Lock, CheckCircle, XCircle } from 'lucide-react';

// Stripe promise (loaded once)
let stripePromise = null;

const getStripePromise = async () => {
    if (!stripePromise) {
        try {
            const { data } = await getPaymentConfig();
            if (data.publishableKey && data.publishableKey !== 'pk_test_your_stripe_publishable_key_here') {
                stripePromise = loadStripe(data.publishableKey);
            }
        } catch (error) {
            console.error('Failed to load Stripe config:', error);
        }
    }
    return stripePromise;
};

/**
 * Payment Form Component (inside Elements provider)
 */
function CheckoutForm({ disputeId, amount, onSuccess, onCancel }) {
    const stripe = useStripe();
    const elements = useElements();
    const [processing, setProcessing] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!stripe || !elements) {
            return;
        }

        setProcessing(true);
        setErrorMessage('');

        try {
            // Confirm payment with Stripe
            const { error, paymentIntent } = await stripe.confirmPayment({
                elements,
                redirect: 'if_required',
            });

            if (error) {
                setErrorMessage(error.message);
                toast.error(error.message);
                setProcessing(false);
                return;
            }

            if (paymentIntent && paymentIntent.status === 'succeeded') {
                // Confirm payment on backend
                await confirmPayment(disputeId);
                toast.success('Payment successful!');
                onSuccess(paymentIntent);
            } else {
                setErrorMessage('Payment not completed. Please try again.');
                setProcessing(false);
            }
        } catch (error) {
            console.error('Payment error:', error);
            setErrorMessage(error.message || 'Payment failed. Please try again.');
            toast.error(error.message || 'Payment failed');
            setProcessing(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Payment Element */}
            <div className="bg-gray-800/50 p-6 rounded-lg border border-blue-700">
                <PaymentElement />
            </div>

            {/* Error Message */}
            {errorMessage && (
                <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-red-400 text-sm">{errorMessage}</p>
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
                <button
                    type="submit"
                    disabled={!stripe || processing}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                    {processing ? (
                        <>
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                            Processing...
                        </>
                    ) : (
                        <>
                            <Lock className="w-5 h-5" />
                            Pay ${(amount / 100).toFixed(2)}
                        </>
                    )}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={processing}
                    className="px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-gray-300 rounded-lg font-semibold transition-colors"
                >
                    Cancel
                </button>
            </div>

            {/* Security Badge */}
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                <Lock className="w-4 h-4" />
                <span>Secured by Stripe • PCI DSS Compliant</span>
            </div>
        </form>
    );
}

/**
 * Payment Modal Component
 */
export default function PaymentModal({ isOpen, onClose, disputeId, disputeTitle, onPaymentSuccess }) {
    const [clientSecret, setClientSecret] = useState(null);
    const [paymentConfig, setPaymentConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [stripePromiseState, setStripePromiseState] = useState(null);

    useEffect(() => {
        if (isOpen && disputeId) {
            initializePayment();
        }
    }, [isOpen, disputeId]);

    const initializePayment = async () => {
        setLoading(true);
        setError(null);

        try {
            // Load Stripe
            const stripe = await getStripePromise();
            if (!stripe) {
                throw new Error('Payment service not configured. Please contact support.');
            }
            setStripePromiseState(stripe);

            // Get payment config
            const configResponse = await getPaymentConfig();
            setPaymentConfig(configResponse.data);

            // Create payment intent
            const response = await createPaymentIntent(disputeId, disputeTitle);
            setClientSecret(response.data.clientSecret);
        } catch (err) {
            console.error('Payment initialization error:', err);
            setError(err.response?.data?.error || err.message || 'Failed to initialize payment');
            toast.error(err.response?.data?.error || 'Failed to initialize payment');
        } finally {
            setLoading(false);
        }
    };

    const handlePaymentSuccess = (paymentIntent) => {
        onPaymentSuccess && onPaymentSuccess(paymentIntent);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-blue-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/30 p-6 border-b border-blue-800">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-600 p-3 rounded-lg">
                                <CreditCard className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Complete Payment</h2>
                                <p className="text-sm text-gray-400 mt-1">Dispute Filing Fee</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            disabled={loading}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            <XCircle className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Dispute Info */}
                    <div className="bg-gray-800/30 border border-gray-700 rounded-lg p-4 mb-6">
                        <h3 className="text-sm font-semibold text-gray-400 mb-2">Dispute Title</h3>
                        <p className="text-white">{disputeTitle}</p>
                    </div>

                    {/* Amount Breakdown */}
                    {paymentConfig && (
                        <div className="bg-gray-800/30 border border-gray-700 rounded-lg p-4 mb-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-gray-400">Filing Fee</span>
                                <span className="text-white font-semibold">
                                    ${(paymentConfig.disputeFee / 100).toFixed(2)}
                                </span>
                            </div>
                            <div className="border-t border-gray-700 mt-3 pt-3 flex items-center justify-between">
                                <span className="text-lg font-bold text-white">Total</span>
                                <span className="text-2xl font-bold text-blue-400">
                                    ${(paymentConfig.disputeFee / 100).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Loading State */}
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                            <p className="text-gray-400">Initializing secure payment...</p>
                        </div>
                    )}

                    {/* Error State */}
                    {error && !loading && (
                        <div className="bg-red-500/10 border border-red-500 rounded-lg p-6 text-center">
                            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                            <h3 className="text-red-400 font-semibold mb-2">Payment Error</h3>
                            <p className="text-gray-400 mb-4">{error}</p>
                            <button
                                onClick={initializePayment}
                                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg transition-colors"
                            >
                                Try Again
                            </button>
                        </div>
                    )}

                    {/* Payment Form */}
                    {clientSecret && stripePromiseState && !loading && !error && (
                        <Elements stripe={stripePromiseState} options={{ clientSecret }}>
                            <CheckoutForm
                                disputeId={disputeId}
                                amount={paymentConfig.disputeFee}
                                onSuccess={handlePaymentSuccess}
                                onCancel={onClose}
                            />
                        </Elements>
                    )}

                    {/* Info Note */}
                    <div className="mt-6 bg-blue-900/20 border border-blue-800 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                            <Lock className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                            <div className="text-sm text-gray-400">
                                <p className="font-semibold text-blue-300 mb-1">Secure Payment</p>
                                <p>
                                    Your payment information is encrypted and never stored on our servers.
                                    All transactions are processed securely through Stripe.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
