import { useState } from 'react';
import { Eye, EyeOff, Globe, Mail, Phone, Lock, Loader2, CheckCircle } from 'lucide-react';
import { updatePrivacySettings } from '../api';
import toast from 'react-hot-toast';

export default function PrivacySettings({ user, onUpdate }) {
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState({
        profileVisibility: user?.profileVisibility || 'public',
        showEmail: user?.showEmail || false,
        showPhone: user?.showPhone || false,
    });

    const handleSave = async () => {
        try {
            setLoading(true);
            const response = await updatePrivacySettings(settings);
            toast.success('Privacy settings updated successfully!');
            onUpdate && onUpdate(response.data.settings);
        } catch (error) {
            console.error('Update privacy settings error:', error);
            toast.error(error.response?.data?.error || 'Failed to update privacy settings');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    <Lock className="w-6 h-6 text-blue-400" />
                    Privacy Settings
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                    Control who can see your information
                </p>
            </div>

            {/* Profile Visibility */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-400" />
                    Profile Visibility
                </h3>
                
                <div className="space-y-3">
                    <label className="flex items-start gap-3 p-4 bg-gray-900/50 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-900 transition-colors">
                        <input
                            type="radio"
                            name="profileVisibility"
                            value="public"
                            checked={settings.profileVisibility === 'public'}
                            onChange={(e) => setSettings({ ...settings, profileVisibility: e.target.value })}
                            className="mt-1"
                        />
                        <div className="flex-1">
                            <div className="font-medium text-white">Public</div>
                            <div className="text-sm text-gray-400">
                                Anyone can view your profile information
                            </div>
                        </div>
                    </label>

                    <label className="flex items-start gap-3 p-4 bg-gray-900/50 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-900 transition-colors">
                        <input
                            type="radio"
                            name="profileVisibility"
                            value="contacts"
                            checked={settings.profileVisibility === 'contacts'}
                            onChange={(e) => setSettings({ ...settings, profileVisibility: e.target.value })}
                            className="mt-1"
                        />
                        <div className="flex-1">
                            <div className="font-medium text-white">Contacts Only</div>
                            <div className="text-sm text-gray-400">
                                Only people involved in disputes with you can see your profile
                            </div>
                        </div>
                    </label>

                    <label className="flex items-start gap-3 p-4 bg-gray-900/50 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-900 transition-colors">
                        <input
                            type="radio"
                            name="profileVisibility"
                            value="private"
                            checked={settings.profileVisibility === 'private'}
                            onChange={(e) => setSettings({ ...settings, profileVisibility: e.target.value })}
                            className="mt-1"
                        />
                        <div className="flex-1">
                            <div className="font-medium text-white">Private</div>
                            <div className="text-sm text-gray-400">
                                Only you and administrators can view your profile
                            </div>
                        </div>
                    </label>
                </div>
            </div>

            {/* Contact Information Visibility */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">
                    Contact Information
                </h3>
                
                <div className="space-y-4">
                    <label className="flex items-center justify-between p-4 bg-gray-900/50 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-900 transition-colors">
                        <div className="flex items-center gap-3">
                            <Mail className="w-5 h-5 text-blue-400" />
                            <div>
                                <div className="font-medium text-white">Show Email Address</div>
                                <div className="text-sm text-gray-400">
                                    {user?.email || 'Your email address'}
                                </div>
                            </div>
                        </div>
                        <div className="relative">
                            <input
                                type="checkbox"
                                checked={settings.showEmail}
                                onChange={(e) => setSettings({ ...settings, showEmail: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </div>
                    </label>

                    <label className="flex items-center justify-between p-4 bg-gray-900/50 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-900 transition-colors">
                        <div className="flex items-center gap-3">
                            <Phone className="w-5 h-5 text-green-400" />
                            <div>
                                <div className="font-medium text-white">Show Phone Number</div>
                                <div className="text-sm text-gray-400">
                                    {user?.phone || 'Your phone number'}
                                </div>
                            </div>
                        </div>
                        <div className="relative">
                            <input
                                type="checkbox"
                                checked={settings.showPhone}
                                onChange={(e) => setSettings({ ...settings, showPhone: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </div>
                    </label>
                </div>

                <div className="mt-4 bg-blue-900/20 border border-blue-700 rounded-lg p-3 text-sm text-blue-300">
                    <Eye className="w-4 h-4 inline mr-2" />
                    Contact information is always visible to dispute participants and administrators
                </div>
            </div>

            {/* Save Button */}
            <button
                onClick={handleSave}
                disabled={loading}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
            >
                {loading ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Saving...
                    </>
                ) : (
                    <>
                        <CheckCircle className="w-5 h-5" />
                        Save Privacy Settings
                    </>
                )}
            </button>
        </div>
    );
}
