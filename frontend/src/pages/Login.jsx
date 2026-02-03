import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api, { resendVerificationEmail } from '../api';
import { Eye, EyeOff, Scale, Shield, Lock, Mail, CheckCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Login() {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({ username: '', email: '', password: '', role: 'User' });
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [registrationSuccess, setRegistrationSuccess] = useState(false);
    const [registeredEmail, setRegisteredEmail] = useState('');
    const [resending, setResending] = useState(false);
    const [sessionExpiredMessage, setSessionExpiredMessage] = useState('');
    const [verificationRequired, setVerificationRequired] = useState(false);

    // Check for session expired message on mount
    useEffect(() => {
        const message = sessionStorage.getItem('sessionExpiredMessage');
        if (message) {
            setSessionExpiredMessage(message);
            toast.error(message);
            sessionStorage.removeItem('sessionExpiredMessage');
        }
    }, []);

    const handleResendVerification = async () => {
        if (!registeredEmail) return;
        
        try {
            setResending(true);
            await resendVerificationEmail(registeredEmail);
            toast.success('Verification email sent! Check your inbox.');
        } catch (err) {
            toast.error('Failed to resend verification email');
        } finally {
            setResending(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSessionExpiredMessage(''); // Clear any session message
        setVerificationRequired(false);
        try {
            const endpoint = isLogin ? '/auth/login' : '/auth/register';
            const res = await api.post(endpoint, formData);

            if (isLogin) {
                localStorage.setItem('token', res.data.token);
                localStorage.setItem('role', res.data.role);
                localStorage.setItem('username', res.data.username);
                localStorage.setItem('userEmail', res.data.email);

                // Redirect to Dashboard
                navigate('/dashboard');
                window.location.reload();
            } else {
                // Show email verification message
                setRegistrationSuccess(true);
                setRegisteredEmail(formData.email);
                toast.success('Registration successful! Please check your email to verify your account.');
            }
        } catch (err) {
            console.error('Login error:', err);
            if (err.response) {
                // Server responded with an error status code
                const data = err.response.data;
                if (data?.requiresEmailVerification) {
                    setVerificationRequired(true);
                    setRegisteredEmail(data?.email || '');
                    setError('');
                    toast.error('Please verify your email before logging in.');
                } else {
                    setError(data?.error || `Server Error: ${err.response.status}`);
                }
            } else if (err.request) {
                // Request was made but no response received (Network Error)
                setError('Network Error: Unable to reach server. Check IP configuration.');
            } else {
                // Something else happened
                setError(err.message || 'An error occurred');
            }
        }
    };

    // Show registration success message
    if (registrationSuccess) {
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
                            <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-xl bg-green-900/30 mb-4">
                                <Mail className="h-8 w-8 text-green-400" />
                            </div>
                            <h2 className="text-xl font-semibold text-blue-100 mb-2">
                                Check Your Email
                            </h2>
                            <p className="text-sm text-blue-300 mb-6">
                                We've sent a verification link to <strong className="text-blue-200">{registeredEmail}</strong>
                            </p>
                            
                            <div className="bg-blue-950/50 border border-blue-800 p-4 mb-6 text-left rounded-lg">
                                <p className="text-sm font-medium text-blue-200 mb-2">Next Steps:</p>
                                <ul className="text-sm text-blue-300 space-y-1.5">
                                    <li className="flex items-start gap-2">
                                        <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                                        <span>Open the email we just sent you</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                                        <span>Click the verification link</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                                        <span>Return here to log in</span>
                                    </li>
                                </ul>
                            </div>
                            
                            <div className="space-y-3">
                                <button
                                    onClick={() => {
                                        setRegistrationSuccess(false);
                                        setIsLogin(true);
                                        setFormData({ username: '', email: '', password: '', role: 'User' });
                                    }}
                                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-colors text-sm font-medium"
                                >
                                    Continue to Login
                                </button>
                                
                                <button
                                    onClick={handleResendVerification}
                                    disabled={resending}
                                    className="w-full py-2.5 px-4 border border-blue-700 rounded-lg text-blue-300 hover:bg-slate-700/50 transition-colors text-sm font-medium disabled:opacity-50"
                                >
                                    {resending ? 'Sending...' : "Didn't receive email? Resend"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Show email verification required message
    if (verificationRequired) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 py-8 px-4 sm:px-6 lg:px-8">
                <div className="w-full max-w-md">
                    {/* Brand Header */}
                    <div className="text-center mb-6">
                        <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-lg mb-3">
                            <Scale className="w-7 h-7 text-white" />
                        </div>
                        <h1 className="text-2xl font-semibold text-blue-100">AI Dispute Resolution</h1>
                        <p className="text-sm text-blue-300 mt-1">Email Verification Required</p>
                    </div>

                    {/* Verification Required Card */}
                    <div className="bg-slate-800/70 backdrop-blur-xl rounded-xl shadow-2xl border border-blue-800 p-8">
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-xl bg-yellow-900/30 mb-4">
                                <AlertCircle className="h-8 w-8 text-yellow-400" />
                            </div>
                            <h2 className="text-xl font-semibold text-yellow-100 mb-2">
                                Verify Your Email to Continue
                            </h2>
                            <p className="text-sm text-blue-300 mb-6">
                                We found your account, but your email is not verified yet.
                            </p>

                            {registeredEmail && (
                                <div className="bg-blue-950/50 border border-blue-800 p-4 mb-6 text-left rounded-lg">
                                    <p className="text-sm font-medium text-blue-200 mb-2">Verification Email:</p>
                                    <p className="text-sm text-blue-300">
                                        <span className="font-semibold text-blue-200">{registeredEmail}</span>
                                    </p>
                                </div>
                            )}

                            <div className="space-y-3">
                                <button
                                    onClick={handleResendVerification}
                                    disabled={resending || !registeredEmail}
                                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-colors text-sm font-medium disabled:opacity-50"
                                >
                                    {resending ? 'Sending...' : 'Resend Verification Email'}
                                </button>

                                <button
                                    onClick={() => {
                                        setVerificationRequired(false);
                                        setIsLogin(true);
                                        setFormData({ username: '', email: '', password: '', role: 'User' });
                                    }}
                                    className="w-full py-2.5 px-4 border border-blue-700 rounded-lg text-blue-300 hover:bg-slate-700/50 transition-colors text-sm font-medium"
                                >
                                    Back to Login
                                </button>
                            </div>
                        </div>
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

                {/* Login Card */}
                <div className="bg-slate-800/70 backdrop-blur-xl rounded-xl shadow-2xl border border-blue-800 p-8">
                    {/* Card Header */}
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold text-blue-100 mb-1">
                            {isLogin ? 'Sign in to your account' : 'Create new account'}
                        </h2>
                        <p className="text-sm text-blue-300">
                            {isLogin ? 'Access your dispute resolution dashboard' : 'Join the dispute resolution platform'}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Username Field */}
                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-blue-200 mb-1.5">
                                Username
                            </label>
                            <input
                                id="username"
                                type="text"
                                required
                                className="w-full px-4 py-2.5 border border-blue-700 rounded-lg text-blue-100 placeholder-blue-500 bg-slate-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                placeholder="Enter your username"
                                value={formData.username}
                                onChange={e => setFormData({ ...formData, username: e.target.value })}
                            />
                        </div>

                        {/* Email Field (Registration only) */}
                        {!isLogin && (
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-blue-200 mb-1.5">
                                    Email Address
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    className="w-full px-4 py-2.5 border border-blue-700 rounded-lg text-blue-100 placeholder-blue-500 bg-slate-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    placeholder="Enter your email"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                        )}

                        {/* Password Field */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-blue-200 mb-1.5">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    required
                                    className="w-full px-4 py-2.5 pr-11 border border-blue-700 rounded-lg text-blue-100 placeholder-blue-500 bg-slate-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    placeholder="Enter your password"
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                />
                                <button
                                    type="button"
                                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-blue-400 hover:text-blue-300 transition-colors"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-5 w-5" />
                                    ) : (
                                        <Eye className="h-5 w-5" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Session Expired Message */}
                        {sessionExpiredMessage && (
                            <div className="bg-yellow-950/50 border border-yellow-700 rounded-lg p-3 text-sm text-yellow-300 flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                <span>{sessionExpiredMessage}</span>
                            </div>
                        )}

                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-950/50 border border-red-800 rounded-lg p-3 text-sm text-red-300">
                                {error}
                            </div>
                        )}

                        {/* Forgot Password Link */}
                        {isLogin && (
                            <div className="flex justify-end">
                                <Link
                                    to="/forgot-password"
                                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    Forgot password?
                                </Link>
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 transition-all shadow-md"
                        >
                            {isLogin ? 'Sign In' : 'Create Account'}
                        </button>
                    </form>

                    {/* Toggle Sign In/Sign Up */}
                    <div className="mt-6 pt-6 border-t border-blue-800 text-center">
                        <button
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
                        >
                            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                        </button>
                    </div>
                </div>

                {/* Security Notice */}
                <div className="mt-6 flex items-start gap-3 bg-blue-950/30 rounded-lg p-4 border border-blue-800">
                    <Lock className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-blue-300 leading-relaxed">
                        Your connection is secure and encrypted. All data is protected under strict confidentiality protocols 
                        in compliance with data protection regulations.
                    </p>
                </div>
            </div>
        </div>
    );
}
