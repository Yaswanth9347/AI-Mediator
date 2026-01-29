// Dispute-related email templates and senders
import { sendEmail } from './transporter.js';
import { getFrontendUrl, getCurrentYear } from './templateHelpers.js';

// Template: Case Created - Notify Respondent
const caseCreatedTemplate = (dispute) => ({
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
                <div class="header"><h1>🔔 Legal Dispute Notification</h1></div>
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
                    <center><a href="${getFrontendUrl()}/disputes/${dispute.id}" class="button">View Case Details & Respond</a></center>
                    <p style="margin-top: 30px; color: #666; font-size: 14px;">
                        <em>Note: This is an automated notification. Failing to respond may result in default judgment.</em>
                    </p>
                </div>
                <div class="footer">
                    <p>&copy; ${getCurrentYear()} MediaAI Dispute Resolution Platform. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `
});

// Template: Case Accepted
const caseAcceptedTemplate = (dispute) => ({
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
                <div class="header"><h1>✅ Case Accepted</h1></div>
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
                    <center><a href="${getFrontendUrl()}/disputes/${dispute.id}" class="button">Start Discussion</a></center>
                </div>
                <div class="footer"><p>&copy; ${getCurrentYear()} MediaAI Dispute Resolution Platform</p></div>
            </div>
        </body>
        </html>
    `
});

// Template: AI Analysis Ready
const aiAnalysisReadyTemplate = (dispute, userEmail, userName) => ({
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
                <div class="header"><h1>🤖 AI Analysis Complete</h1></div>
                <div class="content">
                    <p>Dear <strong>${userName}</strong>,</p>
                    <div class="highlight">
                        <strong>🎯 Milestone Reached:</strong> Our AI has completed analyzing your dispute and has generated resolution proposals.
                    </div>
                    <p><strong>Case:</strong> ${dispute.title}</p>
                    <p>The AI has reviewed your discussion and generated multiple resolution options tailored to your specific situation.</p>
                    <p><strong>Action Required:</strong></p>
                    <ul>
                        <li>Review the AI-generated solutions carefully</li>
                        <li>Accept a solution that works for you, or</li>
                        <li>Reject and request reanalysis (up to 3 times)</li>
                    </ul>
                    <center><a href="${getFrontendUrl()}/disputes/${dispute.id}" class="button">Review AI Solutions</a></center>
                </div>
                <div class="footer"><p>&copy; ${getCurrentYear()} MediaAI Dispute Resolution Platform</p></div>
            </div>
        </body>
        </html>
    `
});

// Template: Resolution Accepted
const resolutionAcceptedTemplate = (dispute, userEmail, userName) => ({
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
                <div class="header"><h1>🎉 Resolution Agreement Reached</h1></div>
                <div class="content">
                    <p>Dear <strong>${userName}</strong>,</p>
                    <div class="success">
                        <strong>Excellent Progress:</strong> Both parties have accepted the AI-proposed resolution!
                    </div>
                    <p><strong>Case:</strong> ${dispute.title}</p>
                    <p><strong>Next Steps to Finalize:</strong></p>
                    <ol>
                        <li><strong>Verify Your Details:</strong> Confirm your personal information is correct</li>
                        <li><strong>Digital Signature:</strong> Sign the settlement agreement electronically</li>
                        <li><strong>Admin Review:</strong> Agreement will be reviewed for authenticity</li>
                        <li><strong>Official Document:</strong> Receive legally binding settlement PDF</li>
                    </ol>
                    <center><a href="${getFrontendUrl()}/disputes/${dispute.id}" class="button">Complete Verification</a></center>
                </div>
                <div class="footer"><p>&copy; ${getCurrentYear()} MediaAI Dispute Resolution Platform</p></div>
            </div>
        </body>
        </html>
    `
});

