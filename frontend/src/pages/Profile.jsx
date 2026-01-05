import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { 
    getUserProfile, updateUserProfile, changePassword, 
    getNotificationPreferences, updateNotificationPreferences,
    getActiveSessions, revokeSession, exportUserData, deleteAccount,
    getMyDisputes
} from '../api';
import { 
    User, Mail, Lock, Save, Eye, EyeOff, CheckCircle, ShieldCheck, AlertTriangle,
    Bell, BellOff, Download, Trash2, Monitor, Smartphone, LogOut, Clock, 
    FileText, Scale, Activity, Settings, ChevronRight, Shield, Key,
    AlertCircle, Globe, Calendar, MapPin, Briefcase, Phone, X, Loader2, Camera, BarChart3
} from 'lucide-react';
import ProfilePictureUpload from '../components/ProfilePictureUpload';
import ActivityLog from '../components/ActivityLog';
import TwoFactorAuth from '../components/TwoFactorAuth';
import PrivacySettings from '../components/PrivacySettings';
import AccountStatistics from '../components/AccountStatistics';

export default function Profile() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [user, setUser] = useState(null);
    const [activeTab, setActiveTab] = useState('profile');
    const [disputes, setDisputes] = useState([]);
    
    // Profile form state
    const [profileForm, setProfileForm] = useState({
        username: '',
        email: '',
        phone: '',
        address: '',
        occupation: ''
    });
    
    // Password form state
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    
    const [showPasswords, setShowPasswords] = useState({
        current: false,
        new: false,
        confirm: false
    });

    // Notification preferences state
    const [notificationPrefs, setNotificationPrefs] = useState({
        emailNotifications: true,
        inAppNotifications: true,
        newDispute: true,
        caseAccepted: true,
        newMessage: true,
        aiAnalysisComplete: true,
        solutionVotes: true,
        caseResolved: true,
        courtForwarding: true,
        evidenceUploaded: true,
        signatureRequired: true,
        systemAlerts: true
    });

    // Sessions state
    const [sessions, setSessions] = useState([]);
    const [loadingSessions, setLoadingSessions] = useState(false);

    // Modal states
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        fetchProfile();
        fetchDisputes();
    }, []);

    useEffect(() => {
        if (activeTab === 'sessions') {
            fetchSessions();
        }
    }, [activeTab]);

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const res = await getUserProfile();
            setUser(res.data);
            setProfileForm({
                username: res.data.username || '',
                email: res.data.email || '',
                phone: res.data.phone || '',
                address: res.data.address || '',
                occupation: res.data.occupation || ''
            });
            
            // Fetch notification preferences
            try {
                const prefsRes = await getNotificationPreferences();
                if (prefsRes.data) {
                    setNotificationPrefs(prev => ({ ...prev, ...prefsRes.data }));
                }
            } catch (err) {
                // Notification preferences might not exist yet
                console.log('Using default notification preferences');
            }
        } catch (error) {
            toast.error('Failed to load profile');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchDisputes = async () => {
        try {
            const res = await getMyDisputes();
            setDisputes(res.data?.disputes || []);
        } catch (error) {
            console.error('Failed to fetch disputes:', error);
        }
    };

    const fetchSessions = async () => {
        try {
            setLoadingSessions(true);
            const res = await getActiveSessions();
            setSessions(res.data?.sessions || []);
        } catch (error) {
            console.error('Failed to fetch sessions:', error);
            // Mock sessions for now
            setSessions([
                {
                    id: 'current',
                    device: 'Current Session',
                    browser: navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Other',
                    location: 'Current Location',
                    lastActive: new Date().toISOString(),
                    isCurrent: true
                }
            ]);
        } finally {
            setLoadingSessions(false);
        }
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        
        if (!profileForm.username.trim()) {
            toast.error('Username is required');
            return;
        }

        try {
            setSaving(true);
            const res = await updateUserProfile(profileForm);
            setUser(res.data.user);
            localStorage.setItem('username', res.data.user.username);
            toast.success('Profile updated successfully!');
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        
        if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
            toast.error('All password fields are required');
            return;
        }

        if (passwordForm.newPassword.length < 6) {
            toast.error('New password must be at least 6 characters');
            return;
        }

        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }

        try {
            setSaving(true);
            await changePassword({
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword
            });
            toast.success('Password changed successfully!');
            setPasswordForm({
                currentPassword: '',
                newPassword: '',
                confirmPassword: ''
            });
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to change password');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateNotifications = async () => {
        try {
            setSaving(true);
            await updateNotificationPreferences(notificationPrefs);
            toast.success('Notification preferences saved!');
        } catch (error) {
            toast.error('Failed to update preferences');
        } finally {
            setSaving(false);
        }
    };

    const handleExportData = async () => {
        try {
            setExporting(true);
            const res = await exportUserData();
            
            // Create download link
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `my-data-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            
            toast.success('Data exported successfully!');
        } catch (error) {
            toast.error('Failed to export data');
        } finally {
            setExporting(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (deleteConfirmText !== 'DELETE') {
            toast.error('Please type DELETE to confirm');
            return;
        }

        try {
            setDeleting(true);
            await deleteAccount();
            localStorage.clear();
            toast.success('Account deleted successfully');
            navigate('/');
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to delete account');
        } finally {
            setDeleting(false);
        }
    };

    const handleRevokeSession = async (sessionId) => {
        try {
            await revokeSession(sessionId);
            setSessions(sessions.filter(s => s.id !== sessionId));
            toast.success('Session revoked successfully');
        } catch (error) {
            toast.error('Failed to revoke session');
        }
    };

    const getPasswordStrength = (password) => {
        if (!password) return { strength: 0, label: '', color: '' };
        let strength = 0;
        if (password.length >= 6) strength += 1;
        if (password.length >= 8) strength += 1;
        if (/[A-Z]/.test(password)) strength += 1;
        if (/[a-z]/.test(password)) strength += 1;
        if (/[0-9]/.test(password)) strength += 1;
        if (/[^A-Za-z0-9]/.test(password)) strength += 1;
        
        if (strength <= 2) return { strength: 33, label: 'Weak', color: 'bg-red-500' };
        if (strength <= 4) return { strength: 66, label: 'Medium', color: 'bg-yellow-500' };
        return { strength: 100, label: 'Strong', color: 'bg-green-500' };
    };

    const passwordStrength = getPasswordStrength(passwordForm.newPassword);

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
                    <p className="text-gray-400">Loading profile...</p>
                </div>
            </div>
        );
    }

    // Stats calculation
    const stats = {
        totalDisputes: disputes.length,
        resolved: disputes.filter(d => d.status === 'Resolved').length,
        active: disputes.filter(d => ['Pending', 'Active', 'AwaitingDecision'].includes(d.status)).length,
        asPlaintiff: disputes.filter(d => d.plaintiffEmail === user?.email).length,
        asDefendant: disputes.filter(d => d.respondentEmail === user?.email).length
    };

    const tabs = [
        { id: 'profile', label: 'Profile', icon: User },
        { id: 'security', label: 'Security & 2FA', icon: Shield },
        { id: 'privacy', label: 'Privacy', icon: Lock },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'activity', label: 'Activity Log', icon: Activity },
        { id: 'statistics', label: 'Statistics', icon: BarChart3 },
        { id: 'sessions', label: 'Sessions', icon: Monitor },
        { id: 'data', label: 'Data & Export', icon: Download }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            {/* Header */}
            <div className="bg-gray-800/50 border-b border-gray-700/50">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                        {/* User Info */}
                        <div className="flex items-center gap-6">
                            <div className="relative">
                                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-indigo-500/30">
                                    {user?.username?.charAt(0).toUpperCase() || 'U'}
                                </div>
                                {user?.isVerified && (
                                    <div className="absolute -bottom-2 -right-2 bg-green-500 rounded-full p-1.5 shadow-lg">
                                        <CheckCircle className="w-4 h-4 text-white" />
                                    </div>
                                )}
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-white">{user?.username}</h1>
                                <p className="text-gray-400">{user?.email}</p>
                                <div className="flex items-center gap-3 mt-2">
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                        user?.role === 'Admin' 
                                            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' 
                                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                    }`}>
                                        {user?.role}
                                    </span>
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                        user?.isVerified 
                                            ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                                            : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                    }`}>
                                        {user?.isVerified ? '✓ Verified' : 'Unverified'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Quick Stats */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-gray-700/30 rounded-xl px-4 py-3 text-center border border-gray-600/30">
                                <div className="text-2xl font-bold text-white">{stats.totalDisputes}</div>
                                <div className="text-xs text-gray-400">Total Cases</div>
                            </div>
                            <div className="bg-gray-700/30 rounded-xl px-4 py-3 text-center border border-gray-600/30">
                                <div className="text-2xl font-bold text-green-400">{stats.resolved}</div>
                                <div className="text-xs text-gray-400">Resolved</div>
                            </div>
                            <div className="bg-gray-700/30 rounded-xl px-4 py-3 text-center border border-gray-600/30">
                                <div className="text-2xl font-bold text-yellow-400">{stats.active}</div>
                                <div className="text-xs text-gray-400">Active</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Sidebar Navigation */}
                    <div className="lg:w-64 flex-shrink-0">
                        <nav className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
                            {tabs.map((tab) => {
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${
                                            activeTab === tab.id
                                                ? 'bg-indigo-500/20 text-indigo-400 border-l-4 border-indigo-500'
                                                : 'text-gray-400 hover:bg-gray-700/50 hover:text-white border-l-4 border-transparent'
                                        }`}
                                    >
                                        <Icon className="w-5 h-5" />
                                        <span className="font-medium">{tab.label}</span>
                                        <ChevronRight className={`w-4 h-4 ml-auto transition-transform ${
                                            activeTab === tab.id ? 'rotate-90' : ''
                                        }`} />
                                    </button>
                                );
                            })}
                        </nav>

                        {/* Activity Summary */}
                        <div className="mt-6 bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
                            <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                <Activity className="w-4 h-4" />
                                Case Activity
                            </h3>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">As Plaintiff</span>
                                    <span className="text-white font-medium">{stats.asPlaintiff}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">As Defendant</span>
                                    <span className="text-white font-medium">{stats.asDefendant}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Success Rate</span>
                                    <span className="text-green-400 font-medium">
                                        {stats.totalDisputes > 0 
                                            ? Math.round((stats.resolved / stats.totalDisputes) * 100) 
                                            : 0}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1 min-w-0">
                        {/* Profile Tab */}
                        {activeTab === 'profile' && (
                            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
                                <div className="px-6 py-5 border-b border-gray-700/50">
                                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                        <User className="w-5 h-5 text-indigo-400" />
                                        Profile Information
                                    </h2>
                                    <p className="mt-1 text-sm text-gray-400">Update your personal details and public profile</p>
                                </div>
                                
                                <form onSubmit={handleUpdateProfile} className="p-6 space-y-6">
                                    {/* Profile Picture Upload */}
                                    <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 p-5 rounded-xl border border-indigo-500/30">
                                        <ProfilePictureUpload 
                                            currentPicture={user?.profilePicture} 
                                            onUpdate={(newPath) => setUser({ ...user, profilePicture: newPath })}
                                        />
                                    </div>

                                    {/* Account Status Card */}
                                    <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 p-5 rounded-xl border border-indigo-500/30">
                                        <div className="flex items-start gap-4">
                                            <div className="p-3 bg-indigo-500/20 rounded-lg">
                                                <ShieldCheck className="w-6 h-6 text-indigo-400" />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-semibold text-white mb-2">Account Status</h3>
                                                <div className="grid grid-cols-2 gap-4 text-sm">
                                                    <div>
                                                        <span className="text-gray-400">Role:</span>
                                                        <span className="ml-2 text-white font-medium capitalize">{user?.role}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-400">Status:</span>
                                                        <span className={`ml-2 font-medium ${user?.isVerified ? 'text-green-400' : 'text-yellow-400'}`}>
                                                            {user?.isVerified ? 'Verified' : user?.verificationStatus || 'Unverified'}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-400">Member Since:</span>
                                                        <span className="ml-2 text-white">
                                                            {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-400">Last Updated:</span>
                                                        <span className="ml-2 text-white">
                                                            {user?.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : 'N/A'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Form Fields */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Username */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                                <User className="w-4 h-4 inline mr-2" />
                                                Username
                                            </label>
                                            <input
                                                type="text"
                                                value={profileForm.username}
                                                onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })}
                                                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white placeholder-gray-400"
                                                required
                                            />
                                        </div>

                                        {/* Email */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                                <Mail className="w-4 h-4 inline mr-2" />
                                                Email Address
                                            </label>
                                            <input
                                                type="email"
                                                value={profileForm.email}
                                                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                                                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white placeholder-gray-400"
                                            />
                                        </div>

                                        {/* Phone */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                                <Phone className="w-4 h-4 inline mr-2" />
                                                Phone Number
                                            </label>
                                            <input
                                                type="tel"
                                                value={profileForm.phone}
                                                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                                                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white placeholder-gray-400"
                                                placeholder="Optional"
                                            />
                                        </div>

                                        {/* Occupation */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                                <Briefcase className="w-4 h-4 inline mr-2" />
                                                Occupation
                                            </label>
                                            <input
                                                type="text"
                                                value={profileForm.occupation}
                                                onChange={(e) => setProfileForm({ ...profileForm, occupation: e.target.value })}
                                                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white placeholder-gray-400"
                                                placeholder="Optional"
                                            />
                                        </div>
                                    </div>

                                    {/* Address */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            <MapPin className="w-4 h-4 inline mr-2" />
                                            Address
                                        </label>
                                        <textarea
                                            value={profileForm.address}
                                            onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                                            rows={2}
                                            className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white placeholder-gray-400"
                                            placeholder="Optional"
                                        />
                                    </div>

                                    {/* Save Button */}
                                    <div className="flex justify-end pt-4 border-t border-gray-700/50">
                                        <button
                                            type="submit"
                                            disabled={saving}
                                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/25"
                                        >
                                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                            {saving ? 'Saving...' : 'Save Changes'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Security Tab */}
                        {activeTab === 'security' && (
                            <div className="space-y-6">
                                {/* Change Password Card */}
                                <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
                                    <div className="px-6 py-5 border-b border-gray-700/50">
                                        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                            <Key className="w-5 h-5 text-indigo-400" />
                                            Change Password
                                        </h2>
                                        <p className="mt-1 text-sm text-gray-400">Update your password to keep your account secure</p>
                                    </div>
                                    
                                    <form onSubmit={handleChangePassword} className="p-6 space-y-6">
                                        {/* Security Tip */}
                                        <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4">
                                            <div className="flex items-start gap-3">
                                                <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                                                <div className="text-sm text-blue-300">
                                                    <strong>Security Tip:</strong> Use a strong password with at least 8 characters, including uppercase, lowercase, numbers, and special characters.
                                                </div>
                                            </div>
                                        </div>

                                        {/* Current Password */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                                Current Password
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type={showPasswords.current ? 'text' : 'password'}
                                                    value={passwordForm.currentPassword}
                                                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                                    className="w-full px-4 py-3 pr-12 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white"
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                                >
                                                    {showPasswords.current ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                                </button>
                                            </div>
                                        </div>

                                        {/* New Password */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                                New Password
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type={showPasswords.new ? 'text' : 'password'}
                                                    value={passwordForm.newPassword}
                                                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                                    className="w-full px-4 py-3 pr-12 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white"
                                                    required
                                                    minLength={6}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                                >
                                                    {showPasswords.new ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                                </button>
                                            </div>
                                            {/* Password Strength Meter */}
                                            {passwordForm.newPassword && (
                                                <div className="mt-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                                                            <div 
                                                                className={`h-full ${passwordStrength.color} transition-all`}
                                                                style={{ width: `${passwordStrength.strength}%` }}
                                                            />
                                                        </div>
                                                        <span className={`text-xs font-medium ${
                                                            passwordStrength.color.includes('red') ? 'text-red-400' :
                                                            passwordStrength.color.includes('yellow') ? 'text-yellow-400' : 'text-green-400'
                                                        }`}>
                                                            {passwordStrength.label}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Confirm Password */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                                Confirm New Password
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type={showPasswords.confirm ? 'text' : 'password'}
                                                    value={passwordForm.confirmPassword}
                                                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                                    className="w-full px-4 py-3 pr-12 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white"
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                                >
                                                    {showPasswords.confirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                                </button>
                                            </div>
                                            {/* Password Match Indicator */}
                                            {passwordForm.newPassword && passwordForm.confirmPassword && (
                                                <div className={`mt-2 text-sm flex items-center gap-2 ${
                                                    passwordForm.newPassword === passwordForm.confirmPassword 
                                                        ? 'text-green-400' 
                                                        : 'text-red-400'
                                                }`}>
                                                    {passwordForm.newPassword === passwordForm.confirmPassword ? (
                                                        <><CheckCircle className="w-4 h-4" /> Passwords match</>
                                                    ) : (
                                                        <><AlertTriangle className="w-4 h-4" /> Passwords do not match</>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Change Password Button */}
                                        <div className="flex justify-end pt-4 border-t border-gray-700/50">
                                            <button
                                                type="submit"
                                                disabled={saving}
                                                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/25"
                                            >
                                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                                                {saving ? 'Changing...' : 'Change Password'}
                                            </button>
                                        </div>
                                    </form>
                                </div>

                                {/* Two-Factor Authentication */}
                                <TwoFactorAuth 
                                    user={user} 
                                    onUpdate={(updates) => setUser({ ...user, ...updates })}
                                />
                            </div>
                        )}

                        {/* Privacy Tab */}
                        {activeTab === 'privacy' && (
                            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden p-6">
                                <PrivacySettings 
                                    user={user} 
                                    onUpdate={(settings) => setUser({ ...user, ...settings })}
                                />
                            </div>
                        )}

                        {/* Activity Log Tab */}
                        {activeTab === 'activity' && (
                            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden p-6">
                                <ActivityLog />
                            </div>
                        )}

                        {/* Statistics Tab */}
                        {activeTab === 'statistics' && (
                            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden p-6">
                                <AccountStatistics />
                            </div>
                        )}

                        {/* Notifications Tab */}
                        {activeTab === 'notifications' && (
                            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
                                <div className="px-6 py-5 border-b border-gray-700/50">
                                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                        <Bell className="w-5 h-5 text-indigo-400" />
                                        Notification Preferences
                                    </h2>
                                    <p className="mt-1 text-sm text-gray-400">Choose how and when you want to be notified</p>
                                </div>
                                
                                <div className="p-6 space-y-6">
                                    {/* Master Toggles */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className={`p-4 rounded-xl border ${
                                            notificationPrefs.emailNotifications 
                                                ? 'bg-indigo-900/30 border-indigo-500/30' 
                                                : 'bg-gray-700/30 border-gray-600/30'
                                        }`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <Mail className={`w-5 h-5 ${notificationPrefs.emailNotifications ? 'text-indigo-400' : 'text-gray-400'}`} />
                                                    <div>
                                                        <h4 className="font-medium text-white">Email Notifications</h4>
                                                        <p className="text-xs text-gray-400">Receive updates via email</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setNotificationPrefs(prev => ({ ...prev, emailNotifications: !prev.emailNotifications }))}
                                                    className={`relative w-12 h-6 rounded-full transition-colors ${
                                                        notificationPrefs.emailNotifications ? 'bg-indigo-500' : 'bg-gray-600'
                                                    }`}
                                                >
                                                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                                        notificationPrefs.emailNotifications ? 'translate-x-6' : ''
                                                    }`} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className={`p-4 rounded-xl border ${
                                            notificationPrefs.inAppNotifications 
                                                ? 'bg-indigo-900/30 border-indigo-500/30' 
                                                : 'bg-gray-700/30 border-gray-600/30'
                                        }`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <Bell className={`w-5 h-5 ${notificationPrefs.inAppNotifications ? 'text-indigo-400' : 'text-gray-400'}`} />
                                                    <div>
                                                        <h4 className="font-medium text-white">In-App Notifications</h4>
                                                        <p className="text-xs text-gray-400">Real-time alerts in the app</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setNotificationPrefs(prev => ({ ...prev, inAppNotifications: !prev.inAppNotifications }))}
                                                    className={`relative w-12 h-6 rounded-full transition-colors ${
                                                        notificationPrefs.inAppNotifications ? 'bg-indigo-500' : 'bg-gray-600'
                                                    }`}
                                                >
                                                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                                        notificationPrefs.inAppNotifications ? 'translate-x-6' : ''
                                                    }`} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Notification Categories */}
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-300 mb-4">Notification Types</h3>
                                        <div className="space-y-3">
                                            {[
                                                { key: 'newDispute', label: 'New Dispute Filed', desc: 'When a case is filed against you' },
                                                { key: 'caseAccepted', label: 'Case Accepted', desc: 'When the other party accepts your case' },
                                                { key: 'newMessage', label: 'New Messages', desc: 'When you receive a new message' },
                                                { key: 'aiAnalysisComplete', label: 'AI Analysis Complete', desc: 'When AI solutions are ready' },
                                                { key: 'solutionVotes', label: 'Solution Votes', desc: 'When the other party votes on a solution' },
                                                { key: 'evidenceUploaded', label: 'Evidence Uploaded', desc: 'When new evidence is added' },
                                                { key: 'signatureRequired', label: 'Signature Required', desc: 'When you need to sign an agreement' },
                                                { key: 'caseResolved', label: 'Case Resolved', desc: 'When a dispute is successfully resolved' },
                                                { key: 'courtForwarding', label: 'Court Forwarding', desc: 'When a case is forwarded to court' },
                                                { key: 'systemAlerts', label: 'System Alerts', desc: 'Important system notifications' }
                                            ].map(item => (
                                                <div key={item.key} className="flex items-center justify-between py-3 border-b border-gray-700/50 last:border-0">
                                                    <div>
                                                        <h4 className="text-sm font-medium text-white">{item.label}</h4>
                                                        <p className="text-xs text-gray-400">{item.desc}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => setNotificationPrefs(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                                                        className={`relative w-10 h-5 rounded-full transition-colors ${
                                                            notificationPrefs[item.key] ? 'bg-indigo-500' : 'bg-gray-600'
                                                        }`}
                                                    >
                                                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                                                            notificationPrefs[item.key] ? 'translate-x-5' : ''
                                                        }`} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Save Button */}
                                    <div className="flex justify-end pt-4 border-t border-gray-700/50">
                                        <button
                                            onClick={handleUpdateNotifications}
                                            disabled={saving}
                                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/25"
                                        >
                                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                            {saving ? 'Saving...' : 'Save Preferences'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Sessions Tab */}
                        {activeTab === 'sessions' && (
                            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
                                <div className="px-6 py-5 border-b border-gray-700/50">
                                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                        <Monitor className="w-5 h-5 text-indigo-400" />
                                        Active Sessions
                                    </h2>
                                    <p className="mt-1 text-sm text-gray-400">Manage your active sessions across devices</p>
                                </div>
                                
                                <div className="p-6">
                                    {loadingSessions ? (
                                        <div className="text-center py-8">
                                            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-2" />
                                            <p className="text-gray-400">Loading sessions...</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {sessions.map((session) => (
                                                <div 
                                                    key={session.id} 
                                                    className={`p-4 rounded-xl border ${
                                                        session.isCurrent 
                                                            ? 'bg-green-900/20 border-green-500/30' 
                                                            : 'bg-gray-700/30 border-gray-600/30'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`p-3 rounded-lg ${
                                                                session.isCurrent ? 'bg-green-500/20' : 'bg-gray-600/50'
                                                            }`}>
                                                                {session.device?.includes('Mobile') ? (
                                                                    <Smartphone className={`w-5 h-5 ${session.isCurrent ? 'text-green-400' : 'text-gray-400'}`} />
                                                                ) : (
                                                                    <Monitor className={`w-5 h-5 ${session.isCurrent ? 'text-green-400' : 'text-gray-400'}`} />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <h4 className="font-medium text-white">
                                                                        {session.device || 'Unknown Device'}
                                                                    </h4>
                                                                    {session.isCurrent && (
                                                                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                                                                            Current
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                                                                    <span className="flex items-center gap-1">
                                                                        <Globe className="w-3 h-3" />
                                                                        {session.browser || 'Unknown Browser'}
                                                                    </span>
                                                                    <span className="flex items-center gap-1">
                                                                        <MapPin className="w-3 h-3" />
                                                                        {session.location || 'Unknown Location'}
                                                                    </span>
                                                                    <span className="flex items-center gap-1">
                                                                        <Clock className="w-3 h-3" />
                                                                        {session.lastActive ? new Date(session.lastActive).toLocaleString() : 'Recently'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {!session.isCurrent && (
                                                            <button
                                                                onClick={() => handleRevokeSession(session.id)}
                                                                className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                                                                title="Revoke session"
                                                            >
                                                                <LogOut className="w-5 h-5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}

                                            {sessions.length === 0 && (
                                                <div className="text-center py-8 text-gray-400">
                                                    No active sessions found
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Privacy & Data Tab */}
                        {activeTab === 'data' && (
                            <div className="space-y-6">
                                {/* Export Data Card */}
                                <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
                                    <div className="flex items-start gap-4">
                                        <div className="p-3 bg-blue-500/20 rounded-lg">
                                            <Download className="w-6 h-6 text-blue-400" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-semibold text-white">Export Your Data</h3>
                                            <p className="text-sm text-gray-400 mt-1">
                                                Download a copy of all your data including profile, disputes, messages, and activity logs.
                                            </p>
                                            <button
                                                onClick={handleExportData}
                                                disabled={exporting}
                                                className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
                                            >
                                                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                                {exporting ? 'Preparing...' : 'Export Data'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Delete Account Card */}
                                <div className="bg-red-900/20 rounded-xl border border-red-500/30 p-6">
                                    <div className="flex items-start gap-4">
                                        <div className="p-3 bg-red-500/20 rounded-lg">
                                            <Trash2 className="w-6 h-6 text-red-400" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-semibold text-red-400">Delete Account</h3>
                                            <p className="text-sm text-gray-400 mt-1">
                                                Permanently delete your account and all associated data. This action cannot be undone.
                                            </p>
                                            <div className="mt-4 p-4 bg-red-950/50 rounded-lg border border-red-500/20">
                                                <div className="flex items-start gap-2 text-sm text-red-300 mb-3">
                                                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                                    <span>
                                                        <strong>Warning:</strong> You have {stats.active} active dispute(s). 
                                                        Deleting your account will affect these ongoing cases.
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setShowDeleteModal(true)}
                                                className="mt-4 flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Delete Account
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Privacy Info */}
                                <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
                                    <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                                        <Shield className="w-5 h-5 text-indigo-400" />
                                        Privacy Information
                                    </h3>
                                    <div className="space-y-4 text-sm text-gray-400">
                                        <div className="flex items-start gap-3">
                                            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                                            <span>Your data is encrypted at rest and in transit using industry-standard protocols.</span>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                                            <span>We never share your personal information with third parties without your consent.</span>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                                            <span>All dispute communications are confidential and only visible to involved parties.</span>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                                            <span>You can request deletion of your data at any time under GDPR and similar regulations.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Delete Account Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-xl max-w-md w-full border border-gray-700 shadow-2xl">
                        <div className="p-6 border-b border-gray-700">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-red-500/20 rounded-full">
                                    <AlertTriangle className="w-6 h-6 text-red-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-semibold text-white">Delete Account</h3>
                                    <p className="text-sm text-gray-400">This action is irreversible</p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <p className="text-gray-300">
                                Are you sure you want to permanently delete your account? All your data will be lost, including:
                            </p>
                            <ul className="list-disc list-inside text-sm text-gray-400 space-y-1">
                                <li>Profile information</li>
                                <li>All dispute records</li>
                                <li>Messages and attachments</li>
                                <li>Signatures and agreements</li>
                                <li>Notification history</li>
                            </ul>
                            
                            <div className="pt-4">
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Type <span className="text-red-400 font-bold">DELETE</span> to confirm
                                </label>
                                <input
                                    type="text"
                                    value={deleteConfirmText}
                                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                                    placeholder="Type DELETE"
                                    className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-white"
                                />
                            </div>
                        </div>
                        
                        <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowDeleteModal(false);
                                    setDeleteConfirmText('');
                                }}
                                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteAccount}
                                disabled={deleteConfirmText !== 'DELETE' || deleting}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                {deleting ? 'Deleting...' : 'Delete Forever'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
