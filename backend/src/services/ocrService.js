
import { createWorker } from 'tesseract.js';
import path from 'path';
import fs from 'fs';
import { Evidence } from '../models/index.js';
import { logInfo, logError } from './logger.js';

// Supported file types for OCR
const OCR_SUPPORTED_MIMETYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/webp'
];

// Check if file type is supported for OCR
export function isOcrSupported(mimeType) {
    return OCR_SUPPORTED_MIMETYPES.includes(mimeType);
}

// Process OCR on a file
export async function processOcr(filePath, language = 'eng') {
    try {
        const worker = await createWorker(language, 1, {
            langPath: path.join(process.cwd()),
            logger: m => {
                if (m.status === 'recognizing text' && m.progress % 0.2 === 0) {
                    // Log progress occasionally to avoid spam
                    // logInfo('OCR Progress', { progress: Math.round(m.progress * 100) });
                }
            }
        });

        const { data: { text, confidence } } = await worker.recognize(filePath);
        await worker.terminate();

        return {
            success: true,
            text: text.trim(),
            confidence: Math.round(confidence),
            wordCount: text.trim().split(/\s+/).filter(w => w.length > 0).length
        };
    } catch (error) {
        logError('OCR Processing Error', { error: error.message, filePath });
        return {
            success: false,
            error: error.message
        };
    }
}

// Background OCR processing for evidence
export async function processEvidenceOcr(evidenceId) {
    try {
        const evidenceRecord = await Evidence.findByPk(evidenceId);

        if (!evidenceRecord) {
            logError('OCR: Evidence not found', { evidenceId });
            return { success: false, error: 'Evidence not found' };
        }

        // Check if file type supports OCR
        if (!isOcrSupported(evidenceRecord.mimeType)) {
            await evidenceRecord.update({
                ocrStatus: 'not_applicable',
                ocrProcessedAt: new Date()
            });
            return { success: true, status: 'not_applicable' };
        }

        // Update status to processing
        await evidenceRecord.update({ ocrStatus: 'processing' });

        const fileSource = evidenceRecord.fileName; // Now this will be a Cloudinary URL or filename
        let ocrInput;

        if (fileSource.startsWith('http')) {
            // Handle Cloudinary/Remote URL
            ocrInput = fileSource;
        } else {
            // Handle local file (backward compatibility)
            const filePath = path.join(process.cwd(), 'uploads', fileSource);
            if (!fs.existsSync(filePath)) {
                await evidenceRecord.update({
                    ocrStatus: 'failed',
                    ocrError: 'File not found on disk',
                    ocrProcessedAt: new Date()
                });
                return { success: false, error: 'File not found' };
            }
            ocrInput = filePath;
        }

        // Process OCR
        const result = await processOcr(ocrInput);

        if (result.success) {
            await evidenceRecord.update({
                ocrText: result.text,
                ocrStatus: 'completed',
                ocrProcessedAt: new Date(),
                ocrError: null
            });

            logInfo('OCR completed', {
                evidenceId,
                wordCount: result.wordCount,
                confidence: result.confidence
            });

            return {
                success: true,
                status: 'completed',
                text: result.text,
                wordCount: result.wordCount,
                confidence: result.confidence
            };
        } else {
            await evidenceRecord.update({
                ocrStatus: 'failed',
                ocrError: result.error,
                ocrProcessedAt: new Date()
            });

            return { success: false, error: result.error };
        }
    } catch (error) {
        logError('OCR Processing failed', { evidenceId, error: error.message });

        try {
            const evidenceRecord = await Evidence.findByPk(evidenceId);
            if (evidenceRecord) {
                await evidenceRecord.update({
                    ocrStatus: 'failed',
                    ocrError: error.message,
                    ocrProcessedAt: new Date()
                });
            }
        } catch (dbError) {
            // Ignore db error during error handling
        }

        return { success: false, error: error.message };
    }
}