// Template: Case Resolved
const caseResolvedTemplate = (dispute, userEmail, userName) => ({
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
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header"><h1>🏆 Case Officially Resolved</h1></div>
                <div class="content">
                    <p>Dear <strong>${userName}</strong>,</p>
                    <div class="resolved">
                        <strong>🎊 Congratulations!</strong> Your dispute has been officially resolved and the settlement agreement is now legally binding.
                    </div>
                    <p><strong>Case:</strong> ${dispute.title}</p>
                    <p><strong>Important Information:</strong></p>
                    <ul>
                        <li>The settlement document includes QR code verification</li>
                        <li>Digital signatures from both parties are embedded</li>
                        <li>Document is secured with SHA-256 cryptographic hash</li>
                        <li>Download and save the PDF for your records</li>
                    </ul>
                    <center><a href="${getFrontendUrl()}/disputes/${dispute.id}" class="button">Download Settlement Document</a></center>
                </div>
                <div class="footer"><p>&copy; ${getCurrentYear()} MediaAI Dispute Resolution Platform</p></div>
            </div>
        </body>
        </html>
    `
});

// Template: Court Forwarded
const courtForwardedTemplate = (dispute, userEmail, userName) => ({
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
                <div class="header"><h1>⚖️ Case Forwarded to Court</h1></div>
                <div class="content">
                    <p>Dear <strong>${userName}</strong>,</p>
                    <div class="warning">
                        <strong>Important Notice:</strong> Your dispute could not be resolved through AI-mediation and has been forwarded to the traditional court system.
                    </div>
                    <div class="court-details">
                        <h3>🏛️ Court Information:</h3>
                        <p><strong>Court Type:</strong> ${dispute.courtType} Court</p>
                        <p><strong>Court Name:</strong> ${dispute.courtName}</p>
                        <p><strong>Location:</strong> ${dispute.courtLocation}</p>
                        <p><strong>Forwarded On:</strong> ${new Date(dispute.courtForwardedAt).toLocaleDateString()}</p>
                    </div>
                    <p><strong>Next Steps:</strong></p>
                    <ol>
                        <li>Wait for official court summons</li>
                        <li>Consider consulting a lawyer</li>
                        <li>Prepare all relevant documents and evidence</li>
                        <li>Attend court hearings as notified</li>
                    </ol>
                </div>
                <div class="footer"><p>&copy; ${getCurrentYear()} MediaAI Dispute Resolution Platform</p></div>
            </div>
        </body>
        </html>
    `
});

// Template: Reanalysis Requested
const reanalysisRequestedTemplate = (dispute, userEmail, userName, reanalysisCount) => ({
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
                <div class="header"><h1>🔄 AI Reanalysis In Progress</h1></div>
                <div class="content">
                    <p>Dear <strong>${userName}</strong>,</p>
                    <div class="info">
                        <strong>Notice:</strong> A reanalysis has been requested for your dispute. The AI is reviewing the case again.
                    </div>
                    <p><strong>Case:</strong> ${dispute.title}</p>
                    <p><strong>Reanalysis Count:</strong> ${reanalysisCount} of 3</p>
                    <p>You will be notified when new AI solutions are ready for review.</p>
                </div>
                <div class="footer"><p>&copy; ${getCurrentYear()} MediaAI Dispute Resolution Platform</p></div>
            </div>
        </body>
        </html>
    `
});

// Exported functions
export async function notifyCaseCreated(dispute) {
    return sendEmail(caseCreatedTemplate(dispute));
}

export async function notifyCaseAccepted(dispute) {
    return sendEmail(caseAcceptedTemplate(dispute));
}

export async function notifyAIAnalysisReady(dispute) {
    const results = await Promise.all([
        sendEmail(aiAnalysisReadyTemplate(dispute, dispute.plaintiffEmail, dispute.plaintiffName)),
        sendEmail(aiAnalysisReadyTemplate(dispute, dispute.respondentEmail, dispute.respondentName))
    ]);
    return results;
}

export async function notifyResolutionAccepted(dispute) {
    const results = await Promise.all([
        sendEmail(resolutionAcceptedTemplate(dispute, dispute.plaintiffEmail, dispute.plaintiffName)),
        sendEmail(resolutionAcceptedTemplate(dispute, dispute.respondentEmail, dispute.respondentName))
    ]);
    return results;
}

export async function notifyCaseResolved(dispute) {
    const results = await Promise.all([
        sendEmail(caseResolvedTemplate(dispute, dispute.plaintiffEmail, dispute.plaintiffName)),
        sendEmail(caseResolvedTemplate(dispute, dispute.respondentEmail, dispute.respondentName))
    ]);
    return results;
}

export async function notifyCourtForwarded(dispute) {
    const results = await Promise.all([
        sendEmail(courtForwardedTemplate(dispute, dispute.plaintiffEmail, dispute.plaintiffName)),
        sendEmail(courtForwardedTemplate(dispute, dispute.respondentEmail, dispute.respondentName))
    ]);
    return results;
}

export async function notifyReanalysisRequested(dispute, reanalysisCount) {
    const results = await Promise.all([
        sendEmail(reanalysisRequestedTemplate(dispute, dispute.plaintiffEmail, dispute.plaintiffName, reanalysisCount)),
        sendEmail(reanalysisRequestedTemplate(dispute, dispute.respondentEmail, dispute.respondentName, reanalysisCount))
    ]);
    return results;
}
