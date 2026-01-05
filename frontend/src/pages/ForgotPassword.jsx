import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api';
import toast from 'react-hot-toast';
import { Mail, ArrowLeft, Send, CheckCircle, Scale, Lock } from 'lucide-react';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [emailSent, setEmailSent] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!email) {
            toast.error('Please enter your email address');
            return;
        }

        try {
            setLoading(true);
            const res = await forgotPassword(email);
            setEmailSent(true);
            toast.success(res.data.message);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to send reset email');
        } finally {
            setLoading(false);
        }
    };

    if (emailSent) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 py-8 px-4 sm:px-6 lg:px-8">
                <div className="w-full max-w-md">
                    {/* Brand Header */}
                    <div className="text-center mb-6">
                        <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-lg mb-3">
                            <Scale className="w-7 h-7 text-white" />
                        </div>
                        <h1 className="text-2xl font-semibold text-blue-100">AI Dispute Resolution</h1>
                        <p className="text-sm text-blue-300 mt-1">Secure Access Portal</p>
                    </div>

                    {/* Success Card */}
                    <div className="bg-slate-800/70 backdrop-blur-xl rounded-xl shadow-2xl border border-blue-800 p-8">
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center w-14 h-14 rounded-xl bg-green-900/30 mb-4">
                                <CheckCircle className="h-7 w-7 text-green-400" />
                            </div>
                            <h2 className="text-xl font-semibold text-blue-100 mb-2">
                                Check Your Email
                            </h2>
                            <p className="text-sm text-blue-300 mb-6 leading-relaxed">
                                If an account exists with <strong className="text-blue-200">{email}</strong>, you will receive a password reset link shortly.
                            </p>
                            
                            {/* Instructions */}
                            <div className="bg-blue-950/50 border border-blue-800 p-4 mb-6 text-left rounded-lg">
                                <p className="text-sm font-medium text-blue-200 mb-2">
                                    Next Steps:
                                </p>
                                <ul className="text-sm text-blue-300 space-y-1.5">
                                    <li className="flex items-start gap-2">
                                        <span className="text-blue-500 mt-0.5">•</span>
                                        <span>Check your inbox and spam folder</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-blue-500 mt-0.5">•</span>
                                        <span>Click the reset link in the email</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-blue-500 mt-0.5">•</span>
                                        <span>Create a new secure password</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-blue-500 mt-0.5">•</span>
                                        <span>Link expires in 1 hour for security</span>
                                    </li>
                                </ul>
                            </div>
                            
                            <Link
                                to="/login"
                                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-blue-700 rounded-lg text-blue-300 hover:bg-slate-700/50 transition-colors text-sm font-medium"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back to Login
                            </Link>
                        </div>
                    </div>

                    {/* Security Notice */}
                    <div className="mt-6 flex items-start gap-3 bg-blue-950/30 rounded-lg p-4 border border-blue-800">
                        <Lock className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-blue-300 leading-relaxed">
                            Your connection is secure and encrypted. All data is protected under strict confidentiality protocols.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 py-8 px-4 sm:px-6 lg:px-8">
            <div className="w-full max-w-md">
                {/* Brand Header */}
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-lg mb-3">
                        <Scale className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-semibold text-blue-100">AI Dispute Resolution</h1>
                    <p className="text-sm text-blue-300 mt-1">Secure Access Portal</p>
                </div>

                {/* Reset Password Card */}
                <div className="bg-slate-800/70 backdrop-blur-xl rounded-xl shadow-2xl border border-blue-800 p-8">
                    {/* Card Header */}
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold text-blue-100 mb-1">
                            Forgot Password?
                        </h2>
                        <p className="text-sm text-blue-300">
                            Enter your email to receive password reset instructions
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-blue-200 mb-1.5">
                                Email Address
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-2.5 border border-blue-700 rounded-lg text-blue-100 placeholder-blue-500 bg-slate-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                placeholder="Enter your email"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <Send className="w-5 h-5" />
                                    Send Reset Link
                                </>
                            )}
                        </button>

                        <div className="pt-4 border-t border-blue-800 text-center">
                            <Link
                                to="/login"
                                className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back to Login
                            </Link>
                        </div>
                    </form>
                </div>

                {/* Security Notice */}
                <div className="mt-6 flex items-start gap-3 bg-blue-950/30 rounded-lg p-4 border border-blue-800">
                    <Lock className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-blue-300 leading-relaxed">
                        For security, we'll send a reset link to your registered email. The link expires in 1 hour.
                    </p>
                </div>
            </div>
        </div>
    );
}
