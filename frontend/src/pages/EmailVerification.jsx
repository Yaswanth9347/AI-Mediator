import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { verifyEmail, resendVerificationEmail } from '../api';
import toast from 'react-hot-toast';
import { 
    CheckCircle, 
    XCircle, 
    Loader2, 
    Mail, 
    ArrowLeft, 
    Scale, 
    RefreshCw,
    AlertTriangle
} from 'lucide-react';

export default function EmailVerification() {
    const { token } = useParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('verifying'); // verifying, success, error, expired
    const [message, setMessage] = useState('');
    const [resendEmail, setResendEmail] = useState('');
    const [resending, setResending] = useState(false);

    useEffect(() => {
        if (token) {
            verifyEmailToken();
        }
    }, [token]);

    const verifyEmailToken = async () => {
        try {
            setStatus('verifying');
            const res = await verifyEmail(token);
            setStatus('success');
            setMessage(res.data.message);
            toast.success('Email verified successfully!');
            
            // Redirect to login after 3 seconds
            setTimeout(() => {
                navigate('/login');
            }, 3000);
        } catch (error) {
            const errorMessage = error.response?.data?.error || 'Verification failed';
            setMessage(errorMessage);
            
            if (errorMessage.toLowerCase().includes('expired')) {
                setStatus('expired');
            } else {
                setStatus('error');
            }
            toast.error(errorMessage);
        }
    };

    const handleResendVerification = async (e) => {
        e.preventDefault();
        
        if (!resendEmail) {
            toast.error('Please enter your email address');
            return;
        }

        try {
            setResending(true);
            const res = await resendVerificationEmail(resendEmail);
            toast.success(res.data.message || 'Verification email sent!');
            setResendEmail('');
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to resend verification email');
        } finally {
            setResending(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 py-8 px-4 sm:px-6 lg:px-8">
            <div className="w-full max-w-md">
                {/* Brand Header */}
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-lg mb-3">
                        <Scale className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-semibold text-blue-100">AI Dispute Resolution</h1>
                    <p className="text-sm text-blue-300 mt-1">Email Verification</p>
                </div>

                {/* Verification Card */}
                <div className="bg-slate-800/70 backdrop-blur-xl rounded-xl shadow-2xl border border-blue-800 p-8">
                    
                    {/* Verifying State */}
                    {status === 'verifying' && (
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-xl bg-blue-900/30 mb-4">
                                <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
                            </div>
                            <h2 className="text-xl font-semibold text-blue-100 mb-2">
                                Verifying Your Email
                            </h2>
                            <p className="text-sm text-blue-300">
                                Please wait while we verify your email address...
                            </p>
                        </div>
                    )}

                    {/* Success State */}
                    {status === 'success' && (
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-xl bg-green-900/30 mb-4">
                                <CheckCircle className="h-8 w-8 text-green-400" />
                            </div>
                            <h2 className="text-xl font-semibold text-green-100 mb-2">
                                Email Verified!
                            </h2>
                            <p className="text-sm text-blue-300 mb-6">
                                {message || 'Your email has been successfully verified.'}
                            </p>
                            
                            <div className="bg-green-900/20 border border-green-700/50 p-4 mb-6 rounded-lg">
                                <p className="text-sm text-green-300">
                                    🎉 You can now log in and access all platform features. Redirecting to login...
                                </p>
                            </div>
                            
                            <Link
                                to="/login"
                                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-green-600 hover:bg-green-500 rounded-lg text-white transition-colors text-sm font-medium"
                            >
                                Go to Login
                            </Link>
                        </div>
                    )}

                    {/* Error State */}
                    {status === 'error' && (
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-xl bg-red-900/30 mb-4">
                                <XCircle className="h-8 w-8 text-red-400" />
                            </div>
                            <h2 className="text-xl font-semibold text-red-100 mb-2">
                                Verification Failed
                            </h2>
                            <p className="text-sm text-blue-300 mb-6">
                                {message || 'We could not verify your email address.'}
                            </p>
                            
                            <div className="bg-red-900/20 border border-red-700/50 p-4 mb-6 rounded-lg text-left">
                                <p className="text-sm text-red-300 font-medium mb-2">Possible reasons:</p>
                                <ul className="text-sm text-red-200 space-y-1">
                                    <li>• The verification link is invalid</li>
                                    <li>• The link has already been used</li>
                                    <li>• There was a technical issue</li>
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
                    )}

                    {/* Expired State */}
                    {status === 'expired' && (
                        <div>
                            <div className="text-center mb-6">
                                <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-xl bg-yellow-900/30 mb-4">
                                    <AlertTriangle className="h-8 w-8 text-yellow-400" />
                                </div>
                                <h2 className="text-xl font-semibold text-yellow-100 mb-2">
                                    Link Expired
                                </h2>
                                <p className="text-sm text-blue-300">
                                    Your verification link has expired. Request a new one below.
                                </p>
                            </div>
                            
                            {/* Resend Form */}
                            <form onSubmit={handleResendVerification} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-blue-200 mb-1">
                                        Email Address
                                    </label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-blue-500" />
                                        <input
                                            type="email"
                                            value={resendEmail}
                                            onChange={(e) => setResendEmail(e.target.value)}
                                            placeholder="Enter your email"
                                            className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-blue-800 rounded-lg text-blue-100 placeholder-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            required
                                        />
                                    </div>
                                </div>
                                
                                <button
                                    type="submit"
                                    disabled={resending}
                                    className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-white transition-colors text-sm font-medium"
                                >
                                    {resending ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Sending...
                                        </>
                                    ) : (
                                        <>
                                            <RefreshCw className="w-4 h-4" />
                                            Resend Verification Email
                                        </>
                                    )}
                                </button>
                            </form>
                            
                            <div className="mt-6 pt-6 border-t border-blue-800/50">
                                <Link
                                    to="/login"
                                    className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-blue-700 rounded-lg text-blue-300 hover:bg-slate-700/50 transition-colors text-sm font-medium"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    Back to Login
                                </Link>
                            </div>
                        </div>
                    )}
                </div>

                {/* Help Text */}
                <div className="mt-6 text-center">
                    <p className="text-sm text-blue-400">
                        Having trouble?{' '}
                        <a href="mailto:support@aidispute.com" className="text-blue-300 hover:text-blue-200 underline">
                            Contact Support
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
