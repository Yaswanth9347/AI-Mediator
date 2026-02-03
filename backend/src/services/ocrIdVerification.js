import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

class OCRIdVerificationService {
    constructor() {
        this.ocrServiceUrl = process.env.OCR_SERVICE_URL || 'http://localhost:8000';
        this.timeout = parseInt(process.env.OCR_TIMEOUT) || 30000; // 30 seconds
        this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024; // 5MB
        this.allowedMimeTypes = [
            'image/jpeg',
            'image/jpg', 
            'image/png',
            'application/pdf'
        ];
        this.retryAttempts = 3;
    }

    /**
     * Verify government ID document using OCR service
     * @param {Object} fileInfo - File information
     * @param {string} fileInfo.filePath - Path to uploaded file
     * @param {string} fileInfo.originalName - Original filename
     * @param {string} fileInfo.mimeType - MIME type of file
     * @param {number} fileInfo.size - File size in bytes
     * @returns {Promise<Object>} Verification result
     */
    async verifyGovernmentId(fileInfo) {
        try {
            console.log('OCR Service: Starting ID verification for file:', fileInfo.originalName);

            // Validate file
            this.validateFile(fileInfo);

            // Check if OCR service is available
            await this.checkServiceHealth();

            // Send file to OCR service with retry logic
            const result = await this.sendToOCRService(fileInfo);

            console.log('OCR Service: Verification completed successfully');
            return this.formatResponse(result, fileInfo);

        } catch (error) {
            console.error('OCR Service: Verification failed:', error.message);
            
            // Return structured error response
            return {
                isVerified: false,
                confidence: 0,
                documentType: null,
                extractedText: null,
                error: {
                    code: error.code || 'OCR_ERROR',
                    message: error.message,
                    details: error.details || null
                },
                metadata: {
                    filename: fileInfo.originalName,
                    timestamp: new Date().toISOString(),
                    serviceUrl: this.ocrServiceUrl
                }
            };
        }
    }

    /**
     * Validate uploaded file
     * @param {Object} fileInfo - File information
     * @throws {Error} If file is invalid
     */
    validateFile(fileInfo) {
        // Check file exists
        if (!fileInfo.filePath || !fs.existsSync(fileInfo.filePath)) {
            const error = new Error('File not found or path invalid');
            error.code = 'FILE_NOT_FOUND';
            throw error;
        }

        // Check file size
        if (fileInfo.size > this.maxFileSize) {
            const error = new Error(`File size exceeds limit of ${this.maxFileSize / 1024 / 1024}MB`);
            error.code = 'FILE_TOO_LARGE';
            throw error;
        }

        // Check MIME type
        if (!this.allowedMimeTypes.includes(fileInfo.mimeType)) {
            const error = new Error(`File type ${fileInfo.mimeType} not supported. Allowed types: ${this.allowedMimeTypes.join(', ')}`);
            error.code = 'INVALID_FILE_TYPE';
            throw error;
        }

        console.log('OCR Service: File validation passed');
    }

    /**
     * Check if OCR service is healthy and available
     * @returns {Promise<boolean>} Service health status
     * @throws {Error} If service is unavailable
     */
    async checkServiceHealth() {
        try {
            console.log('OCR Service: Checking health at:', `${this.ocrServiceUrl}/health`);
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout for health check

            const response = await fetch(`${this.ocrServiceUrl}/health`, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
            }

            const healthData = await response.json();
            console.log('OCR Service: Health check passed:', healthData);
            return true;

        } catch (error) {
            if (error.name === 'AbortError') {
                const timeoutError = new Error('OCR service health check timeout');
                timeoutError.code = 'SERVICE_TIMEOUT';
                throw timeoutError;
            }

            const serviceError = new Error(`OCR service unavailable: ${error.message}`);
            serviceError.code = 'SERVICE_UNAVAILABLE';
            serviceError.details = error.message;
            throw serviceError;
        }
    }

