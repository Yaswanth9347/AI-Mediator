import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Evidence = sequelize.define('evidence', {
    disputeId: { type: DataTypes.INTEGER, allowNull: false },
    uploadedBy: { type: DataTypes.INTEGER, allowNull: false }, // User ID
    uploaderName: { type: DataTypes.STRING, allowNull: false },
    uploaderRole: { type: DataTypes.STRING, allowNull: false }, // plaintiff, defendant, admin
    fileName: { type: DataTypes.STRING, allowNull: false }, // Stored filename
    originalName: { type: DataTypes.STRING, allowNull: false }, // Original filename
    fileSize: { type: DataTypes.INTEGER, allowNull: false }, // In bytes
    mimeType: { type: DataTypes.STRING, allowNull: false },
    fileType: { type: DataTypes.STRING, allowNull: false }, // image, document, video, audio
    description: { type: DataTypes.TEXT }, // Optional description of the evidence
    isVerified: { type: DataTypes.BOOLEAN, defaultValue: false }, // Admin verification
    // OCR Fields
    ocrText: { type: DataTypes.TEXT }, // Extracted text from OCR
    ocrStatus: { type: DataTypes.STRING, defaultValue: 'pending' }, // pending, processing, completed, failed, not_applicable
    ocrProcessedAt: { type: DataTypes.DATE }, // When OCR was completed
    ocrError: { type: DataTypes.STRING }, // Error message if OCR failed
}, {
    indexes: [
        { fields: ['disputeId'] },
        { fields: ['uploadedBy'] },
        { fields: ['createdAt'] },
        { fields: ['ocrStatus'] },
    ]
});

export default Evidence;
