import nodemailer from 'nodemailer';

// Email configuration
const EMAIL_CONFIG = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
};

// Create transporter
let transporter = null;

function initializeTransporter() {
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

// Initialize on module load
initializeTransporter();

// Email templates
const emailTemplates = {
    // 1. Case Created - Notify Respondent
    caseCreated: (dispute) => ({
        to: dispute.respondentEmail,
        subject: `Legal Notice: New Dispute Filed Against You - ${dispute.title}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
                    .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background-color: white; padding: 30px; border-radius: 0 0 8px 8px; }
                    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                    .button { display: inline-block; padding: 12px 30px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                    .warning { background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0; }
                    .details { background-color: #F3F4F6; padding: 15px; border-radius: 5px; margin: 15px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔔 Legal Dispute Notification</h1>
                    </div>
                    <div class="content">
                        <p>Dear <strong>${dispute.respondentName}</strong>,</p>
                        
                        <div class="warning">
                            <strong>⚠️ Action Required:</strong> A legal dispute has been filed against you on the MediaAI Dispute Resolution Platform.
                        </div>
                        
                        <div class="details">
                            <h3>Case Details:</h3>
                            <p><strong>Case ID:</strong> #${dispute.id}</p>
                            <p><strong>Title:</strong> ${dispute.title}</p>
                            <p><strong>Filed By:</strong> ${dispute.plaintiffName}</p>
                            <p><strong>Filed On:</strong> ${new Date(dispute.createdAt).toLocaleDateString()}</p>
                            <p><strong>Description:</strong> ${dispute.description.substring(0, 200)}${dispute.description.length > 200 ? '...' : ''}</p>
                        </div>
                        
                        <p><strong>What happens next?</strong></p>
                        <ul>
                            <li>You must accept or reject this case within 7 days</li>
                            <li>If accepted, you'll enter AI-mediated dispute resolution</li>
                            <li>Both parties will discuss the matter through our platform</li>
                            <li>AI will analyze the case and propose fair solutions</li>
                        </ul>
                        
                        <center>
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/disputes/${dispute.id}" class="button">
                                View Case Details & Respond
                            </a>
                        </center>
                        
                        <p style="margin-top: 30px; color: #666; font-size: 14px;">
                            <em>Note: This is an automated notification from MediaAI Dispute Resolution System. Failing to respond may result in default judgment.</em>
                        </p>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} MediaAI Dispute Resolution Platform. All rights reserved.</p>
                        <p>This email contains legal information. Please do not ignore.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // 2. Respondent Accepted Case - Notify Plaintiff
    caseAccepted: (dispute) => ({
        to: dispute.plaintiffEmail,
        subject: `Case Update: Respondent Accepted Your Dispute - ${dispute.title}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
                    .header { background-color: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background-color: white; padding: 30px; border-radius: 0 0 8px 8px; }
                    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                    .button { display: inline-block; padding: 12px 30px; background-color: #10B981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                    .success { background-color: #D1FAE5; border-left: 4px solid #10B981; padding: 15px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>✅ Case Accepted</h1>
                    </div>
                    <div class="content">
                        <p>Dear <strong>${dispute.plaintiffName}</strong>,</p>
                        
                        <div class="success">
                            <strong>Good News:</strong> ${dispute.respondentName} has accepted your dispute and agreed to participate in AI-mediated resolution.
                        </div>
                        
                        <p><strong>Next Steps:</strong></p>
                        <ol>
                            <li>Both parties can now start discussing the matter</li>
                            <li>Exchange at least 10 messages to provide context</li>
                            <li>AI will analyze the conversation and propose solutions</li>
                            <li>Review AI-generated solutions and make your decision</li>
                        </ol>
                        
                        <center>
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/disputes/${dispute.id}" class="button">
                                Start Discussion
                            </a>
                        </center>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} MediaAI Dispute Resolution Platform</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // 3. AI Analysis Ready - Notify Both Parties
    aiAnalysisReady: (dispute, userEmail, userName) => ({
        to: userEmail,
        subject: `AI Analysis Complete: Solutions Ready for Review - ${dispute.title}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
                    .header { background-color: #8B5CF6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background-color: white; padding: 30px; border-radius: 0 0 8px 8px; }
                    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                    .button { display: inline-block; padding: 12px 30px; background-color: #8B5CF6; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                    .highlight { background-color: #EDE9FE; border-left: 4px solid #8B5CF6; padding: 15px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🤖 AI Analysis Complete</h1>
                    </div>
                    <div class="content">
                        <p>Dear <strong>${userName}</strong>,</p>
                        
                        <div class="highlight">
                            <strong>🎯 Milestone Reached:</strong> Our AI has completed analyzing your dispute and has generated resolution proposals.
                        </div>
                        
                        <p><strong>Case:</strong> ${dispute.title}</p>
                        
                        <p>The AI has reviewed your discussion, understood the context, and generated multiple resolution options tailored to your specific situation.</p>
                        
                        <p><strong>Action Required:</strong></p>
                        <ul>
                            <li>Review the AI-generated solutions carefully</li>
                            <li>Accept a solution that works for you, or</li>
                            <li>Reject and request reanalysis (up to 3 times)</li>
                        </ul>
                        
                        <center>
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/disputes/${dispute.id}" class="button">
                                Review AI Solutions
                            </a>
                        </center>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} MediaAI Dispute Resolution Platform</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // 4. Resolution Accepted - Both Parties Agreed
    resolutionAccepted: (dispute, userEmail, userName) => ({
        to: userEmail,
        subject: `Resolution Accepted: Proceed to Verification - ${dispute.title}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
                    .header { background-color: #059669; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background-color: white; padding: 30px; border-radius: 0 0 8px 8px; }
                    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                    .button { display: inline-block; padding: 12px 30px; background-color: #059669; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                    .success { background-color: #D1FAE5; border-left: 4px solid #059669; padding: 15px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎉 Resolution Agreement Reached</h1>
                    </div>
                    <div class="content">
                        <p>Dear <strong>${userName}</strong>,</p>
                        
                        <div class="success">
                            <strong>Excellent Progress:</strong> Both parties have accepted the AI-proposed resolution! The case is moving toward final settlement.
                        </div>
                        
                        <p><strong>Case:</strong> ${dispute.title}</p>
                        
                        <p><strong>Next Steps to Finalize:</strong></p>
                        <ol>
                            <li><strong>Verify Your Details:</strong> Confirm your personal information is correct</li>
                            <li><strong>Digital Signature:</strong> Sign the settlement agreement electronically</li>
                            <li><strong>Admin Review:</strong> Agreement will be reviewed for authenticity</li>
                            <li><strong>Official Document:</strong> Receive legally binding settlement PDF</li>
                        </ol>
                        
                        <center>
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/disputes/${dispute.id}" class="button">
                                Complete Verification
                            </a>
                        </center>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} MediaAI Dispute Resolution Platform</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // 5. Case Resolved - Final Settlement
    caseResolved: (dispute, userEmail, userName) => ({
        to: userEmail,
        subject: `Case Officially Resolved - Settlement Document Available - ${dispute.title}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
                    .header { background-color: #2563EB; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background-color: white; padding: 30px; border-radius: 0 0 8px 8px; }
                    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                    .button { display: inline-block; padding: 12px 30px; background-color: #2563EB; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                    .resolved { background-color: #DBEAFE; border-left: 4px solid #2563EB; padding: 15px; margin: 20px 0; }
                    .document-info { background-color: #F3F4F6; padding: 15px; border-radius: 5px; margin: 15px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🏆 Case Officially Resolved</h1>
                    </div>
                    <div class="content">
                        <p>Dear <strong>${userName}</strong>,</p>
                        
                        <div class="resolved">
                            <strong>🎊 Congratulations!</strong> Your dispute has been officially resolved and the settlement agreement is now legally binding.
                        </div>
                        
                        <p><strong>Case:</strong> ${dispute.title}</p>
                        
                        ${dispute.documentId ? `
                        <div class="document-info">
                            <h3>📄 Settlement Document Details:</h3>
                            <p><strong>Document ID:</strong> ${dispute.documentId}</p>
                            <p><strong>Hash:</strong> ${dispute.documentHash?.substring(0, 32)}...</p>
                            <p><strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>
                            <p><strong>Status:</strong> Legally Binding</p>
                        </div>
                        ` : ''}
                        
                        <p><strong>Important Information:</strong></p>
                        <ul>
                            <li>The settlement document includes QR code verification</li>
                            <li>Digital signatures from both parties are embedded</li>
                            <li>Document is secured with SHA-256 cryptographic hash</li>
                            <li>Download and save the PDF for your records</li>
                        </ul>
                        
                        <center>
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/disputes/${dispute.id}" class="button">
                                Download Settlement Document
                            </a>
                        </center>
                        
                        <p style="margin-top: 30px; font-size: 14px; color: #666;">
                            <em>Thank you for using MediaAI Dispute Resolution Platform. We're glad we could help resolve your matter efficiently.</em>
                        </p>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} MediaAI Dispute Resolution Platform</p>
                        <p>Keep this email for your records</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // 6. Court Forwarding - Case Escalated
    courtForwarded: (dispute, userEmail, userName) => ({
        to: userEmail,
        subject: `Case Forwarded to Court - ${dispute.courtType} Court - ${dispute.title}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
                    .header { background-color: #EA580C; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background-color: white; padding: 30px; border-radius: 0 0 8px 8px; }
                    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                    .warning { background-color: #FED7AA; border-left: 4px solid #EA580C; padding: 15px; margin: 20px 0; }
                    .court-details { background-color: #F3F4F6; padding: 15px; border-radius: 5px; margin: 15px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>⚖️ Case Forwarded to Court</h1>
                    </div>
                    <div class="content">
                        <p>Dear <strong>${userName}</strong>,</p>
                        
                        <div class="warning">
                            <strong>Important Notice:</strong> Your dispute could not be resolved through AI-mediation and has been forwarded to the traditional court system.
                        </div>
                        
                        <p><strong>Original Case:</strong> ${dispute.title}</p>
                        
                        <div class="court-details">
                            <h3>🏛️ Court Information:</h3>
                            <p><strong>Court Type:</strong> ${dispute.courtType} Court</p>
                            <p><strong>Court Name:</strong> ${dispute.courtName}</p>
                            <p><strong>Location:</strong> ${dispute.courtLocation}</p>
                            <p><strong>Forwarded On:</strong> ${new Date(dispute.courtForwardedAt).toLocaleDateString()}</p>
                            ${dispute.courtReason ? `<p><strong>Reason:</strong> ${dispute.courtReason}</p>` : ''}
                        </div>
                        
                        <p><strong>What This Means:</strong></p>
                        <ul>
                            <li>The case is now closed on MediaAI platform</li>
                            <li>Traditional legal proceedings will commence</li>
                            <li>You will receive further instructions from the court</li>
                            <li>All case documentation has been preserved</li>
                        </ul>
                        
                        <p><strong>Next Steps:</strong></p>
                        <ol>
                            <li>Wait for official court summons</li>
                            <li>Consider consulting a lawyer</li>
                            <li>Prepare all relevant documents and evidence</li>
                            <li>Attend court hearings as notified</li>
                        </ol>
                        
                        <p style="margin-top: 30px; color: #666; font-size: 14px;">
                            <em>This is a formal legal notification. Please take appropriate action and seek legal counsel if necessary.</em>
                        </p>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} MediaAI Dispute Resolution Platform</p>
                        <p>This case has been transferred to judicial authority</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // 7. Reanalysis Requested
    reanalysisRequested: (dispute, userEmail, userName, reanalysisCount) => ({
        to: userEmail,
        subject: `Reanalysis Requested - AI Reviewing Case Again - ${dispute.title}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
                    .header { background-color: #7C3AED; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background-color: white; padding: 30px; border-radius: 0 0 8px 8px; }
                    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                    .info { background-color: #EDE9FE; border-left: 4px solid #7C3AED; padding: 15px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔄 AI Reanalysis In Progress</h1>
                    </div>
                    <div class="content">
                        <p>Dear <strong>${userName}</strong>,</p>
                        
                        <div class="info">
                            <strong>Notice:</strong> A reanalysis has been requested for your dispute. The AI is reviewing the case again to generate alternative solutions.
                        </div>
                        
                        <p><strong>Case:</strong> ${dispute.title}</p>
                        <p><strong>Reanalysis Count:</strong> ${reanalysisCount} of 3</p>
                        
                        <p>The AI will review all messages and context again to provide fresh perspectives and new resolution options.</p>
                        
                        <p><strong>You will be notified when:</strong></p>
                        <ul>
                            <li>New AI solutions are ready for review</li>
                            <li>Analysis is complete (typically within minutes)</li>
                        </ul>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} MediaAI Dispute Resolution Platform</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // 8. Contact Reply Email - Notify User of Admin Response
    contactReply: (name, email, originalMessage, replyMessage) => ({
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
                    <div class="header">
                        <h1 style="margin: 0; font-size: 24px;">Support Response</h1>
                    </div>
                    <div class="content">
                        <p>Hi <strong>${name}</strong>,</p>
                        
                        <p>Thank you for contacting MediaAI Support. An administrator has replied to your inquiry.</p>
                        
                        <div class="label">Your Message:</div>
                        <div class="message-box">
                            <i style="color: #6b7280;">"${originalMessage}"</i>
                        </div>
                        
                        <div class="label">Our Response:</div>
                        <div class="reply-box">
                            ${replyMessage}
                        </div>
                        
                        <p>If you have any further questions, please don't hesitate to reach out again.</p>
                        
                        <p style="margin-top: 30px; text-align: center;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" style="color: #3B82F6; text-decoration: none;">Return to MediaAI</a>
                        </p>
                    </div>
                    <div class="footer">
                        <p>MediaAI Dispute Resolution Platform</p>
                        <p style="font-size: 12px; color: #9ca3af;">This is an automated email. Please do not reply directly to this message regarding a new issue.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    })
};

// Helper function to send email
async function sendEmail(emailData) {
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

// Public API functions
export default {
    // 1. Send case created notification to respondent
    notifyCaseCreated: async (dispute) => {
        const emailData = emailTemplates.caseCreated(dispute);
        return await sendEmail(emailData);
    },

    // 2. Send case accepted notification to plaintiff
    notifyCaseAccepted: async (dispute) => {
        const emailData = emailTemplates.caseAccepted(dispute);
        return await sendEmail(emailData);
    },

    // 3. Send AI analysis ready to both parties
    notifyAIAnalysisReady: async (dispute) => {
        const results = await Promise.all([
            sendEmail(emailTemplates.aiAnalysisReady(dispute, dispute.plaintiffEmail, dispute.plaintiffName)),
            sendEmail(emailTemplates.aiAnalysisReady(dispute, dispute.respondentEmail, dispute.respondentName))
        ]);
        return results;
    },

    // 4. Send resolution accepted to both parties
    notifyResolutionAccepted: async (dispute) => {
        const results = await Promise.all([
            sendEmail(emailTemplates.resolutionAccepted(dispute, dispute.plaintiffEmail, dispute.plaintiffName)),
            sendEmail(emailTemplates.resolutionAccepted(dispute, dispute.respondentEmail, dispute.respondentName))
        ]);
        return results;
    },

    // 5. Send case resolved to both parties
    notifyCaseResolved: async (dispute) => {
        const results = await Promise.all([
            sendEmail(emailTemplates.caseResolved(dispute, dispute.plaintiffEmail, dispute.plaintiffName)),
            sendEmail(emailTemplates.caseResolved(dispute, dispute.respondentEmail, dispute.respondentName))
        ]);
        return results;
    },

    // 6. Send court forwarded to both parties
    notifyCourtForwarded: async (dispute) => {
        const results = await Promise.all([
            sendEmail(emailTemplates.courtForwarded(dispute, dispute.plaintiffEmail, dispute.plaintiffName)),
            sendEmail(emailTemplates.courtForwarded(dispute, dispute.respondentEmail, dispute.respondentName))
        ]);
        return results;
    },

    // 7. Send reanalysis requested to both parties
    notifyReanalysisRequested: async (dispute, reanalysisCount) => {
        const results = await Promise.all([
            sendEmail(emailTemplates.reanalysisRequested(dispute, dispute.plaintiffEmail, dispute.plaintiffName, reanalysisCount)),
            sendEmail(emailTemplates.reanalysisRequested(dispute, dispute.respondentEmail, dispute.respondentName, reanalysisCount))
        ]);
        return results;
    },

    // 8. Send password reset email
    sendPasswordResetEmail: async (email, username, resetUrl) => {
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
                        <div class="header">
                            <h1 style="margin: 0;">🔐 Password Reset Request</h1>
                        </div>
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
                                    <li>Your password won't change until you create a new one</li>
                                </ul>
                            </div>
                            
                            <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
                                If you're having trouble clicking the button, contact our support team.
                            </p>
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
    },

    // 9. Send password changed confirmation
    sendPasswordChangedEmail: async (email, username) => {
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
                        <div class="header">
                            <h1 style="margin: 0;">✅ Password Changed</h1>
                        </div>
                        <div class="content">
                            <p>Hi <strong>${username}</strong>,</p>
                            
                            <div class="success-box">
                                <strong>✓ Your password has been changed successfully!</strong>
                            </div>
                            
                            <p>Your MediaAI account password was recently updated. You can now use your new password to log in.</p>
                            
                            <div class="security-tips">
                                <h3 style="margin-top: 0; color: #667eea;">🛡️ Security Tips:</h3>
                                <ul style="color: #4b5563;">
                                    <li>Never share your password with anyone</li>
                                    <li>Use a unique password for each account</li>
                                    <li>Enable two-factor authentication when available</li>
                                    <li>Change your password regularly</li>
                                </ul>
                            </div>
                            
                            <p style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 5px;">
                                <strong>⚠️ Didn't change your password?</strong><br>
                                If you did not make this change, please contact support immediately as your account may be compromised.
                            </p>
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
    },

    // 10. Send email verification
    sendEmailVerification: async (email, username, verificationUrl) => {
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
                        .button:hover { background: #4338CA; }
                        .info-box { background: #EEF2FF; border-left: 4px solid #4F46E5; padding: 15px; margin: 20px 0; border-radius: 5px; }
                        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 5px; }
                        .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
                        .welcome-icon { font-size: 48px; margin-bottom: 15px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div class="welcome-icon">🎉</div>
                            <h1 style="margin: 0; font-size: 24px;">Welcome to AI Dispute Resolution!</h1>
                            <p style="margin: 10px 0 0 0; opacity: 0.9;">Just one more step to get started</p>
                        </div>
                        <div class="content">
                            <p style="font-size: 16px;">Hi <strong>${username}</strong>,</p>
                            
                            <p>Thank you for registering with the AI Dispute Resolution Platform! To complete your registration and access all features, please verify your email address.</p>
                            
                            <div class="info-box">
                                <strong>🔐 Why verify your email?</strong>
                                <ul style="margin: 10px 0; padding-left: 20px;">
                                    <li>Secure your account and enable password recovery</li>
                                    <li>Receive important case updates and notifications</li>
                                    <li>Get access to all platform features</li>
                                    <li>Ensure your legal communications are delivered</li>
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
                            
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">
                            
                            <p style="color: #6b7280; font-size: 14px;">
                                <strong>What's next after verification?</strong>
                            </p>
                            <ol style="color: #6b7280; font-size: 14px; padding-left: 20px;">
                                <li>Complete your profile with personal details</li>
                                <li>Enable two-factor authentication for extra security</li>
                                <li>File a new dispute or wait for case invitations</li>
                            </ol>
                        </div>
                        <div class="footer">
                            <p><strong>AI Dispute Resolution Platform</strong></p>
                            <p style="font-size: 12px;">Fair, Fast, and AI-Powered Justice</p>
                            <p style="font-size: 12px; color: #9ca3af;">This is an automated email. Please do not reply.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        });
    },

    // 11. Send email verified confirmation
    sendEmailVerifiedConfirmation: async (email, username) => {
        return sendEmail({
            to: email,
            subject: 'Email Verified Successfully - AI Dispute Resolution',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                        .button { display: inline-block; background: #10b981; color: white !important; padding: 14px 35px; text-decoration: none; border-radius: 8px; margin: 25px 0; font-weight: bold; }
                        .success-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 5px; }
                        .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div style="font-size: 48px; margin-bottom: 15px;">✅</div>
                            <h1 style="margin: 0;">Email Verified!</h1>
                        </div>
                        <div class="content">
                            <p>Hi <strong>${username}</strong>,</p>
                            
                            <div class="success-box">
                                <strong>🎉 Congratulations!</strong> Your email has been successfully verified. You now have full access to all platform features.
                            </div>
                            
                            <p><strong>You can now:</strong></p>
                            <ul>
                                <li>File new disputes and cases</li>
                                <li>Receive important notifications</li>
                                <li>Participate in AI-mediated resolutions</li>
                                <li>Access your full dispute history</li>
                            </ul>
                            
                            <p style="text-align: center;">
                                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard" class="button">Go to Dashboard</a>
                            </p>
                        </div>
                        <div class="footer">
                            <p>AI Dispute Resolution Platform</p>
                            <p style="font-size: 12px;">This is an automated email. Please do not reply.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        });
    },

    // 12. Send contact reply email
    sendContactReplyEmail: async (name, email, originalMessage, replyMessage) => {
        const emailData = emailTemplates.contactReply(name, email, originalMessage, replyMessage);
        return await sendEmail(emailData);
    },

    // Test function to verify email configuration
    testEmailConfiguration: async () => {
        if (!transporter) {
            return { success: false, message: 'SMTP not configured' };
        }

        try {
            await transporter.verify();
            return { success: true, message: 'Email configuration is valid' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }
};
