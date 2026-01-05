import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { Eye, EyeOff, Scale, Shield, Lock } from 'lucide-react';

export default function Login() {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({ username: '', email: '', password: '', role: 'User' });
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
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
                alert('Registration Successful! Please login.');
                setIsLogin(true);
            }
        } catch (err) {
            console.error('Login error:', err);
            if (err.response) {
                // Server responded with an error status code
                setError(err.response.data?.error || `Server Error: ${err.response.status}`);
            } else if (err.request) {
                // Request was made but no response received (Network Error)
                setError('Network Error: Unable to reach server. Check IP configuration.');
            } else {
                // Something else happened
                setError(err.message || 'An error occurred');
            }
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
