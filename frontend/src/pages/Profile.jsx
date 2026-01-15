import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
    getUserProfile, updateUserProfile, changePassword,
    getNotificationPreferences, updateNotificationPreferences
} from '../api';
import {
    User, Mail, Lock, Save, Eye, EyeOff, CheckCircle, ShieldCheck, AlertTriangle,
    Bell, BellOff, Loader2, Shield, ChevronRight, Activity, Briefcase, MapPin, Key,
    AlertCircle, Smartphone, Tablet, Monitor, Globe, Laptop, Phone
} from 'lucide-react';
import ProfilePictureUpload from '../components/ProfilePictureUpload';
// import TwoFactorAuth from '../components/TwoFactorAuth'; // Disabled - placeholder implementation
import PrivacySettings from '../components/PrivacySettings';

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

    useEffect(() => {
        async function fetchData() {
            await fetchProfile();
        }
        fetchData();
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
            toast.error('Failed to load sessions');
            setSessions([]);
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
            const errorMsg = error.response?.data?.error || 'Failed to revoke session';
            toast.error(errorMsg);
        }
    };

    const handleRevokeAllSessions = async () => {
        if (!window.confirm('This will log you out from all other devices. Continue?')) {
            return;
        }

        try {
            const res = await revokeAllSessions();
            const revokedCount = res.data?.revokedCount || 0;
            toast.success(`Logged out from ${revokedCount} other device${revokedCount !== 1 ? 's' : ''}`);
            // Refresh sessions list
            fetchSessions();
        } catch (error) {
            const errorMsg = error.response?.data?.error || 'Failed to revoke sessions';
            toast.error(errorMsg);
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            localStorage.removeItem('username');
            navigate('/login');
            toast.success('Logged out successfully');
        } catch (error) {
            // Even if the API fails, clear local storage and redirect
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            localStorage.removeItem('username');
            navigate('/login');
        }
    };

    // Get device icon based on device type
    const getDeviceIcon = (deviceType) => {
        switch (deviceType?.toLowerCase()) {
            case 'mobile':
                return <Smartphone className="w-5 h-5" />;
            case 'tablet':
                return <Tablet className="w-5 h-5" />;
            case 'desktop':
                return <Monitor className="w-5 h-5" />;
            case 'api client':
                return <Globe className="w-5 h-5" />;
            default:
                return <Laptop className="w-5 h-5" />;
        }
    };

    // Format relative time
    const formatRelativeTime = (dateString) => {
        if (!dateString) return 'Unknown';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        return date.toLocaleDateString();
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
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
                    <p className="text-blue-300">Loading profile...</p>
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
        { id: 'security', label: 'Security', icon: Shield },
        { id: 'privacy', label: 'Privacy', icon: Lock },
        { id: 'notifications', label: 'Notifications', icon: Bell }
    ];

    // Track if form has changes
    const hasProfileChanges = user && (
        profileForm.username !== (user.username || '') ||
        profileForm.email !== (user.email || '') ||
        profileForm.phone !== (user.phone || '') ||
        profileForm.address !== (user.address || '') ||
        profileForm.occupation !== (user.occupation || '')
    );

    return (
        <div className="flex-1">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="flex flex-col lg:flex-row gap-6">

                    {/* ============ LEFT COLUMN - Fixed Width ============ */}
                    <div className="lg:w-72 flex-shrink-0 space-y-4">

                        {/* User Identity Card */}
                        <div className="bg-slate-800/50 rounded-lg border border-blue-800 p-5">
                            {/* Profile Photo */}
                            <div className="flex justify-center mb-4">
                                <div className="relative group">
                                    <div className="w-28 h-28 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-4xl font-bold shadow-lg shadow-blue-500/30 overflow-hidden">
                                        {user?.profilePicture ? (
                                            <img
                                                src={user.profilePicture.startsWith('http') ? user.profilePicture : `http://localhost:5000${user.profilePicture.startsWith('/') ? '' : '/'}${user.profilePicture}`}
                                                alt="Profile"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            user?.username?.charAt(0).toUpperCase() || 'U'
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* User Name & Email */}
                            <div className="text-center mb-4">
                                <h2 className="text-xl font-semibold text-blue-100">{user?.username}</h2>
                                <p className="text-sm text-blue-300 mt-1">{user?.email}</p>
                            </div>

                            {/* Role Badge */}
                            <div className="flex justify-center mb-4">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${user?.role === 'Admin'
                                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                    }`}>
                                    {user?.role === 'Admin' ? '⚡ Admin' : '👤 User'}
                                </span>
                            </div>

                            {/* Member Since */}
                            <div className="text-center pt-3 border-t border-blue-800/50">
                                <p className="text-xs text-blue-400">Member since</p>
                                <p className="text-sm text-blue-200 font-medium">
                                    {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    }) : 'N/A'}
                                </p>
                            </div>
                        </div>

                        {/* Navigation Tabs */}
                        <nav className="bg-slate-800/50 rounded-lg border border-blue-800 overflow-hidden">
                            {tabs.map((tab) => {
                                const Icon = tab.icon;
                                const isActiveTab = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all ${isActiveTab
                                            ? 'bg-blue-500/20 text-blue-400 border-l-4 border-blue-500'
                                            : 'text-blue-300 hover:bg-slate-700/50 hover:text-blue-100 border-l-4 border-transparent'
                                            }`}
                                    >
                                        <Icon className={`w-5 h-5 ${isActiveTab ? 'text-blue-400' : ''}`} />
                                        <span className="font-medium">{tab.label}</span>
                                        {isActiveTab && (
                                            <div className="ml-auto w-2 h-2 rounded-full bg-blue-400"></div>
                                        )}
                                    </button>
                                );
                            })}
                        </nav>
                    </div>

                    {/* ============ RIGHT COLUMN - Fluid Width ============ */}
                    <div className="flex-1 min-w-0">

                        {/* Profile Tab */}
                        {activeTab === 'profile' && (
                            <form onSubmit={handleUpdateProfile} className="space-y-5">

                                {/* Card A: Profile Photo Upload */}
                                <div className="bg-slate-800/50 rounded-lg border border-blue-800 overflow-hidden">
                                    <div className="px-5 py-4 border-b border-blue-800/50">
                                        <h3 className="text-base font-semibold text-blue-100">Profile Photo</h3>
                                        <p className="text-xs text-blue-300 mt-0.5">Upload a profile picture to personalize your account</p>
                                    </div>
                                    <div className="p-5">
                                        <ProfilePictureUpload
                                            currentPicture={user?.profilePicture}
                                            onUpdate={(newPath) => setUser({ ...user, profilePicture: newPath })}
                                        />
                                    </div>
                                </div>

                                {/* Card B: Personal Information */}
                                <div className="bg-slate-800/50 rounded-lg border border-blue-800 overflow-hidden">
                                    <div className="px-5 py-4 border-b border-blue-800/50">
                                        <h3 className="text-base font-semibold text-blue-100 flex items-center gap-2">
                                            <User className="w-4 h-4 text-blue-400" />
                                            Personal Information
                                        </h3>
                                        <p className="text-xs text-blue-300 mt-0.5">Update your personal details</p>
                                    </div>
                                    <div className="p-5">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            {/* Username */}
                                            <div>
                                                <label className="block text-sm font-medium text-blue-200 mb-2">
                                                    Username
                                                </label>
                                                <input
                                                    type="text"
                                                    value={profileForm.username}
                                                    onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })}
                                                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-blue-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-blue-100 placeholder-blue-400/50 text-sm"
                                                    required
                                                />
                                            </div>

                                            {/* Email */}
                                            <div>
                                                <label className="block text-sm font-medium text-blue-200 mb-2">
                                                    Email Address
                                                </label>
                                                <input
                                                    type="email"
                                                    value={profileForm.email}
                                                    onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                                                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-blue-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-blue-100 placeholder-blue-400/50 text-sm"
                                                />
                                            </div>

                                            {/* Phone */}
                                            <div>
                                                <label className="block text-sm font-medium text-blue-200 mb-2">
                                                    Phone Number
                                                </label>
                                                <input
                                                    type="tel"
                                                    value={profileForm.phone}
                                                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                                                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-blue-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-blue-100 placeholder-blue-400/50 text-sm"
                                                    placeholder="Enter phone number"
                                                />
                                            </div>

                                            {/* Occupation */}
                                            <div>
                                                <label className="block text-sm font-medium text-blue-200 mb-2">
                                                    Occupation
                                                </label>
                                                <input
                                                    type="text"
                                                    value={profileForm.occupation}
                                                    onChange={(e) => setProfileForm({ ...profileForm, occupation: e.target.value })}
                                                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-blue-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-blue-100 placeholder-blue-400/50 text-sm"
                                                    placeholder="Enter occupation"
                                                />
                                            </div>
                                        </div>

                                        {/* Address - Full Width */}
                                        <div className="mt-5">
                                            <label className="block text-sm font-medium text-blue-200 mb-2">
                                                Address
                                            </label>
                                            <textarea
                                                value={profileForm.address}
                                                onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                                                rows={2}
                                                className="w-full px-4 py-2.5 bg-slate-700/50 border border-blue-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-blue-100 placeholder-blue-400/50 text-sm resize-none"
                                                placeholder="Enter address"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Card C: Account Status (Read-Only Info) */}
                                <div className="bg-slate-800/50 rounded-lg border border-blue-800 overflow-hidden">
                                    <div className="px-5 py-4 border-b border-blue-800/50">
                                        <h3 className="text-base font-semibold text-blue-100 flex items-center gap-2">
                                            <ShieldCheck className="w-4 h-4 text-blue-400" />
                                            Account Status
                                        </h3>
                                        <p className="text-xs text-blue-300 mt-0.5">Your account information</p>
                                    </div>
                                    <div className="p-5">
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="bg-slate-700/30 rounded-lg p-3 border border-blue-800/30">
                                                <p className="text-xs text-blue-400">Role</p>
                                                <p className="text-sm font-medium text-blue-100 capitalize mt-1">{user?.role}</p>
                                            </div>
                                            <div className="bg-slate-700/30 rounded-lg p-3 border border-blue-800/30">
                                                <p className="text-xs text-blue-400">Member Since</p>
                                                <p className="text-sm font-medium text-blue-100 mt-1">
                                                    {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                                                </p>
                                            </div>
                                            <div className="bg-slate-700/30 rounded-lg p-3 border border-blue-800/30">
                                                <p className="text-xs text-blue-400">Last Updated</p>
                                                <p className="text-sm font-medium text-blue-100 mt-1">
                                                    {user?.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : 'N/A'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Save Button - Bottom Right */}
                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={saving || !hasProfileChanges}
                                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg transition-all text-sm font-medium ${hasProfileChanges
                                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/25'
                                            : 'bg-slate-700/50 text-blue-300/50 cursor-not-allowed'
                                            }`}
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Security Tab */}
                        {activeTab === 'security' && (
                            <div className="space-y-6">
                                {/* Change Password Card */}
                                <div className="bg-slate-800/50 rounded-xl border border-blue-800/50 overflow-hidden">
                                    <div className="px-6 py-5 border-b border-blue-800/50">
                                        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                            <Key className="w-5 h-5 text-blue-400" />
                                            Change Password
                                        </h2>
                                        <p className="mt-1 text-sm text-blue-300">Update your password to keep your account secure</p>
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
                                            <label className="block text-sm font-medium text-blue-200 mb-2">
                                                Current Password
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type={showPasswords.current ? 'text' : 'password'}
                                                    value={passwordForm.currentPassword}
                                                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                                    className="w-full px-4 py-3 pr-12 bg-slate-700/50 border border-blue-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-300 hover:text-blue-100"
                                                >
                                                    {showPasswords.current ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                                </button>
                                            </div>
                                        </div>

                                        {/* New Password */}
                                        <div>
                                            <label className="block text-sm font-medium text-blue-200 mb-2">
                                                New Password
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type={showPasswords.new ? 'text' : 'password'}
                                                    value={passwordForm.newPassword}
                                                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                                    className="w-full px-4 py-3 pr-12 bg-slate-700/50 border border-blue-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                                                    required
                                                    minLength={6}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-300 hover:text-blue-100"
                                                >
                                                    {showPasswords.new ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                                </button>
                                            </div>
                                            {/* Password Strength Meter */}
                                            {passwordForm.newPassword && (
                                                <div className="mt-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full ${passwordStrength.color} transition-all`}
                                                                style={{ width: `${passwordStrength.strength}%` }}
                                                            />
                                                        </div>
                                                        <span className={`text-xs font-medium ${passwordStrength.color.includes('red') ? 'text-red-400' :
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
                                            <label className="block text-sm font-medium text-blue-200 mb-2">
                                                Confirm New Password
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type={showPasswords.confirm ? 'text' : 'password'}
                                                    value={passwordForm.confirmPassword}
                                                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                                    className="w-full px-4 py-3 pr-12 bg-slate-700/50 border border-blue-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-300 hover:text-blue-100"
                                                >
                                                    {showPasswords.confirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                                </button>
                                            </div>
                                            {/* Password Match Indicator */}
                                            {passwordForm.newPassword && passwordForm.confirmPassword && (
                                                <div className={`mt-2 text-sm flex items-center gap-2 ${passwordForm.newPassword === passwordForm.confirmPassword
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
                                        <div className="flex justify-end pt-4 border-t border-blue-800/50">
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

                                {/* Two-Factor Authentication - DISABLED (placeholder implementation) */}
                                {/* <TwoFactorAuth 
                                    user={user} 
                                    onUpdate={(updates) => setUser({ ...user, ...updates })}
                                /> */}
                            </div>
                        )}

                        {/* Privacy Tab */}
                        {activeTab === 'privacy' && (
                            <div className="bg-slate-800/50 rounded-xl border border-blue-800/50 overflow-hidden p-6">
                                <PrivacySettings
                                    user={user}
                                    onUpdate={(settings) => setUser({ ...user, ...settings })}
                                />
                            </div>
                        )}



                        {/* Notifications Tab */}
                        {activeTab === 'notifications' && (
                            <div className="bg-slate-800/50 rounded-xl border border-blue-800/50 overflow-hidden">
                                <div className="px-6 py-5 border-b border-blue-800/50">
                                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                        <Bell className="w-5 h-5 text-blue-400" />
                                        Notification Preferences
                                    </h2>
                                    <p className="mt-1 text-sm text-blue-300">Choose how and when you want to be notified</p>
                                </div>

                                <div className="p-6 space-y-6">
                                    {/* Master Toggles */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className={`p-4 rounded-xl border ${notificationPrefs.emailNotifications
                                            ? 'bg-indigo-900/30 border-blue-500/30'
                                            : 'bg-slate-700/30 border-blue-700/30'
                                            }`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <Mail className={`w-5 h-5 ${notificationPrefs.emailNotifications ? 'text-blue-400' : 'text-blue-300'}`} />
                                                    <div>
                                                        <h4 className="font-medium text-white">Email Notifications</h4>
                                                        <p className="text-xs text-blue-300">Receive updates via email</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setNotificationPrefs(prev => ({ ...prev, emailNotifications: !prev.emailNotifications }))}
                                                    className={`relative w-12 h-6 rounded-full transition-colors ${notificationPrefs.emailNotifications ? 'bg-indigo-500' : 'bg-gray-600'
                                                        }`}
                                                >
                                                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${notificationPrefs.emailNotifications ? 'translate-x-6' : ''
                                                        }`} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className={`p-4 rounded-xl border ${notificationPrefs.inAppNotifications
                                            ? 'bg-indigo-900/30 border-blue-500/30'
                                            : 'bg-slate-700/30 border-blue-700/30'
                                            }`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <Bell className={`w-5 h-5 ${notificationPrefs.inAppNotifications ? 'text-blue-400' : 'text-blue-300'}`} />
                                                    <div>
                                                        <h4 className="font-medium text-white">In-App Notifications</h4>
                                                        <p className="text-xs text-blue-300">Real-time alerts in the app</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setNotificationPrefs(prev => ({ ...prev, inAppNotifications: !prev.inAppNotifications }))}
                                                    className={`relative w-12 h-6 rounded-full transition-colors ${notificationPrefs.inAppNotifications ? 'bg-indigo-500' : 'bg-gray-600'
                                                        }`}
                                                >
                                                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${notificationPrefs.inAppNotifications ? 'translate-x-6' : ''
                                                        }`} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Notification Categories */}
                                    <div>
                                        <h3 className="text-sm font-semibold text-blue-200 mb-4">Notification Types</h3>
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
                                                <div key={item.key} className="flex items-center justify-between py-3 border-b border-blue-800/50 last:border-0">
                                                    <div>
                                                        <h4 className="text-sm font-medium text-white">{item.label}</h4>
                                                        <p className="text-xs text-blue-300">{item.desc}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => setNotificationPrefs(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                                                        className={`relative w-10 h-5 rounded-full transition-colors ${notificationPrefs[item.key] ? 'bg-indigo-500' : 'bg-gray-600'
                                                            }`}
                                                    >
                                                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${notificationPrefs[item.key] ? 'translate-x-5' : ''
                                                            }`} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Save Button */}
                                    <div className="flex justify-end pt-4 border-t border-blue-800/50">
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


                    </div>
                </div>
            </div>
        </div >
    );
}
