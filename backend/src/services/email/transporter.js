// Email Transporter Configuration
import nodemailer from 'nodemailer';

const EMAIL_CONFIG = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
};

let transporter = null;

export function initializeTransporter() {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('⚠️  Email notifications disabled: SMTP credentials not configured in .env file');
        return null;
    }

    try {
        transporter = nodemailer.createTransport(EMAIL_CONFIG);
        console.log('✅ Email service initialized successfully');
        return transporter;
    } catch (error) {
        console.error('❌ Failed to initialize email service:', error.message);
        return null;
    }
}

export function getTransporter() {
    return transporter;
}

export async function sendEmail(emailData) {
    if (!transporter) {
        console.log('📧 Email skipped (SMTP not configured):', emailData.to, '-', emailData.subject);
        return { success: false, message: 'SMTP not configured' };
    }

    try {
        const mailOptions = {
            from: `"MediaAI Dispute Resolution" <${process.env.SMTP_USER}>`,
            to: emailData.to,
            subject: emailData.subject,
            html: emailData.html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully:', emailData.to, '-', emailData.subject);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Email send failed:', error.message);
        return { success: false, error: error.message };
    }
}

// Initialize on module load
initializeTransporter();
