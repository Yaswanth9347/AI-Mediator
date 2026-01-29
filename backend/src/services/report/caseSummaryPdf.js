// Case Summary PDF Generator
import fs from 'fs';
import { PDFDocument, getStatusInfo, createPdfHelpers, generateDocumentMetadata } from './pdfHelpers.js';

export async function generateCaseSummaryPDF(dispute, messages = [], evidence = [], auditLogs = []) {
    return new Promise(async (resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const fileName = `Case_Summary_${dispute.id}_${Date.now()}.pdf`;
            const filePath = `uploads/${fileName}`;
            const stream = fs.createWriteStream(filePath);

            doc.pipe(stream);

            const { documentId, timestamp } = generateDocumentMetadata();
            const { addTitle, addSectionHeader, addSubHeader, addBulletPoint, addNormalText, addSeparator } = createPdfHelpers(doc);
            const statusInfo = getStatusInfo(dispute.status);

            // ===== PAGE 1: COVER PAGE =====
            doc.moveDown(2);
            doc.fontSize(24).font('Helvetica-Bold').fillColor('#1e40af').text('MediaAI', { align: 'center' });
            doc.fontSize(12).font('Helvetica').fillColor('#6b7280').text('AI-Powered Dispute Resolution Platform', { align: 'center' });
            doc.fillColor('black');
            doc.moveDown(2);

            addTitle('CASE SUMMARY REPORT', 20);
            doc.moveDown(0.5);

            // Case ID Box
            doc.rect(150, doc.y, 295, 40).fillAndStroke('#f3f4f6', '#e5e7eb');
            doc.fillColor('black').fontSize(14).font('Helvetica-Bold').text(`Case #${dispute.id}`, 0, doc.y + 12, { align: 'center' });
            doc.moveDown(2.5);

            // Status Badge
            doc.fontSize(12).font('Helvetica-Bold').text('Current Status: ', { continued: true, align: 'center' });
            doc.fillColor(statusInfo.color).text(statusInfo.label, { align: 'center' });
            doc.fillColor('black');
            doc.moveDown(2);

            addSeparator();

            // Document Info
            addSectionHeader('DOCUMENT INFORMATION');
            addBulletPoint('Report Type', 'Case Summary Report');
            addBulletPoint('Document ID', documentId);
            addBulletPoint('Generated On', timestamp + ' IST');
            addBulletPoint('Case Reference', `MEDIAAI-CASE-${dispute.id}`);
            doc.moveDown(1);

            // ===== PAGE 2: PARTY DETAILS =====
            doc.addPage();
            addSectionHeader('1. PARTY DETAILS');
            doc.moveDown(0.3);

            addSubHeader('COMPLAINANT (Party A)');
            addBulletPoint('Full Name', dispute.plaintiffName);
            addBulletPoint('Email', dispute.plaintiffEmail);
            addBulletPoint('Phone', dispute.plaintiffPhone);
            addBulletPoint('Address', dispute.plaintiffAddress);
            addBulletPoint('Occupation', dispute.plaintiffOccupation);
            doc.moveDown(0.5);

            addSubHeader('RESPONDENT (Party B)');
            addBulletPoint('Full Name', dispute.respondentName);
            addBulletPoint('Email', dispute.respondentEmail);
            addBulletPoint('Phone', dispute.respondentPhone);
            addBulletPoint('Address', dispute.respondentAddress);
            addBulletPoint('Occupation', dispute.respondentOccupation);
            doc.moveDown(1);

            addSeparator();

            // ===== CASE DETAILS =====
            addSectionHeader('2. CASE DETAILS');
            addBulletPoint('Case Title', dispute.title);
            addBulletPoint('Filed On', new Date(dispute.createdAt).toLocaleDateString('en-IN'));
            addBulletPoint('Last Updated', new Date(dispute.updatedAt).toLocaleDateString('en-IN'));
            addBulletPoint('Status', statusInfo.label);
            addBulletPoint('Resolution Mode', 'AI-Assisted Mediation');
            doc.moveDown(0.5);

            addSubHeader('Case Description');
            addNormalText(dispute.description || 'No description provided.');
            doc.moveDown(1);

            addSeparator();

            // ===== AI ANALYSIS =====
            if (dispute.aiAnalysis) {
                addSectionHeader('3. AI ANALYSIS');
                try {
                    const analysis = typeof dispute.aiAnalysis === 'string' && dispute.aiAnalysis.startsWith('{')
                        ? JSON.parse(dispute.aiAnalysis)
                        : { summary: dispute.aiAnalysis };

                    if (analysis.summary) {
                        addSubHeader('Summary');
                        addNormalText(analysis.summary);
                    }

                    if (analysis.keyPoints && Array.isArray(analysis.keyPoints)) {
                        addSubHeader('Key Points');
                        analysis.keyPoints.forEach((point, i) => {
                            doc.fontSize(10).font('Helvetica').text(`${i + 1}. ${point}`);
                            doc.moveDown(0.15);
                        });
                    }
                } catch (e) {
                    const analysisText = String(dispute.aiAnalysis).substring(0, 2000);
                    addNormalText(analysisText + (dispute.aiAnalysis.length > 2000 ? '...' : ''));
                }
                doc.moveDown(1);
                addSeparator();
            }

            // ===== PROPOSED SOLUTIONS =====
            if (dispute.aiSolutions) {
                doc.addPage();
                addSectionHeader('4. PROPOSED SOLUTIONS');

                try {
                    const solutions = JSON.parse(dispute.aiSolutions);
                    solutions.forEach((solution, index) => {
                        const isChosen = dispute.plaintiffChoice === index || dispute.respondentChoice === index;
                        addSubHeader(`Option ${index + 1}: ${solution.title}${isChosen ? ' ✓ (Selected)' : ''}`);
                        addNormalText(solution.description);

                        if (solution.pros && Array.isArray(solution.pros)) {
                            doc.fontSize(10).font('Helvetica-Bold').text('Pros:', { indent: 10 });
                            solution.pros.forEach(pro => {
                                doc.fontSize(9).font('Helvetica').text(`  • ${pro}`, { indent: 15 });
                            });
                            doc.moveDown(0.2);
                        }

                        if (solution.cons && Array.isArray(solution.cons)) {
                            doc.fontSize(10).font('Helvetica-Bold').text('Cons:', { indent: 10 });
                            solution.cons.forEach(con => {
                                doc.fontSize(9).font('Helvetica').text(`  • ${con}`, { indent: 15 });
                            });
                        }
                        doc.moveDown(0.5);
                    });
                } catch (e) {
                    addNormalText('Solutions data not available in expected format.');
                }
                doc.moveDown(0.5);
                addSeparator();
            }

            // ===== EVIDENCE SUMMARY =====
            if (evidence.length > 0) {
                addSectionHeader('5. EVIDENCE SUBMITTED');
                addNormalText(`Total files submitted: ${evidence.length}`);
                doc.moveDown(0.3);

                evidence.slice(0, 15).forEach((item, index) => {
                    doc.fontSize(9).font('Helvetica-Bold').text(`${index + 1}. ${item.originalName}`, { continued: true });
                    doc.font('Helvetica').text(` (${item.fileType}, ${(item.fileSize / 1024).toFixed(1)} KB)`);
                    if (item.description) {
                        doc.fontSize(8).font('Helvetica-Oblique').text(`   "${item.description}"`, { indent: 15 });
                    }
                    doc.moveDown(0.1);
                });

                if (evidence.length > 15) {
                    doc.fontSize(9).font('Helvetica-Oblique').text(`... and ${evidence.length - 15} more files`);
                }
                doc.moveDown(1);
                addSeparator();
            }

            // ===== COMMUNICATION SUMMARY =====
            if (messages.length > 0) {
                addSectionHeader('6. COMMUNICATION SUMMARY');
                addBulletPoint('Total Messages', messages.length.toString());
                addBulletPoint('Date Range', `${new Date(messages[0]?.createdAt).toLocaleDateString('en-IN')} - ${new Date(messages[messages.length - 1]?.createdAt).toLocaleDateString('en-IN')}`);
                doc.moveDown(0.5);

                addSubHeader('Recent Communications');
                const recentMessages = messages.slice(-5);
                recentMessages.forEach(msg => {
                    doc.fontSize(9).font('Helvetica-Bold').text(`${msg.senderName || 'Unknown'}`, { continued: true });
                    doc.font('Helvetica').text(` (${new Date(msg.createdAt).toLocaleString('en-IN')}):`);
                    doc.fontSize(9).font('Helvetica').text(msg.content.substring(0, 200) + (msg.content.length > 200 ? '...' : ''), { indent: 10 });
                    doc.moveDown(0.3);
                });
                doc.moveDown(1);
                addSeparator();
            }

            // ===== RESOLUTION STATUS =====
            doc.addPage();
            addSectionHeader('7. RESOLUTION STATUS');
            addBulletPoint('Current Status', statusInfo.label);
            addBulletPoint('Complainant Confirmed Details', dispute.plaintiffConfirmed ? 'Yes' : 'No');
            addBulletPoint('Respondent Confirmed Details', dispute.respondentConfirmed ? 'Yes' : 'No');
            addBulletPoint('Complainant Choice', dispute.plaintiffChoice !== null ? `Option ${dispute.plaintiffChoice + 1}` : 'Pending');
            addBulletPoint('Respondent Choice', dispute.respondentChoice !== null ? `Option ${dispute.respondentChoice + 1}` : 'Pending');
            addBulletPoint('Complainant Signed', dispute.plaintiffSignature ? 'Yes' : 'No');
            addBulletPoint('Respondent Signed', dispute.respondentSignature ? 'Yes' : 'No');

            if (dispute.resolutionNotes) {
                doc.moveDown(0.5);
                addSubHeader('Resolution Notes');
                addNormalText(dispute.resolutionNotes);
            }

            if (dispute.status === 'ForwardedToCourt') {
                doc.moveDown(0.5);
                addSubHeader('Court Forwarding Details');
                addBulletPoint('Court Type', dispute.courtType);
                addBulletPoint('Court Name', dispute.courtName);
                addBulletPoint('Court Location', dispute.courtLocation);
                addBulletPoint('Forwarded On', dispute.courtForwardedAt ? new Date(dispute.courtForwardedAt).toLocaleDateString('en-IN') : 'N/A');
            }
            doc.moveDown(1);
            addSeparator();

            // ===== ACTIVITY LOG =====
            if (auditLogs.length > 0) {
                addSectionHeader('8. ACTIVITY LOG (Last 10 Events)');
                auditLogs.slice(0, 10).forEach(log => {
                    doc.fontSize(9).font('Helvetica-Bold').text(new Date(log.createdAt).toLocaleString('en-IN'), { continued: true });
                    doc.font('Helvetica').text(` - ${log.action}`);
                    if (log.description) {
                        doc.fontSize(8).font('Helvetica').text(`   ${log.description}`, { indent: 10 });
                    }
                    doc.moveDown(0.2);
                });
                doc.moveDown(1);
            }

            addSeparator();

            // ===== FOOTER =====
            doc.moveDown(1);
            doc.fontSize(9).font('Helvetica-Oblique').fillColor('#6b7280').text(
                'This report is generated automatically by MediaAI platform and represents the current state of the case.',
                { align: 'center' }
            );
            doc.moveDown(0.3);
            doc.fontSize(8).text(`Generated on ${timestamp} IST | Document ID: ${documentId}`, { align: 'center' });
            doc.fillColor('black');

            doc.end();

            stream.on('finish', () => resolve({ path: filePath }));
            stream.on('error', (err) => reject(err));
        } catch (e) {
            reject(e);
        }
    });
}