    /**
     * Send file to OCR service with retry logic
     * @param {Object} fileInfo - File information
     * @returns {Promise<Object>} OCR service response
     */
    async sendToOCRService(fileInfo) {
        let lastError;

        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                console.log(`OCR Service: Attempt ${attempt}/${this.retryAttempts} for file:`, fileInfo.originalName);

                const formData = new FormData();
                
                // Add file to form data
                const fileStream = fs.createReadStream(fileInfo.filePath);
                formData.append('file', fileStream, {
                    filename: fileInfo.originalName,
                    contentType: fileInfo.mimeType
                });

                // Create abort controller for timeout
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), this.timeout);

                // Send request to OCR service
                const response = await fetch(`${this.ocrServiceUrl}/api/v1/document/verify`, {
                    method: 'POST',
                    body: formData,
                    signal: controller.signal,
                    headers: {
                        ...formData.getHeaders()
                    }
                });

                clearTimeout(timeout);

                // Handle response
                if (!response.ok) {
                    const errorText = await response.text();
                    let errorMessage;
                    
                    try {
                        const errorJson = JSON.parse(errorText);
                        errorMessage = errorJson.detail || errorJson.message || errorText;
                    } catch {
                        errorMessage = errorText;
                    }

                    throw new Error(`OCR service error (${response.status}): ${errorMessage}`);
                }

                const result = await response.json();
                console.log(`OCR Service: Successfully processed file on attempt ${attempt}`);
                return result;

            } catch (error) {
                lastError = error;
                console.log(`OCR Service: Attempt ${attempt} failed:`, error.message);

                // If this is the last attempt or a non-retryable error, throw
                if (attempt === this.retryAttempts || this.isNonRetryableError(error)) {
                    break;
                }

                // Wait before retry (exponential backoff)
                const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
                console.log(`OCR Service: Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // If we get here, all attempts failed
        const error = new Error(`OCR service failed after ${this.retryAttempts} attempts: ${lastError.message}`);
        error.code = lastError.name === 'AbortError' ? 'SERVICE_TIMEOUT' : 'SERVICE_ERROR';
        error.details = lastError.message;
        throw error;
    }

    /**
     * Check if error should not be retried
     * @param {Error} error - Error to check
     * @returns {boolean} True if error should not be retried
     */
    isNonRetryableError(error) {
        // Don't retry client errors (4xx)
        if (error.message.includes('(4')) {
            return true;
        }

        // Don't retry file-related errors
        const nonRetryableCodes = ['FILE_NOT_FOUND', 'FILE_TOO_LARGE', 'INVALID_FILE_TYPE'];
        return nonRetryableCodes.includes(error.code);
    }

    /**
     * Format OCR service response into standardized format
     * @param {Object} ocrResult - Raw OCR service response
     * @param {Object} fileInfo - File information
     * @returns {Object} Formatted response
     */
    formatResponse(ocrResult, fileInfo) {
        // OCR service returns: {status, detected_document_type, confidence_score, failure_reason, extracted_fields, raw_ocr_text}
        const isVerified = ocrResult.status === 'verified';
        const confidence = Math.max(0, Math.min(100, (ocrResult.confidence_score || 0) * 100)); // Convert from 0-1 to 0-100
        
        return {
            isVerified,
            confidence,
            documentType: ocrResult.detected_document_type || null,
            extractedText: ocrResult.raw_ocr_text || null,
            extractedFields: ocrResult.extracted_fields || null,
            error: null,
            metadata: {
                filename: fileInfo.originalName,
                fileSize: fileInfo.size,
                mimeType: fileInfo.mimeType,
                timestamp: new Date().toISOString(),
                serviceUrl: this.ocrServiceUrl,
                processingTime: null
            },
            raw_response: process.env.NODE_ENV === 'development' ? ocrResult : undefined
        };
    }

    /**
     * Get service configuration
     * @returns {Object} Service configuration
     */
    getConfig() {
        return {
            serviceUrl: this.ocrServiceUrl,
            timeout: this.timeout,
            maxFileSize: this.maxFileSize,
            allowedMimeTypes: this.allowedMimeTypes,
            retryAttempts: this.retryAttempts
        };
    }
}

// Legacy wrapper functions for backward compatibility
function normalizeMimeType(mimeType, fileName = '') {
    if (!mimeType) return mimeType;

    if (mimeType === 'image/jpg') return 'image/jpeg';
    if (mimeType === 'application/x-pdf') return 'application/pdf';

    if (mimeType === 'application/octet-stream') {
        const ext = path.extname(fileName).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
        if (ext === '.png') return 'image/png';
        if (ext === '.pdf') return 'application/pdf';
    }

    return mimeType;
}

function isAllowedIdMimeType(mimeType, fileName = '') {
    const normalized = normalizeMimeType(mimeType, fileName);
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    return allowedTypes.includes(normalized);
}

// Legacy function for backward compatibility
async function verifyGovtIdDocument(filePath, mimeType, originalName = 'document') {
    const service = new OCRIdVerificationService();
    const fileInfo = {
        filePath,
        mimeType: normalizeMimeType(mimeType, originalName),
        originalName,
        size: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
    };

    const result = await service.verifyGovernmentId(fileInfo);
    
    // Convert new format to legacy format
    return {
        isValid: result.isVerified,
        status: result.isVerified ? 'verified' : 'rejected',
        detected_document_type: result.documentType || 'unknown',
        confidence_score: result.confidence || 0,
        extracted_fields: result.extractedText ? { text: result.extractedText } : null,
        failure_reason: result.error ? result.error.message : null
    };
}

// Create singleton instance
const ocrService = new OCRIdVerificationService();

export {
    OCRIdVerificationService,
    ocrService,
    verifyGovtIdDocument,
    isAllowedIdMimeType,
    normalizeMimeType
};
