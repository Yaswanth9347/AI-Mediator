import { useState, useRef } from 'react';
import { Upload, Camera, Trash2, User, Loader2 } from 'lucide-react';
import { uploadProfilePicture, deleteProfilePicture } from '../api';
import toast from 'react-hot-toast';

export default function ProfilePictureUpload({ currentPicture, onUpdate }) {
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [preview, setPreview] = useState(currentPicture);
    const fileInputRef = useRef(null);

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file');
            return;
        }

        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image size must be less than 5MB');
            return;
        }

        // Show preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setPreview(reader.result);
        };
        reader.readAsDataURL(file);

        // Upload
        try {
            setUploading(true);
            const formData = new FormData();
            formData.append('profilePicture', file);
            
            const response = await uploadProfilePicture(formData);
            toast.success('Profile picture updated successfully!');
            onUpdate && onUpdate(response.data.profilePicture);
        } catch (error) {
            console.error('Upload error:', error);
            toast.error(error.response?.data?.error || 'Failed to upload profile picture');
            setPreview(currentPicture);
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete your profile picture?')) {
            return;
        }

        try {
            setDeleting(true);
            await deleteProfilePicture();
            setPreview(null);
            toast.success('Profile picture deleted successfully!');
            onUpdate && onUpdate(null);
        } catch (error) {
            console.error('Delete error:', error);
            toast.error(error.response?.data?.error || 'Failed to delete profile picture');
        } finally {
            setDeleting(false);
        }
    };

    const getImageUrl = (path) => {
        if (!path) return null;
        if (path.startsWith('http')) return path;
        if (path.startsWith('data:')) return path;
        return `http://localhost:5000${path}`;
    };

    return (
        <div className="flex flex-col items-center gap-4">
            {/* Profile Picture Display */}
            <div className="relative">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 p-1 shadow-lg">
                    <div className="w-full h-full rounded-full bg-gray-900 overflow-hidden flex items-center justify-center">
                        {preview ? (
                            <img
                                src={getImageUrl(preview)}
                                alt="Profile"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <User className="w-16 h-16 text-gray-600" />
                        )}
                    </div>
                </div>

                {/* Upload Button Overlay */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || deleting}
                    className="absolute bottom-0 right-0 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white p-3 rounded-full shadow-lg transition-colors"
                >
                    {uploading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <Camera className="w-5 h-5" />
                    )}
                </button>
            </div>

            {/* File Input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
            />

            {/* Action Buttons */}
            <div className="flex gap-2">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || deleting}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                >
                    <Upload className="w-4 h-4" />
                    {preview ? 'Change Photo' : 'Upload Photo'}
                </button>

                {preview && (
                    <button
                        onClick={handleDelete}
                        disabled={uploading || deleting}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                        {deleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Trash2 className="w-4 h-4" />
                        )}
                        Remove
                    </button>
                )}
            </div>

            <p className="text-xs text-gray-400 text-center">
                JPG, PNG or GIF. Max size 5MB.
            </p>
        </div>
    );
}
