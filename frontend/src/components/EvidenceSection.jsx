import { useState, useEffect, useRef } from 'react';
import { uploadEvidence, getEvidence, deleteEvidence, downloadEvidence, getEvidencePreviewUrl, getEvidenceOcr, processEvidenceOcr, processAllOcr } from '../api';
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
    Shield,
    Maximize2,
    Volume2,
    FileAudio,
    Loader2,
    ExternalLink,
    ZoomIn,
    ZoomOut,
    RotateCw,
    FileSearch,
    Copy,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    MessageSquare
} from 'lucide-react';
import toast from 'react-hot-toast';

// Helper function to get file type from path
const getFileTypeFromPath = (filePath) => {
    if (!filePath) return 'file';
    const ext = filePath.split('.').pop()?.toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    const docExts = ['pdf', 'doc', 'docx'];
    const videoExts = ['mp4', 'mpeg', 'mov', 'webm'];
    const audioExts = ['mp3', 'wav', 'ogg'];
    
    if (imageExts.includes(ext)) return 'image';
    if (docExts.includes(ext)) return 'document';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    return 'file';
};

// Helper function to get file name from path
const getFileNameFromPath = (filePath) => {
    if (!filePath) return 'Unknown file';
    const parts = filePath.split('/');
    return parts[parts.length - 1];
};

// Helper function to build file URL
const getFileUrlFromPath = (filePath) => {
    if (!filePath) return '';
    if (filePath.startsWith('http')) return filePath;
    const cleanPath = filePath.replace(/^\.?\/?(uploads\/)?/, '');
    return `http://localhost:5000/uploads/${cleanPath}`;
};

