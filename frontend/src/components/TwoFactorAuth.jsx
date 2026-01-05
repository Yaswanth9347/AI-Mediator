import { useState } from 'react';
import { Shield, Lock, Key, AlertCircle, CheckCircle, Copy, Loader2, Eye, EyeOff } from 'lucide-react';
import { enable2FA, verify2FA, disable2FA } from '../api';
import toast from 'react-hot-toast';

export default function TwoFactorAuth({ user, onUpdate }) {
    const [loading, setLoading] = useState(false);
    const [setupMode, setSetupMode] = useState(false);
    const [secret, setSecret] = useState('');
    const [backupCodes, setBackupCodes] = useState([]);
    const [verificationCode, setVerificationCode] = useState('');
    const [disablePassword, setDisablePassword] = useState('');
    const [showBackupCodes, setShowBackupCodes] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleEnable2FA = async () => {
        try {
            setLoading(true);
            const response = await enable2FA();
            setSecret(response.data.secret);
            setBackupCodes(response.data.backupCodes);
            setSetupMode(true);
            setShowBackupCodes(false);
            toast.success('2FA setup initiated. Please verify to enable.');
        } catch (error) {
            console.error('Enable 2FA error:', error);
            toast.error(error.response?.data?.error || 'Failed to enable 2FA');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify2FA = async (e) => {
        e.preventDefault();
        
        if (!verificationCode || verificationCode.length !== 6) {
            toast.error('Please enter a valid 6-digit code');
            return;
        }

        try {
            setLoading(true);
            await verify2FA(verificationCode);
            toast.success('2FA enabled successfully!');
            setSetupMode(false);
            setVerificationCode('');
            onUpdate && onUpdate({ twoFactorEnabled: true });
        } catch (error) {
            console.error('Verify 2FA error:', error);
            toast.error(error.response?.data?.error || 'Invalid verification code');
        } finally {
            setLoading(false);
        }
    };

    const handleDisable2FA = async (e) => {
        e.preventDefault();

        if (!disablePassword) {
            toast.error('Please enter your password');
            return;
        }

        try {
            setLoading(true);
            await disable2FA(disablePassword);
            toast.success('2FA disabled successfully');
            setDisablePassword('');
            onUpdate && onUpdate({ twoFactorEnabled: false });
        } catch (error) {
            console.error('Disable 2FA error:', error);
            toast.error(error.response?.data?.error || 'Failed to disable 2FA');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard!');
    };

    if (setupMode) {
        return (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 space-y-6">
                <div className="flex items-center gap-3">
                    <Shield className="w-6 h-6 text-blue-400" />
                    <div>
                        <h3 className="text-lg font-semibold text-white">
                            Setup Two-Factor Authentication
                        </h3>
                        <p className="text-sm text-gray-400">
                            Secure your account with an additional layer of protection
                        </p>
                    </div>
                </div>

                {/* Step 1: Save Backup Codes */}
                <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-white flex items-center gap-2">
                            <Key className="w-5 h-5 text-yellow-400" />
                            Step 1: Save Backup Codes
                        </h4>
                        <button
                            onClick={() => setShowBackupCodes(!showBackupCodes)}
                            className="text-sm text-blue-400 hover:text-blue-300"
                        >
                            {showBackupCodes ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    
                    <p className="text-sm text-gray-400 mb-3">
                        Save these backup codes in a safe place. You can use them to access your account if you lose your authentication device.
                    </p>

                    {showBackupCodes && (
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            {backupCodes.map((code, index) => (
                                <div
                                    key={index}
                                    className="bg-gray-800 border border-gray-700 rounded px-3 py-2 font-mono text-sm text-gray-300 flex items-center justify-between"
                                >
                                    <span>{code}</span>
                                    <button
                                        onClick={() => copyToClipboard(code)}
                                        className="text-blue-400 hover:text-blue-300"
                                    >
                                        <Copy className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <button
                        onClick={() => copyToClipboard(backupCodes.join('\n'))}
                        className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                        <Copy className="w-4 h-4" />
                        Copy All Codes
                    </button>
                </div>

                {/* Step 2: Setup Authenticator App */}
                <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                    <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-blue-400" />
                        Step 2: Setup Authenticator App
                    </h4>
                    
                    <p className="text-sm text-gray-400 mb-3">
                        Use an authenticator app like Google Authenticator, Authy, or Microsoft Authenticator.
                    </p>

                    <div className="bg-gray-800 border border-gray-700 rounded p-3 mb-3">
                        <p className="text-xs text-gray-500 mb-1">Secret Key:</p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 font-mono text-sm text-gray-300 break-all">
                                {secret}
                            </code>
                            <button
                                onClick={() => copyToClipboard(secret)}
                                className="text-blue-400 hover:text-blue-300 flex-shrink-0"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3 text-sm text-blue-300">
                        <AlertCircle className="w-4 h-4 inline mr-2" />
                        Note: In production, a QR code would be displayed here for easy setup
                    </div>
                </div>

                {/* Step 3: Verify */}
                <form onSubmit={handleVerify2FA} className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                    <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        Step 3: Verify Setup
                    </h4>
                    
                    <p className="text-sm text-gray-400 mb-3">
                        Enter the 6-digit code from your authenticator app to complete setup.
                    </p>

                    <input
                        type="text"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength="6"
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                    />

                    <div className="flex gap-3">
                        <button
                            type="submit"
                            disabled={loading || verificationCode.length !== 6}
                            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Verifying...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-5 h-5" />
                                    Enable 2FA
                                </>
                            )}
                        </button>
                        
                        <button
                            type="button"
                            onClick={() => setSetupMode(false)}
                            disabled={loading}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-lg font-medium transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    if (user?.twoFactorEnabled) {
        return (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-green-600 p-3 rounded-lg">
                            <Shield className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                Two-Factor Authentication
                                <span className="bg-green-600 text-white text-xs px-2 py-1 rounded-full">
                                    Enabled
                                </span>
                            </h3>
                            <p className="text-sm text-gray-400 mt-1">
                                Your account is protected with 2FA
                            </p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleDisable2FA} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Enter Password to Disable 2FA
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={disablePassword}
                                onChange={(e) => setDisablePassword(e.target.value)}
                                placeholder="Enter your password"
                                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !disablePassword}
                        className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Disabling...
                            </>
                        ) : (
                            <>
                                <Lock className="w-5 h-5" />
                                Disable 2FA
                            </>
                        )}
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="bg-gray-700 p-3 rounded-lg">
                        <Shield className="w-6 h-6 text-gray-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            Two-Factor Authentication
                            <span className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded-full">
                                Disabled
                            </span>
                        </h3>
                        <p className="text-sm text-gray-400 mt-1">
                            Add an extra layer of security to your account
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-yellow-300">
                        <p className="font-semibold mb-1">Why enable 2FA?</p>
                        <ul className="space-y-1 text-yellow-300/80">
                            <li>• Protects your account even if your password is compromised</li>
                            <li>• Required for high-value transactions and sensitive operations</li>
                            <li>• Industry standard for legal and financial platforms</li>
                        </ul>
                    </div>
                </div>
            </div>

            <button
                onClick={handleEnable2FA}
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
            >
                {loading ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Setting up...
                    </>
                ) : (
                    <>
                        <Shield className="w-5 h-5" />
                        Enable Two-Factor Authentication
                    </>
                )}
            </button>
        </div>
    );
}
