// Shared PDF Helper Functions
import PDFDocument from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import QRCode from 'qrcode';

// Status color mapping
export const getStatusInfo = (status) => {
    const statusMap = {
        'Pending': { label: 'Pending Review', color: '#f59e0b' },
        'Active': { label: 'Active - In Mediation', color: '#3b82f6' },
        'Analyzed': { label: 'AI Analysis Complete', color: '#8b5cf6' },
        'AwaitingDecision': { label: 'Awaiting Party Decision', color: '#f97316' },
        'AwaitingSignatures': { label: 'Awaiting Signatures', color: '#06b6d4' },
        'AdminReview': { label: 'Admin Review', color: '#6366f1' },
        'Resolved': { label: 'Resolved', color: '#10b981' },
        'ForwardedToCourt': { label: 'Forwarded to Court', color: '#ef4444' }
    };
    return statusMap[status] || { label: status, color: '#6b7280' };
};

// Create PDF helper functions for a document
export const createPdfHelpers = (doc) => ({
    addTitle: (text, size = 16) => {
        doc.fontSize(size).font('Helvetica-Bold').text(text, { align: 'center' });
        doc.moveDown(0.5);
    },

    addSectionHeader: (text) => {
        doc.fontSize(12).font('Helvetica-Bold').fillColor('black').text(text);
        doc.moveDown(0.3);
    },

    addSubHeader: (text) => {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#374151').text(text);
        doc.moveDown(0.2);
    },

    addBulletPoint: (label, value) => {
        if (value !== undefined) {
            // Label-value format
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#4b5563').text(label + ': ', { continued: true });
            doc.font('Helvetica').fillColor('black').text(value || 'N/A');
        } else {
            // Simple bullet format
            doc.fontSize(10).font('Helvetica').text(`• ${label}`);
        }
        doc.moveDown(0.2);
    },

    addNormalText: (text, options = {}) => {
        doc.fontSize(10).font('Helvetica').fillColor('black').text(text, options);
        doc.moveDown(0.3);
    },

    addSeparator: () => {
        const y = doc.y;
        doc.strokeColor('#e5e7eb').moveTo(50, y).lineTo(doc.page.width - 50, y).stroke();
        doc.strokeColor('black');
        doc.moveDown(0.5);
    }
});

// Generate document metadata
export const generateDocumentMetadata = () => {
    const documentId = uuidv4();
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const timestampISO = new Date().toISOString();
    return { documentId, timestamp, timestampISO };
};

// Generate verification hash
export const generateDocumentHash = (content) => {
    return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
};

// Generate QR code
export const generateQRCode = async (url) => {
    try {
        return await QRCode.toDataURL(url);
    } catch (err) {
        console.error('QR Code generation failed:', err);
        return '';
    }
};

export { PDFDocument };