export default function EvidenceSection({ disputeId, isPlaintiff, isDefendant, isAdmin, messageAttachments = [] }) {
    const [evidence, setEvidence] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [description, setDescription] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const [viewingEvidence, setViewingEvidence] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [imageZoom, setImageZoom] = useState(1);
    const [imageRotation, setImageRotation] = useState(0);
    const [downloading, setDownloading] = useState(null);
    const fileInputRef = useRef(null);
    
    // OCR State
    const [ocrData, setOcrData] = useState({}); // { evidenceId: { text, status, ... } }
    const [ocrLoading, setOcrLoading] = useState({}); // { evidenceId: boolean }
    const [expandedOcr, setExpandedOcr] = useState({}); // { evidenceId: boolean }
    const [processingAllOcr, setProcessingAllOcr] = useState(false);
    const [activeTab, setActiveTab] = useState('evidence'); // 'evidence' or 'attachments'
    const [viewingMessageAttachment, setViewingMessageAttachment] = useState(null);

    // Only plaintiff and defendant can upload evidence; admin can only view
    const canUpload = isPlaintiff || isDefendant;

    // OCR supported MIME types
    const ocrSupportedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
        'image/bmp', 'image/tiff', 'image/webp'
    ];
    
    const isOcrSupported = (mimeType) => ocrSupportedTypes.includes(mimeType);

    // Previewable MIME types
    const previewableTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'video/mp4', 'video/webm',
        'audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/ogg'
    ];

    const canPreview = (mimeType) => previewableTypes.includes(mimeType);

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

    // OCR Functions
    const fetchOcrData = async (evidenceId) => {
        try {
            setOcrLoading(prev => ({ ...prev, [evidenceId]: true }));
            const response = await getEvidenceOcr(disputeId, evidenceId);
            setOcrData(prev => ({ ...prev, [evidenceId]: response.data }));
        } catch (error) {
            console.error('Failed to fetch OCR data:', error);
        } finally {
            setOcrLoading(prev => ({ ...prev, [evidenceId]: false }));
        }
    };

    const handleProcessOcr = async (evidenceId) => {
        try {
            setOcrLoading(prev => ({ ...prev, [evidenceId]: true }));
            const response = await processEvidenceOcr(disputeId, evidenceId);
            setOcrData(prev => ({ 
                ...prev, 
                [evidenceId]: {
                    ocrStatus: response.data.status || 'completed',
                    ocrText: response.data.text,
                    wordCount: response.data.wordCount,
                    confidence: response.data.confidence
                }
            }));
            toast.success('OCR processing completed');
        } catch (error) {
            toast.error(error.response?.data?.error || 'OCR processing failed');
        } finally {
            setOcrLoading(prev => ({ ...prev, [evidenceId]: false }));
        }
    };

    const handleProcessAllOcr = async () => {
        try {
            setProcessingAllOcr(true);
            const response = await processAllOcr(disputeId);
            toast.success(response.data.message);
            // Refresh evidence list after a delay
            setTimeout(() => fetchEvidence(), 2000);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to process OCR');
        } finally {
            setProcessingAllOcr(false);
        }
    };

    const copyOcrText = (text) => {
        navigator.clipboard.writeText(text);
        toast.success('OCR text copied to clipboard');
    };

    const toggleOcrExpand = (evidenceId) => {
        setExpandedOcr(prev => ({ ...prev, [evidenceId]: !prev[evidenceId] }));
        // Fetch OCR data if not already loaded
        if (!ocrData[evidenceId] && !ocrLoading[evidenceId]) {
            fetchOcrData(evidenceId);
        }
    };

    const getOcrStatusBadge = (item) => {
        const status = ocrData[item.id]?.ocrStatus || item.ocrStatus;
        
        if (!isOcrSupported(item.mimeType)) {
            return null; // Don't show badge for non-supported types
        }

        switch (status) {
            case 'completed':
                return (
                    <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded border border-emerald-500/30 flex items-center gap-1">
                        <FileSearch className="w-3 h-3" />
                        OCR
                    </span>
                );
            case 'processing':
                return (
                    <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded border border-blue-500/30 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Processing
                    </span>
                );
            case 'failed':
                return (
                    <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs rounded border border-red-500/30 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        OCR Failed
                    </span>
                );
            case 'pending':
                return (
                    <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded border border-yellow-500/30 flex items-center gap-1">
                        <FileSearch className="w-3 h-3" />
                        Pending
                    </span>
                );
            default:
                return null;
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            // Validate file size (50MB max)
            const maxSize = 50 * 1024 * 1024; // 50MB
            if (file.size > maxSize) {
                toast.error(`File too large. Maximum size is 50MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`);
                e.target.value = ''; // Clear input
                return;
            }
            
            // Validate file type
            const allowedTypes = [
                'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
                'application/pdf',
                'video/mp4', 'video/mpeg', 'video/quicktime',
                'audio/mpeg', 'audio/wav', 'audio/mp3',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ];
            
            if (!allowedTypes.includes(file.type)) {
                toast.error('Invalid file type. Please upload an image, PDF, video, audio, or document file.');
                e.target.value = ''; // Clear input
                return;
            }
            
            // Validate file extension (additional security)
            const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.mp4', '.mpeg', '.mov', '.mp3', '.wav', '.doc', '.docx'];
            const fileName = file.name.toLowerCase();
            const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
            
            if (!hasValidExtension) {
                toast.error('Invalid file extension. Please check the file type.');
                e.target.value = ''; // Clear input
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
            // Validate file size (50MB max)
            const maxSize = 50 * 1024 * 1024;
            if (file.size > maxSize) {
                toast.error(`File too large. Maximum size is 50MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`);
                return;
            }
            
            // Validate file type
            const allowedTypes = [
                'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
                'application/pdf',
                'video/mp4', 'video/mpeg', 'video/quicktime',
                'audio/mpeg', 'audio/wav', 'audio/mp3',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ];
            
            if (!allowedTypes.includes(file.type)) {
                toast.error('Invalid file type. Please upload an image, PDF, video, audio, or document file.');
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

    const handlePreview = (item) => {
        if (!canPreview(item.mimeType)) {
            toast.error('This file type cannot be previewed. Please download it instead.');
            return;
        }
        setPreviewLoading(true);
        setImageZoom(1);
        setImageRotation(0);
        setViewingEvidence(item);
    };

    const closePreview = () => {
        setViewingEvidence(null);
        setPreviewLoading(false);
        setImageZoom(1);
        setImageRotation(0);
    };

    const handleDownload = async (item) => {
        try {
            setDownloading(item.id);
            const token = localStorage.getItem('token');
            
            // Create a link to download with proper authentication
            const response = await fetch(
                `http://localhost:5000/api/disputes/${disputeId}/evidence/${item.id}/download`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error('Download failed');
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = item.originalName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            toast.success('Download started');
        } catch (error) {
            console.error('Download failed:', error);
            toast.error('Failed to download file');
        } finally {
            setDownloading(null);
        }
    };

    const getFileIcon = (fileType) => {
        switch (fileType) {
            case 'image': return <Image className="w-5 h-5" />;
            case 'video': return <Video className="w-5 h-5" />;
            case 'audio': return <FileAudio className="w-5 h-5" />;
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

    // Filter message attachments that have attachmentPath
    const filteredMessageAttachments = messageAttachments.filter(msg => msg.attachmentPath);

    return (
        <div className="bg-slate-800/50 rounded-lg border border-blue-800 p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <Paperclip className="w-6 h-6 text-blue-400" />
                    <h3 className="text-xl font-bold text-blue-100">Evidence & Attachments</h3>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-blue-800">
                <button
                    onClick={() => setActiveTab('evidence')}
                    className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                        activeTab === 'evidence'
                            ? 'text-blue-100'
                            : 'text-blue-400 hover:text-blue-300'
                    }`}
                >
                    <span className="flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        Evidence Files
                        {evidence.length > 0 && (
                            <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded-full">
                                {evidence.length}
                            </span>
                        )}
                    </span>
                    {activeTab === 'evidence' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('attachments')}
                    className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                        activeTab === 'attachments'
                            ? 'text-blue-100'
                            : 'text-blue-400 hover:text-blue-300'
                    }`}
                >
                    <span className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        Message Attachments
                        {filteredMessageAttachments.length > 0 && (
                            <span className="px-1.5 py-0.5 bg-green-500/20 text-green-300 text-xs rounded-full">
                                {filteredMessageAttachments.length}
                            </span>
                        )}
                    </span>
                    {activeTab === 'attachments' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                    )}
                </button>
            </div>

            {/* Evidence Tab Content */}
            {activeTab === 'evidence' && (
                <>
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
                                    Supports: Images, Videos, Audio, PDFs, Documents (Max 50MB)
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
                    {/* Batch OCR Button - show if there are pending OCR files */}
                    {evidence.some(e => isOcrSupported(e.mimeType) && (e.ocrStatus === 'pending' || e.ocrStatus === 'failed')) && (
                        <button
                            onClick={handleProcessAllOcr}
                            disabled={processingAllOcr}
                            className="w-full px-3 py-2 bg-purple-600/20 text-purple-300 text-sm rounded border border-purple-600/30 hover:bg-purple-600/30 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {processingAllOcr ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Processing OCR...
                                </>
                            ) : (
                                <>
                                    <FileSearch className="w-4 h-4" />
                                    Extract Text from All Images (OCR)
                                </>
                            )}
                        </button>
                    )}

                    {evidence.map((item) => (
                        <div 
                            key={item.id} 
                            className="bg-slate-900/50 rounded-lg border border-blue-800/50 hover:border-blue-700 transition-colors overflow-hidden"
                        >
                            <div className="flex items-center gap-3 p-3">
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
                                        {getOcrStatusBadge(item)}
                                    </div>
                                    {item.description && (
                                        <p className="text-xs text-blue-300 mt-1 line-clamp-2">
                                            {item.description}
                                        </p>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1">
                                    {/* OCR Toggle Button */}
                                    {isOcrSupported(item.mimeType) && (
                                        <button
                                            onClick={() => toggleOcrExpand(item.id)}
                                            className={`p-2 rounded transition-colors ${
                                                expandedOcr[item.id] 
                                                    ? 'text-purple-300 bg-purple-500/20' 
                                                    : 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10'
                                            }`}
                                            title="View OCR Text"
                                        >
                                            <FileSearch className="w-4 h-4" />
                                        </button>
                                    )}
                                    {canPreview(item.mimeType) && (
                                        <button
                                            onClick={() => handlePreview(item)}
                                            className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                                            title="Preview"
                                        >
                                            <Eye className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleDownload(item)}
                                        disabled={downloading === item.id}
                                        className="p-2 text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded transition-colors disabled:opacity-50"
                                        title="Download"
                                    >
                                        {downloading === item.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Download className="w-4 h-4" />
                                        )}
                                    </button>
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

                            {/* OCR Expandable Section */}
                            {expandedOcr[item.id] && isOcrSupported(item.mimeType) && (
                                <div className="px-3 pb-3 border-t border-blue-800/30 mt-1 pt-3">
                                    {ocrLoading[item.id] ? (
                                        <div className="flex items-center gap-2 text-blue-300 text-sm">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Loading OCR data...
                                        </div>
                                    ) : ocrData[item.id]?.ocrStatus === 'completed' && ocrData[item.id]?.ocrText ? (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-blue-400 font-medium">Extracted Text (OCR)</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-blue-500">
                                                        {ocrData[item.id].ocrText.split(/\s+/).filter(w => w.length > 0).length} words
                                                    </span>
                                                    <button
                                                        onClick={() => copyOcrText(ocrData[item.id].ocrText)}
                                                        className="p-1 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded"
                                                        title="Copy text"
                                                    >
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="bg-slate-800/50 rounded p-3 max-h-48 overflow-y-auto">
                                                <pre className="text-xs text-blue-100 whitespace-pre-wrap font-mono leading-relaxed">
                                                    {ocrData[item.id].ocrText}
                                                </pre>
                                            </div>
                                        </div>
                                    ) : ocrData[item.id]?.ocrStatus === 'failed' || item.ocrStatus === 'failed' ? (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-red-400">
                                                OCR processing failed: {ocrData[item.id]?.ocrError || 'Unknown error'}
                                            </span>
                                            <button
                                                onClick={() => handleProcessOcr(item.id)}
                                                className="px-2 py-1 text-xs bg-blue-600/20 text-blue-300 rounded hover:bg-blue-600/30 flex items-center gap-1"
                                            >
                                                <RefreshCw className="w-3 h-3" />
                                                Retry
                                            </button>
                                        </div>
                                    ) : ocrData[item.id]?.ocrStatus === 'completed' && !ocrData[item.id]?.ocrText ? (
                                        <div className="text-xs text-blue-400">
                                            No text was extracted from this image. The image may not contain readable text.
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-blue-400">
                                                Text has not been extracted from this image yet.
                                            </span>
                                            <button
                                                onClick={() => handleProcessOcr(item.id)}
                                                disabled={ocrLoading[item.id]}
                                                className="px-2 py-1 text-xs bg-purple-600/20 text-purple-300 rounded hover:bg-purple-600/30 flex items-center gap-1 disabled:opacity-50"
                                            >
                                                {ocrLoading[item.id] ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <FileSearch className="w-3 h-3" />
                                                )}
                                                Extract Text
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            </>
            )}

            {/* Message Attachments Tab Content */}
            {activeTab === 'attachments' && (
                <div className="space-y-4">
                    {filteredMessageAttachments.length === 0 ? (
                        <div className="text-center py-12 text-blue-400">
                            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p className="text-sm">No attachments shared in the discussion yet</p>
                            <p className="text-xs text-blue-500 mt-1">Files shared in the case discussion will appear here</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {filteredMessageAttachments.map((msg) => {
                                const fileType = getFileTypeFromPath(msg.attachmentPath);
                                const fileName = getFileNameFromPath(msg.attachmentPath);
                                const fileUrl = getFileUrlFromPath(msg.attachmentPath);
                                
                                return (
                                    <div
                                        key={msg.id}
                                        className="bg-slate-900/50 rounded-lg border border-blue-800/50 overflow-hidden hover:border-blue-600 transition-colors"
                                    >
                                        {/* Thumbnail/Preview */}
                                        {fileType === 'image' ? (
                                            <div 
                                                className="relative h-32 bg-slate-800 cursor-pointer group"
                                                onClick={() => setViewingMessageAttachment({ type: 'image', url: fileUrl, name: fileName, sender: msg.senderName, role: msg.senderRole, time: msg.createdAt })}
                                            >
                                                <img
                                                    src={fileUrl}
                                                    alt={fileName}
                                                    className="w-full h-full object-cover"
                                                />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <Eye className="w-8 h-8 text-white" />
                                                </div>
                                            </div>
                                        ) : (
                                            <div 
                                                className="h-32 bg-slate-800 flex items-center justify-center cursor-pointer group hover:bg-slate-700/50 transition-colors"
                                                onClick={() => setViewingMessageAttachment({ type: fileType, url: fileUrl, name: fileName, sender: msg.senderName, role: msg.senderRole, time: msg.createdAt })}
                                            >
                                                {fileType === 'document' && (
                                                    <FileText className={`w-12 h-12 ${fileName.toLowerCase().endsWith('.pdf') ? 'text-red-400' : 'text-blue-400'}`} />
                                                )}
                                                {fileType === 'video' && <Video className="w-12 h-12 text-purple-400" />}
                                                {fileType === 'audio' && <FileAudio className="w-12 h-12 text-green-400" />}
                                                {fileType === 'file' && <File className="w-12 h-12 text-gray-400" />}
                                            </div>
                                        )}
                                        
                                        {/* File Info */}
                                        <div className="p-3">
                                            <p className="text-sm text-blue-100 truncate font-medium" title={fileName}>
                                                {fileName}
                                            </p>
                                            <div className="flex items-center justify-between mt-2">
                                                <div className="flex items-center gap-1.5">
                                                    <User className="w-3 h-3 text-blue-400" />
                                                    <span className="text-xs text-blue-300">{msg.senderName}</span>
                                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                        msg.senderRole === 'plaintiff' 
                                                            ? 'bg-blue-500/20 text-blue-300' 
                                                            : 'bg-slate-600/50 text-slate-300'
                                                    }`}>
                                                        {msg.senderRole}
                                                    </span>
                                                </div>
                                            </div>
                                            <p className="text-xs text-blue-500 mt-1">
                                                {new Date(msg.createdAt).toLocaleDateString()} at {new Date(msg.createdAt).toLocaleTimeString()}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Message Attachment Preview Modal */}
            {viewingMessageAttachment && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                    onClick={() => setViewingMessageAttachment(null)}
                >
                    <div 
                        className="relative w-full max-w-4xl max-h-[90vh] m-4 flex flex-col bg-slate-900 rounded-lg border border-blue-800 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 bg-slate-800 border-b border-blue-800">
                            <div className="flex items-center gap-3">
                                {viewingMessageAttachment.type === 'image' && <Image className="w-5 h-5 text-blue-400" />}
                                {viewingMessageAttachment.type === 'document' && <FileText className="w-5 h-5 text-red-400" />}
                                {viewingMessageAttachment.type === 'video' && <Video className="w-5 h-5 text-purple-400" />}
                                {viewingMessageAttachment.type === 'audio' && <FileAudio className="w-5 h-5 text-green-400" />}
                                <div>
                                    <p className="text-sm font-medium text-blue-100 truncate max-w-[300px]">{viewingMessageAttachment.name}</p>
                                    <p className="text-xs text-blue-400">
                                        Shared by {viewingMessageAttachment.sender} ({viewingMessageAttachment.role})
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <a
                                    href={viewingMessageAttachment.url}
                                    download
                                    className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded transition-colors"
                                    title="Download"
                                >
                                    <Download className="w-5 h-5" />
                                </a>
                                <button
                                    onClick={() => setViewingMessageAttachment(null)}
                                    className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[400px]">
                            {viewingMessageAttachment.type === 'image' && (
                                <img 
                                    src={viewingMessageAttachment.url} 
                                    alt={viewingMessageAttachment.name}
                                    className="max-w-full max-h-[70vh] object-contain rounded"
                                />
                            )}
                            {viewingMessageAttachment.type === 'document' && viewingMessageAttachment.name.toLowerCase().endsWith('.pdf') && (
                                <iframe
                                    src={viewingMessageAttachment.url}
                                    className="w-full h-[70vh] rounded border border-slate-700"
                                    title={viewingMessageAttachment.name}
                                />
                            )}
                            {viewingMessageAttachment.type === 'document' && !viewingMessageAttachment.name.toLowerCase().endsWith('.pdf') && (
                                <div className="text-center p-8">
                                    <FileText className="w-16 h-16 text-blue-400 mx-auto mb-4" />
                                    <p className="text-blue-100 mb-4">{viewingMessageAttachment.name}</p>
                                    <p className="text-sm text-gray-400 mb-4">Document preview not available</p>
                                    <a
                                        href={viewingMessageAttachment.url}
                                        download
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                                    >
                                        <Download className="w-4 h-4" />
                                        Download File
                                    </a>
                                </div>
                            )}
                            {viewingMessageAttachment.type === 'video' && (
                                <video
                                    src={viewingMessageAttachment.url}
                                    controls
                                    className="max-w-full max-h-[70vh] rounded"
                                >
                                    Your browser does not support video playback.
                                </video>
                            )}
                            {viewingMessageAttachment.type === 'audio' && (
                                <div className="text-center p-8">
                                    <FileAudio className="w-16 h-16 text-green-400 mx-auto mb-4" />
                                    <p className="text-blue-100 mb-4">{viewingMessageAttachment.name}</p>
                                    <audio
                                        src={viewingMessageAttachment.url}
                                        controls
                                        className="w-full max-w-md"
                                    >
                                        Your browser does not support audio playback.
                                    </audio>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Preview Modal */}
            {viewingEvidence && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <div className="relative w-full h-full max-w-6xl max-h-[90vh] m-4 flex flex-col">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 bg-slate-900/95 rounded-t-lg border-b border-blue-800">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500/20 rounded text-blue-400">
                                    {getFileIcon(viewingEvidence.fileType)}
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-blue-100 truncate max-w-md">
                                        {viewingEvidence.originalName}
                                    </h3>
                                    <p className="text-sm text-blue-400">
                                        {formatFileSize(viewingEvidence.fileSize)} • Uploaded by {viewingEvidence.uploaderName}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Image Controls */}
                                {viewingEvidence.fileType === 'image' && (
                                    <>
                                        <button
                                            onClick={() => setImageZoom(z => Math.max(0.5, z - 0.25))}
                                            className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded"
                                            title="Zoom Out"
                                        >
                                            <ZoomOut className="w-5 h-5" />
                                        </button>
                                        <span className="text-sm text-blue-300 min-w-[3rem] text-center">
                                            {Math.round(imageZoom * 100)}%
                                        </span>
                                        <button
                                            onClick={() => setImageZoom(z => Math.min(3, z + 0.25))}
                                            className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded"
                                            title="Zoom In"
                                        >
                                            <ZoomIn className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => setImageRotation(r => (r + 90) % 360)}
                                            className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded"
                                            title="Rotate"
                                        >
                                            <RotateCw className="w-5 h-5" />
                                        </button>
                                        <div className="w-px h-6 bg-blue-800 mx-1" />
                                    </>
                                )}
                                <button
                                    onClick={() => handleDownload(viewingEvidence)}
                                    disabled={downloading === viewingEvidence.id}
                                    className="p-2 text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded"
                                    title="Download"
                                >
                                    {downloading === viewingEvidence.id ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <Download className="w-5 h-5" />
                                    )}
                                </button>
                                <button
                                    onClick={closePreview}
                                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded"
                                    title="Close"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 bg-slate-900/95 rounded-b-lg overflow-auto flex items-center justify-center p-4">
                            {previewLoading && (
                                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10">
                                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                                </div>
                            )}

                            {/* Image Preview */}
                            {viewingEvidence.fileType === 'image' && (
                                <img
                                    src={`${getEvidencePreviewUrl(disputeId, viewingEvidence.id)}?token=${localStorage.getItem('token')}`}
                                    alt={viewingEvidence.originalName}
                                    className="max-w-full max-h-full object-contain transition-transform duration-200"
                                    style={{
                                        transform: `scale(${imageZoom}) rotate(${imageRotation}deg)`
                                    }}
                                    onLoad={() => setPreviewLoading(false)}
                                    onError={() => {
                                        setPreviewLoading(false);
                                        toast.error('Failed to load image');
                                    }}
                                />
                            )}

                            {/* Video Preview */}
                            {viewingEvidence.fileType === 'video' && (
                                <video
                                    controls
                                    autoPlay={false}
                                    className="max-w-full max-h-full"
                                    onLoadedData={() => setPreviewLoading(false)}
                                    onError={() => {
                                        setPreviewLoading(false);
                                        toast.error('Failed to load video');
                                    }}
                                >
                                    <source
                                        src={`${getEvidencePreviewUrl(disputeId, viewingEvidence.id)}?token=${localStorage.getItem('token')}`}
                                        type={viewingEvidence.mimeType}
                                    />
                                    Your browser does not support video playback.
                                </video>
                            )}

                            {/* Audio Preview */}
                            {viewingEvidence.fileType === 'audio' && (
                                <div className="w-full max-w-lg p-8 bg-slate-800/50 rounded-xl border border-blue-800">
                                    <div className="flex items-center justify-center mb-6">
                                        <div className="p-6 bg-blue-500/20 rounded-full">
                                            <Volume2 className="w-12 h-12 text-blue-400" />
                                        </div>
                                    </div>
                                    <p className="text-center text-blue-100 font-medium mb-4">
                                        {viewingEvidence.originalName}
                                    </p>
                                    <audio
                                        controls
                                        className="w-full"
                                        onLoadedData={() => setPreviewLoading(false)}
                                        onError={() => {
                                            setPreviewLoading(false);
                                            toast.error('Failed to load audio');
                                        }}
                                    >
                                        <source
                                            src={`${getEvidencePreviewUrl(disputeId, viewingEvidence.id)}?token=${localStorage.getItem('token')}`}
                                            type={viewingEvidence.mimeType}
                                        />
                                        Your browser does not support audio playback.
                                    </audio>
                                </div>
                            )}

                            {/* PDF Preview */}
                            {viewingEvidence.mimeType === 'application/pdf' && (
                                <iframe
                                    src={`${getEvidencePreviewUrl(disputeId, viewingEvidence.id)}?token=${localStorage.getItem('token')}`}
                                    className="w-full h-full min-h-[70vh] rounded border border-blue-800"
                                    title={viewingEvidence.originalName}
                                    onLoad={() => setPreviewLoading(false)}
                                    onError={() => {
                                        setPreviewLoading(false);
                                        toast.error('Failed to load PDF');
                                    }}
                                />
                            )}

                            {/* Document Preview (non-previewable) */}
                            {viewingEvidence.fileType === 'document' && viewingEvidence.mimeType !== 'application/pdf' && (
                                <div className="text-center p-8">
                                    <File className="w-16 h-16 mx-auto text-blue-400 mb-4" />
                                    <p className="text-blue-100 font-medium mb-2">
                                        {viewingEvidence.originalName}
                                    </p>
                                    <p className="text-blue-400 text-sm mb-4">
                                        This document type cannot be previewed in the browser.
                                    </p>
                                    <button
                                        onClick={() => handleDownload(viewingEvidence)}
                                        disabled={downloading === viewingEvidence.id}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2 mx-auto"
                                    >
                                        {downloading === viewingEvidence.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Download className="w-4 h-4" />
                                        )}
                                        Download to View
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer - Description */}
                        {viewingEvidence.description && (
                            <div className="p-4 bg-slate-900/95 border-t border-blue-800 rounded-b-lg">
                                <p className="text-sm text-blue-300">
                                    <span className="font-medium text-blue-200">Description: </span>
                                    {viewingEvidence.description}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Click outside to close */}
                    <div 
                        className="absolute inset-0 -z-10" 
                        onClick={closePreview}
                    />
                </div>
            )}
        </div>
    );
}
