import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { resetPassword } from '../api';
import toast from 'react-hot-toast';
import { Lock, Eye, EyeOff, CheckCircle, AlertTriangle, ArrowLeft, Scale } from 'lucide-react';

export default function ResetPassword() {
    const { token } = useParams();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        newPassword: '',
        confirmPassword: ''
    });
    const [loading, setLoading] = useState(false);
    const [showPasswords, setShowPasswords] = useState({
        new: false,
        confirm: false
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.newPassword || !formData.confirmPassword) {
            toast.error('Please fill in all fields');
            return;
        }

        if (formData.newPassword.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }

        if (formData.newPassword !== formData.confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        try {
            setLoading(true);
            const res = await resetPassword(token, formData.newPassword);
            toast.success(res.data.message);
            setTimeout(() => {
                navigate('/login');
            }, 2000);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to reset password');
        } finally {
            setLoading(false);
        }
    };

    const passwordsMatch = formData.newPassword && formData.confirmPassword && 
                          formData.newPassword === formData.confirmPassword;
    const passwordsDontMatch = formData.newPassword && formData.confirmPassword && 
                               formData.newPassword !== formData.confirmPassword;

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
                            Reset Password
                        </h2>
                        <p className="text-sm text-blue-300">
                            Create a strong new password for your account
                        </p>
                    </div>

                    {/* Security Tips */}
                    <div className="mb-6 bg-blue-950/50 border border-blue-800 p-4 rounded-lg">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-blue-300">
                                <p className="font-medium text-blue-200 mb-2">Password Requirements:</p>
                                <ul className="space-y-1">
                                    <li className="flex items-start gap-2">
                                        <span className="text-blue-500 mt-0.5">•</span>
                                        <span>At least 6 characters long</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-blue-500 mt-0.5">•</span>
                                        <span>Mix of uppercase and lowercase letters</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-blue-500 mt-0.5">•</span>
                                        <span>Include numbers and symbols</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* New Password */}
                        <div>
                            <label htmlFor="newPassword" className="block text-sm font-medium text-blue-200 mb-1.5">
                                New Password
                            </label>
                            <div className="relative">
                                <input
                                    id="newPassword"
                                    name="newPassword"
                                    type={showPasswords.new ? 'text' : 'password'}
                                    required
                                    minLength={6}
                                    value={formData.newPassword}
                                    onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                                    className="w-full px-4 py-2.5 pr-11 border border-blue-700 rounded-lg text-blue-100 placeholder-blue-500 bg-slate-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    placeholder="Enter new password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    {showPasswords.new ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        {/* Confirm Password */}
                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-blue-200 mb-1.5">
                                Confirm Password
                            </label>
                            <div className="relative">
                                <input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type={showPasswords.confirm ? 'text' : 'password'}
                                    required
                                    value={formData.confirmPassword}
                                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    className="w-full px-4 py-2.5 pr-11 border border-blue-700 rounded-lg text-blue-100 placeholder-blue-500 bg-slate-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    placeholder="Confirm new password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    {showPasswords.confirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        {/* Password Match Indicator */}
                        {passwordsMatch && (
                            <div className="flex items-center gap-2 text-sm text-green-400">
                                <CheckCircle className="w-4 h-4" />
                                Passwords match
                            </div>
                        )}
                        {passwordsDontMatch && (
                            <div className="flex items-center gap-2 text-sm text-red-400">
                                <AlertTriangle className="w-4 h-4" />
                                Passwords do not match
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !passwordsMatch}
                            className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    Resetting...
                                </>
                            ) : (
                                <>
                                    <Lock className="w-5 h-5" />
                                    Reset Password
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
                        Your connection is secure and encrypted. All data is protected under strict confidentiality protocols.
                    </p>
                </div>
            </div>
        </div>
    );
}
