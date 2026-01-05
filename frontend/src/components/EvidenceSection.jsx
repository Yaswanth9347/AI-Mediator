import { useState, useEffect, useRef } from 'react';
import { uploadEvidence, getEvidence, deleteEvidence } from '../api';
import { 
    Upload, 
    File, 
    Image, 
    Video, 
    FileText, 
    Download, 
    Trash2, 
    Eye, 
    X,
    CheckCircle,
    AlertCircle,
    Paperclip,
    User,
    Shield
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function EvidenceSection({ disputeId, isPlaintiff, isDefendant, isAdmin }) {
    const [evidence, setEvidence] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [description, setDescription] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const [viewingEvidence, setViewingEvidence] = useState(null);
    const fileInputRef = useRef(null);

    const canUpload = isPlaintiff || isDefendant || isAdmin;

    useEffect(() => {
        if (disputeId) {
            fetchEvidence();
        }
    }, [disputeId]);

    const fetchEvidence = async () => {
        try {
            setLoading(true);
            const response = await getEvidence(disputeId);
            setEvidence(response.data.evidence || []);
        } catch (error) {
            console.error('Failed to fetch evidence:', error);
            toast.error('Failed to load evidence');
        } finally {
            setLoading(false);
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            // Validate file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                toast.error('File size must be less than 10MB');
                return;
            }
            setSelectedFile(file);
        }
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const file = e.dataTransfer.files?.[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) {
                toast.error('File size must be less than 10MB');
                return;
            }
            setSelectedFile(file);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) {
            toast.error('Please select a file');
            return;
        }

        try {
            setUploading(true);
            const formData = new FormData();
            formData.append('evidence', selectedFile);
            if (description) {
                formData.append('description', description);
            }

            await uploadEvidence(disputeId, formData);
            toast.success('Evidence uploaded successfully');
            
            // Reset form
            setSelectedFile(null);
            setDescription('');
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }

            // Refresh evidence list
            await fetchEvidence();
        } catch (error) {
            console.error('Upload failed:', error);
            toast.error(error.response?.data?.error || 'Failed to upload evidence');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (evidenceId) => {
        if (!confirm('Are you sure you want to delete this evidence?')) return;

        try {
            await deleteEvidence(disputeId, evidenceId);
            toast.success('Evidence deleted successfully');
            await fetchEvidence();
        } catch (error) {
            console.error('Delete failed:', error);
            toast.error(error.response?.data?.error || 'Failed to delete evidence');
        }
    };

    const getFileIcon = (fileType) => {
        switch (fileType) {
            case 'image': return <Image className="w-5 h-5" />;
            case 'video': return <Video className="w-5 h-5" />;
            case 'audio': return <FileText className="w-5 h-5" />;
            default: return <File className="w-5 h-5" />;
        }
    };

    const getRoleIcon = (role) => {
        if (role === 'admin') return <Shield className="w-4 h-4" />;
        return <User className="w-4 h-4" />;
    };

    const getRoleBadgeColor = (role) => {
        if (role === 'admin') return 'bg-red-500/20 text-red-400 border-red-500/30';
        if (role === 'plaintiff') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const canDelete = (evidenceItem) => {
        return isAdmin || evidenceItem.uploadedBy === parseInt(localStorage.getItem('userId'));
    };

    return (
        <div className="bg-slate-800/50 rounded-lg border border-blue-800 p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Paperclip className="w-6 h-6 text-blue-400" />
                    <h3 className="text-xl font-bold text-blue-100">Evidence & Attachments</h3>
                    {evidence.length > 0 && (
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-sm rounded-full border border-blue-500/30">
                            {evidence.length} file{evidence.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
            </div>

            {/* Upload Section */}
            {canUpload && (
                <div className="mb-6 p-4 bg-slate-900/50 rounded-lg border border-blue-800/50">
                    <h4 className="text-sm font-semibold text-blue-200 mb-3">Upload Evidence</h4>
                    
                    {/* Drag & Drop Area */}
                    <div
                        className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                            dragActive 
                                ? 'border-blue-500 bg-blue-500/10' 
                                : 'border-blue-800 bg-slate-800/30 hover:border-blue-700'
                        }`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleFileSelect}
                            accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                            className="hidden"
                            id="evidence-upload"
                        />
                        
                        {selectedFile ? (
                            <div className="space-y-3">
                                <div className="flex items-center justify-center gap-2 text-green-400">
                                    <CheckCircle className="w-5 h-5" />
                                    <span className="font-medium">{selectedFile.name}</span>
                                </div>
                                <p className="text-xs text-blue-300">{formatFileSize(selectedFile.size)}</p>
                                <button
                                    onClick={() => {
                                        setSelectedFile(null);
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                    className="text-xs text-red-400 hover:text-red-300"
                                >
                                    Remove
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Upload className="w-8 h-8 mx-auto text-blue-400" />
                                <p className="text-sm text-blue-200">
                                    Drag & drop a file here, or{' '}
                                    <label htmlFor="evidence-upload" className="text-blue-400 hover:text-blue-300 cursor-pointer underline">
                                        browse
                                    </label>
                                </p>
                                <p className="text-xs text-blue-400">
                                    Supports: Images, Videos, Audio, PDFs, Documents (Max 10MB)
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Description */}
                    <div className="mt-3">
                        <label className="block text-xs text-blue-300 mb-1">
                            Description (optional)
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe this evidence..."
                            rows={2}
                            className="w-full px-3 py-2 bg-slate-900/50 border border-blue-800 rounded text-sm text-blue-100 placeholder-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Upload Button */}
                    <button
                        onClick={handleUpload}
                        disabled={!selectedFile || uploading}
                        className="mt-3 w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded hover:from-blue-700 hover:to-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {uploading ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                                Uploading...
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4" />
                                Upload Evidence
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* Evidence List */}
            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
                    <span className="ml-3 text-blue-300">Loading evidence...</span>
                </div>
            ) : evidence.length === 0 ? (
                <div className="text-center py-8 text-blue-300">
                    <Paperclip className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No evidence uploaded yet</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {evidence.map((item) => (
                        <div 
                            key={item.id} 
                            className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-blue-800/50 hover:border-blue-700 transition-colors"
                        >
                            {/* File Icon */}
                            <div className="p-2 bg-blue-500/20 rounded text-blue-400">
                                {getFileIcon(item.fileType)}
                            </div>

                            {/* File Info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-blue-100 truncate">
                                    {item.originalName}
                                </p>
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <span className={`px-2 py-0.5 text-xs rounded border ${getRoleBadgeColor(item.uploaderRole)}`}>
                                        {item.uploaderRole}
                                    </span>
                                    <span className="text-xs text-blue-400">
                                        {item.uploaderName}
                                    </span>
                                    <span className="text-xs text-blue-500">
                                        {formatFileSize(item.fileSize)}
                                    </span>
                                    <span className="text-xs text-blue-500">
                                        {new Date(item.createdAt).toLocaleDateString()}
                                    </span>
                                    {item.isVerified && (
                                        <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded border border-green-500/30 flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3" />
                                            Verified
                                        </span>
                                    )}
                                </div>
                                {item.description && (
                                    <p className="text-xs text-blue-300 mt-1 line-clamp-2">
                                        {item.description}
                                    </p>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                                <a
                                    href={`http://localhost:5000/uploads/${item.fileName}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                                    title="View"
                                >
                                    <Eye className="w-4 h-4" />
                                </a>
                                <a
                                    href={`http://localhost:5000/uploads/${item.fileName}`}
                                    download={item.originalName}
                                    className="p-2 text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded transition-colors"
                                    title="Download"
                                >
                                    <Download className="w-4 h-4" />
                                </a>
                                {canDelete(item) && (
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
