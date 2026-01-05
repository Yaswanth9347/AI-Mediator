import { CheckCircle, FileText, Download, Home, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PaymentSuccess({ paymentIntent, dispute }) {
    const navigate = useNavigate();

    const formatDate = (timestamp) => {
        return new Date(timestamp * 1000).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatAmount = (amount) => {
        return `$${(amount / 100).toFixed(2)}`;
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 p-4 flex items-center justify-center">
            <div className="max-w-2xl w-full">
                {/* Success Card */}
                <div className="bg-gray-900 border border-green-700 rounded-lg shadow-2xl overflow-hidden">
                    {/* Success Header */}
                    <div className="bg-gradient-to-r from-green-900/50 to-blue-900/30 p-8 text-center border-b border-green-800">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-600 rounded-full mb-4 animate-bounce">
                            <CheckCircle className="w-12 h-12 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold text-white mb-2">Payment Successful!</h1>
                        <p className="text-green-300 text-lg">Your dispute has been filed</p>
                    </div>

                    {/* Payment Details */}
                    <div className="p-8 space-y-6">
                        {/* Transaction ID */}
                        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-white">Transaction Details</h2>
                                <span className="bg-green-600 text-white text-xs px-3 py-1 rounded-full font-semibold">
                                    PAID
                                </span>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-2 border-b border-gray-700">
                                    <span className="text-gray-400">Transaction ID</span>
                                    <span className="text-white font-mono text-sm">
                                        {paymentIntent?.id || 'N/A'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-gray-700">
                                    <span className="text-gray-400">Amount Paid</span>
                                    <span className="text-white font-semibold text-lg">
                                        {formatAmount(paymentIntent?.amount || 0)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-gray-700">
                                    <span className="text-gray-400">Payment Method</span>
                                    <span className="text-white">
                                        {paymentIntent?.payment_method_types?.[0]?.toUpperCase() || 'Card'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center py-2">
                                    <span className="text-gray-400">Date & Time</span>
                                    <span className="text-white">
                                        {paymentIntent?.created ? formatDate(paymentIntent.created) : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Dispute Info */}
                        {dispute && (
                            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <FileText className="w-6 h-6 text-blue-400" />
                                    <h2 className="text-lg font-semibold text-white">Dispute Information</h2>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between py-2">
                                        <span className="text-gray-400">Case Number</span>
                                        <span className="text-white font-mono">{dispute.id}</span>
                                    </div>
                                    <div className="flex justify-between py-2">
                                        <span className="text-gray-400">Title</span>
                                        <span className="text-white">{dispute.title}</span>
                                    </div>
                                    <div className="flex justify-between py-2">
                                        <span className="text-gray-400">Status</span>
                                        <span className="bg-yellow-600 text-white text-xs px-3 py-1 rounded-full">
                                            {dispute.status?.toUpperCase()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* What's Next */}
                        <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-6">
                            <h2 className="text-lg font-semibold text-white mb-4">What Happens Next?</h2>
                            <ol className="space-y-3">
                                <li className="flex gap-3">
                                    <span className="bg-purple-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm flex-shrink-0">
                                        1
                                    </span>
                                    <span className="text-gray-300">
                                        You'll receive an email confirmation with your receipt
                                    </span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="bg-purple-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm flex-shrink-0">
                                        2
                                    </span>
                                    <span className="text-gray-300">
                                        Our team will review your dispute within 24-48 hours
                                    </span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="bg-purple-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm flex-shrink-0">
                                        3
                                    </span>
                                    <span className="text-gray-300">
                                        You can track your dispute status in the dashboard
                                    </span>
                                </li>
                            </ol>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-4">
                            <button
                                onClick={() => navigate('/dashboard')}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
                            >
                                <Home className="w-5 h-5" />
                                Go to Dashboard
                            </button>
                            {dispute && (
                                <button
                                    onClick={() => navigate(`/dispute/${dispute.id}`)}
                                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
                                >
                                    View Dispute
                                    <ArrowRight className="w-5 h-5" />
                                </button>
                            )}
                        </div>

                        {/* Download Receipt */}
                        <button
                            onClick={() => window.print()}
                            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors border border-gray-700"
                        >
                            <Download className="w-5 h-5" />
                            Download Receipt
                        </button>
                    </div>
                </div>

                {/* Support Info */}
                <div className="mt-6 text-center text-gray-400 text-sm">
                    <p>
                        Need help? Contact us at{' '}
                        <a href="mailto:support@mediaai.com" className="text-blue-400 hover:underline">
                            support@mediaai.com
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
