// File Helper Utilities for Evidence Handling

/**
 * Get file type category from file path
 * @param {string} filePath - Path or filename 
 * @returns {string} - 'image' | 'document' | 'video' | 'audio' | 'file'
 */
export const getFileTypeFromPath = (filePath) => {
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

/**
 * Get file name from path
 * @param {string} filePath 
 * @returns {string}
 */
export const getFileNameFromPath = (filePath) => {
    if (!filePath) return 'Unknown file';
    const parts = filePath.split('/');
    return parts[parts.length - 1];
};

/**
 * Build full file URL from path
 * @param {string} filePath 
 * @param {string} baseUrl 
 * @returns {string}
 */
export const getFileUrlFromPath = (filePath, baseUrl = 'http://localhost:5000') => {
    if (!filePath) return '';
    if (filePath.startsWith('http')) return filePath;
    const cleanPath = filePath.replace(/^\.?\/?(?:uploads\/)?/, '');
    return `${baseUrl}/uploads/${cleanPath}`;
};

/**
 * Format file size to human-readable string
 * @param {number} bytes 
 * @returns {string}
 */
export const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// OCR supported MIME types
export const ocrSupportedTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
    'image/bmp', 'image/tiff', 'image/webp'
];

/**
 * Check if MIME type supports OCR
 * @param {string} mimeType 
 * @returns {boolean}
 */
export const isOcrSupportedType = (mimeType) => ocrSupportedTypes.includes(mimeType);

// Previewable MIME types
export const previewableTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/ogg'
];

/**
 * Check if MIME type can be previewed
 * @param {string} mimeType 
 * @returns {boolean}
 */
export const canPreviewType = (mimeType) => previewableTypes.includes(mimeType);

// Allowed upload types
export const allowedUploadTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'video/mp4', 'video/mpeg', 'video/quicktime',
    'audio/mpeg', 'audio/wav', 'audio/mp3',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

// Allowed upload extensions
export const allowedUploadExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf',
    '.mp4', '.mpeg', '.mov', '.mp3', '.wav', '.doc', '.docx'
];

// Max file size in bytes (50MB)
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Validate a file for upload
 * @param {File} file 
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateFile = (file) => {
    if (!file) return { valid: false, error: 'No file selected' };

    if (file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        return { valid: false, error: `File too large. Maximum size is 50MB. Your file is ${sizeMB}MB.` };
    }

    if (!allowedUploadTypes.includes(file.type)) {
        return { valid: false, error: 'Invalid file type. Please upload an image, PDF, video, audio, or document file.' };
    }

    const fileName = file.name.toLowerCase();
    const hasValidExtension = allowedUploadExtensions.some(ext => fileName.endsWith(ext));
    if (!hasValidExtension) {
        return { valid: false, error: 'Invalid file extension. Please check the file type.' };
    }

    return { valid: true };
};

/**
 * Get role badge color classes
 * @param {string} role 
 * @returns {string}
 */
export const getRoleBadgeColor = (role) => {
    if (role === 'admin') return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (role === 'plaintiff') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
};
