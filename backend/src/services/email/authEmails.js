// Authentication-related email templates and senders
import { sendEmail } from './transporter.js';
import { getFrontendUrl, getCurrentYear } from './templateHelpers.js';

// Template: Password Reset
export async function sendPasswordResetEmail(email, username, resetUrl) {
    return sendEmail({
        to: email,
        subject: 'Password Reset Request - MediaAI',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .button { display: inline-block; background: #667eea; color: white !important; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
                    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 5px; }
                    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header"><h1 style="margin: 0;">🔐 Password Reset Request</h1></div>
                    <div class="content">
                        <p>Hi <strong>${username}</strong>,</p>
                        <p>We received a request to reset your password for your MediaAI account.</p>
                        <p style="text-align: center;">
                            <a href="${resetUrl}" class="button">Reset Your Password</a>
                        </p>
                        <p style="text-align: center; color: #6b7280; font-size: 14px;">
                            Or copy and paste this link into your browser:<br>
                            <a href="${resetUrl}" style="color: #667eea; word-break: break-all;">${resetUrl}</a>
                        </p>
                        <div class="warning">
                            <strong>⚠️ Important:</strong>
                            <ul style="margin: 10px 0; padding-left: 20px;">
                                <li>This link will expire in <strong>1 hour</strong></li>
                                <li>If you didn't request this, please ignore this email</li>
                            </ul>
                        </div>
                    </div>
                    <div class="footer">
                        <p>MediaAI - AI-Powered Dispute Resolution</p>
                        <p style="font-size: 12px;">This is an automated email. Please do not reply.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    });
}

// Template: Password Changed Confirmation
export async function sendPasswordChangedEmail(email, username) {
    return sendEmail({
        to: email,
        subject: 'Password Changed Successfully - MediaAI',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .success-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 5px; }
                    .security-tips { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header"><h1 style="margin: 0;">✅ Password Changed</h1></div>
                    <div class="content">
                        <p>Hi <strong>${username}</strong>,</p>
                        <div class="success-box">
                            <strong>✓ Your password has been changed successfully!</strong>
                        </div>
                        <div class="security-tips">
                            <h3 style="margin-top: 0; color: #667eea;">🛡️ Security Tips:</h3>
                            <ul style="color: #4b5563;">
                                <li>Never share your password with anyone</li>
                                <li>Use a unique password for each account</li>
                                <li>Enable two-factor authentication when available</li>
                            </ul>
                        </div>
                        <p style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 5px;">
                            <strong>⚠️ Didn't change your password?</strong><br>
                            If you did not make this change, please contact support immediately.
                        </p>
                    </div>
                    <div class="footer">
                        <p>MediaAI - AI-Powered Dispute Resolution</p>
                    </div>
                </div>
            </body>
            </html>
        `
    });
}

// Template: Email Verification
export async function sendEmailVerification(email, username, verificationUrl) {
    return sendEmail({
        to: email,
        subject: 'Verify Your Email - AI Dispute Resolution Platform',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .button { display: inline-block; background: #4F46E5; color: white !important; padding: 14px 35px; text-decoration: none; border-radius: 8px; margin: 25px 0; font-weight: bold; font-size: 16px; }
                    .info-box { background: #EEF2FF; border-left: 4px solid #4F46E5; padding: 15px; margin: 20px 0; border-radius: 5px; }
                    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 5px; }
                    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div style="font-size: 48px; margin-bottom: 15px;">🎉</div>
                        <h1 style="margin: 0; font-size: 24px;">Welcome to AI Dispute Resolution!</h1>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Just one more step to get started</p>
                    </div>
                    <div class="content">
                        <p style="font-size: 16px;">Hi <strong>${username}</strong>,</p>
                        <p>Thank you for registering! To complete your registration and access all features, please verify your email address.</p>
                        <div class="info-box">
                            <strong>🔐 Why verify your email?</strong>
                            <ul style="margin: 10px 0; padding-left: 20px;">
                                <li>Secure your account and enable password recovery</li>
                                <li>Receive important case updates and notifications</li>
                                <li>Get access to all platform features</li>
                            </ul>
                        </div>
                        <p style="text-align: center;">
                            <a href="${verificationUrl}" class="button">✓ Verify My Email</a>
                        </p>
                        <p style="text-align: center; color: #6b7280; font-size: 14px;">
                            Or copy and paste this link into your browser:<br>
                            <a href="${verificationUrl}" style="color: #4F46E5; word-break: break-all;">${verificationUrl}</a>
                        </p>
                        <div class="warning">
                            <strong>⏰ This link expires in 24 hours</strong><br>
                            If you didn't create an account, you can safely ignore this email.
                        </div>
                    </div>
                    <div class="footer">
                        <p><strong>AI Dispute Resolution Platform</strong></p>
                        <p style="font-size: 12px;">Fair, Fast, and AI-Powered Justice</p>
                    </div>
                </div>
            </body>
            </html>
        `
    });
}

// Template: Email Verified Confirmation
export async function sendEmailVerifiedConfirmation(email, username) {
    return sendEmail({
        to: email,
        subject: 'Email Verified Successfully - MediaAI',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .success-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 5px; }
                    .button { display: inline-block; background: #10b981; color: white !important; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
                    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header"><h1 style="margin: 0;">✅ Email Verified!</h1></div>
                    <div class="content">
                        <p>Hi <strong>${username}</strong>,</p>
                        <div class="success-box">
                            <strong>🎉 Your email has been verified successfully!</strong>
                        </div>
                        <p>You now have full access to all features of the AI Dispute Resolution Platform.</p>
                        <p><strong>What's next?</strong></p>
                        <ol>
                            <li>Complete your profile with personal details</li>
                            <li>Enable two-factor authentication for extra security</li>
                            <li>File a new dispute or wait for case invitations</li>
                        </ol>
                        <p style="text-align: center;">
                            <a href="${getFrontendUrl()}/dashboard" class="button">Go to Dashboard</a>
                        </p>
                    </div>
                    <div class="footer">
                        <p>MediaAI - AI-Powered Dispute Resolution</p>
                    </div>
                </div>
            </body>
            </html>
        `
    });
}

// Template: Contact Reply
export async function sendContactReplyEmail(name, email, originalMessage, replyMessage) {
    return sendEmail({
        to: email,
        subject: 'Response to Your Inquiry - MediaAI Support',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .message-box { background: #ffffff; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; margin: 20px 0; }
                    .reply-box { background: #eff6ff; border-left: 4px solid #3B82F6; padding: 20px; border-radius: 4px; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
                    .label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold; margin-bottom: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header"><h1 style="margin: 0; font-size: 24px;">Support Response</h1></div>
                    <div class="content">
                        <p>Hi <strong>${name}</strong>,</p>
                        <p>Thank you for contacting MediaAI Support. An administrator has replied to your inquiry.</p>
                        <div class="label">Your Message:</div>
                        <div class="message-box"><i style="color: #6b7280;">"${originalMessage}"</i></div>
                        <div class="label">Our Response:</div>
                        <div class="reply-box">${replyMessage}</div>
                        <p>If you have any further questions, please don't hesitate to reach out again.</p>
                        <p style="margin-top: 30px; text-align: center;">
                            <a href="${getFrontendUrl()}" style="color: #3B82F6; text-decoration: none;">Return to MediaAI</a>
                        </p>
                    </div>
                    <div class="footer">
                        <p>MediaAI Dispute Resolution Platform</p>
                    </div>
                </div>
            </body>
            </html>
        `
    });
}
