// Agreement PDF Generator
import fs from 'fs';
import { PDFDocument, createPdfHelpers, generateDocumentMetadata, generateDocumentHash, generateQRCode } from './pdfHelpers.js';

export async function generateAgreementPDF(dispute, outputPath) {
    return new Promise(async (resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const stream = fs.createWriteStream(outputPath);
            doc.pipe(stream);

            const { documentId, timestamp, timestampISO } = generateDocumentMetadata();
            const { addTitle, addSectionHeader, addBulletPoint, addNormalText, addSeparator } = createPdfHelpers(doc);

            // Calculate document hash
            const documentContent = {
                disputeId: dispute.id,
                parties: [dispute.plaintiffName, dispute.respondentName],
                timestamp: timestampISO
            };
            const documentHash = generateDocumentHash(documentContent);

            // Generate QR Code
            const verificationUrl = `https://mediaai.verify/${documentId}`;
            const qrCodeDataUrl = await generateQRCode(verificationUrl);

            // Parse solutions
            const solutions = JSON.parse(dispute.aiSolutions || '[]');
            const chosenSolution = dispute.plaintiffChoice !== null ? solutions[dispute.plaintiffChoice] : null;

            // ===== PAGE 1: HEADER & METADATA =====
            addTitle('FINAL SETTLEMENT AGREEMENT & MUTUAL RELEASE', 18);
            doc.fontSize(10).font('Helvetica-Oblique').text('(Auto-Generated Upon Case Closure)', { align: 'center' });
            doc.moveDown(1);

            addSeparator();

            addSectionHeader('DOCUMENT METADATA (SYSTEM-GENERATED)');
            addBulletPoint('Document Type: Final Settlement Agreement & Mutual Release');
            addBulletPoint('Generation Trigger: Case Status = RESOLVED');
            addBulletPoint(`Document ID: ${documentId}`);
            addBulletPoint(`Case ID: ${dispute.id}`);
            addBulletPoint(`Mediation ID: MEDIAAI-${dispute.id}-${new Date().getFullYear()}`);
            addBulletPoint('Platform: MediaAI - AI-Powered Dispute Resolution');
            addBulletPoint('Version: 1.0');
            addBulletPoint(`Generated On: ${timestamp} IST`);
            addBulletPoint(`Document Hash (SHA-256): ${documentHash.substring(0, 32)}...`);
            doc.moveDown(1);

            addSeparator();

            // ===== SECTION 1: PARTIES =====
            addSectionHeader('1. PARTIES TO THE SETTLEMENT');
            doc.moveDown(0.5);

            doc.fontSize(11).font('Helvetica-Bold').text('PARTY A (Complainant / Claimant)');
            doc.moveDown(0.3);
            addBulletPoint(`Full Name: ${dispute.plaintiffName}`);
            addBulletPoint(`Address: ${dispute.plaintiffAddress}`);
            addBulletPoint(`Contact: ${dispute.plaintiffPhone}`);
            addBulletPoint(`Email: ${dispute.plaintiffEmail}`);
            addBulletPoint(`Occupation: ${dispute.plaintiffOccupation || 'Not Specified'}`);
            doc.moveDown(0.5);

            doc.fontSize(11).font('Helvetica-Bold').text('PARTY B (Respondent)');
            doc.moveDown(0.3);
            addBulletPoint(`Full Name: ${dispute.respondentName}`);
            addBulletPoint(`Address: ${dispute.respondentAddress}`);
            addBulletPoint(`Contact: ${dispute.respondentPhone}`);
            addBulletPoint(`Email: ${dispute.respondentEmail}`);
            addBulletPoint(`Occupation: ${dispute.respondentOccupation || 'Not Specified'}`);
            doc.moveDown(1);

            addSeparator();

            // ===== SECTION 2: CASE DETAILS =====
            addSectionHeader('2. CASE & DISPUTE DETAILS');
            addBulletPoint(`Case Reference No: MEDIAAI-CASE-${dispute.id}`);
            addBulletPoint(`Nature of Dispute: ${dispute.title}`);
            addBulletPoint('Dispute Category: Civil / Commercial');
            addBulletPoint(`Date of Dispute Initiation: ${new Date(dispute.createdAt).toLocaleDateString('en-IN')}`);
            addBulletPoint('Resolution Mode: AI-Assisted Mediation');
            addBulletPoint('Resolution Status: FULL & FINAL SETTLEMENT');
            addBulletPoint(`Closure Date: ${new Date().toLocaleDateString('en-IN')}`);
            doc.moveDown(1);

            addSeparator();

            // ===== SECTION 3: RECITALS =====
            addSectionHeader('3. RECITALS');
            addNormalText(`WHEREAS, a dispute arose between the Parties in relation to "${dispute.title}";`);
            addNormalText('WHEREAS, the Parties voluntarily agreed to resolve the dispute through MediaAI, an AI-assisted online dispute resolution system;');
            addNormalText('WHEREAS, the Parties participated freely, without coercion, and arrived at a mutually acceptable settlement;');
            addNormalText('NOW, THEREFORE, the Parties agree as follows:');
            doc.moveDown(0.5);

            addSeparator();

            // ===== PAGE 2: SETTLEMENT TERMS =====
            doc.addPage();

            addSectionHeader('4. TERMS OF SETTLEMENT');
            doc.moveDown(0.3);

            doc.fontSize(11).font('Helvetica-Bold').text('4.1 Settlement Outcome');
            addNormalText('The dispute is hereby resolved in full and final settlement.');
            doc.moveDown(0.3);

            doc.fontSize(11).font('Helvetica-Bold').text('4.2 Agreed Terms');
            doc.moveDown(0.2);

            if (chosenSolution) {
                doc.fontSize(10).font('Helvetica-Bold').text(`Solution Title: ${chosenSolution.title}`);
                doc.moveDown(0.2);
                addNormalText(chosenSolution.description);
            } else {
                addNormalText('The parties have agreed to resolve the dispute amicably through mutual understanding.');
            }

            if (dispute.resolutionNotes) {
                doc.moveDown(0.3);
                doc.fontSize(10).font('Helvetica-Bold').text('Additional Terms:');
                addNormalText(dispute.resolutionNotes);
            }

            doc.moveDown(1);
            addSeparator();

            // ===== SECTION 5: MUTUAL RELEASE =====
            addSectionHeader('5. MUTUAL RELEASE & DISCHARGE');
            addNormalText('Upon execution of this Agreement, each Party irrevocably releases and discharges the other from all claims, demands, liabilities, and proceedings arising out of the dispute.');
            doc.moveDown(0.5);

            addSeparator();

            // ===== SECTION 6: FINALITY =====
            addSectionHeader('6. FINALITY & CASE CLOSURE');
            addNormalText('This Agreement:');
            addBulletPoint('Constitutes full and final resolution');
            addBulletPoint('Results in case closure');
            addBulletPoint('May be produced before any court or authority');
            addBulletPoint('Bars re-litigation of the same cause of action');
            doc.moveDown(0.5);

            addSeparator();

            // ===== SECTION 7: SIGNATURES =====
            addSectionHeader('7. SIGNATURES & VERIFICATION');
            doc.moveDown(0.5);

            const signatureY = doc.y;

            // Party A Signature Column
            doc.text('PARTY A (Complainant)', 50, signatureY);
            if (dispute.plaintiffSignature) {
                const sigPath = `uploads/${dispute.plaintiffSignature}`;
                if (fs.existsSync(sigPath)) {
                    doc.image(sigPath, 50, signatureY + 20, { width: 100 });
                } else {
                    doc.text('[Digital Signature]', 50, signatureY + 40);
                }
            } else {
                doc.text('[Not Signed]', 50, signatureY + 40);
            }
            doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 50, signatureY + 100);

            // Party B Signature Column
            doc.text('PARTY B (Respondent)', 300, signatureY);
            if (dispute.respondentSignature) {
                const sigPath = `uploads/${dispute.respondentSignature}`;
                if (fs.existsSync(sigPath)) {
                    doc.image(sigPath, 300, signatureY + 20, { width: 100 });
                } else {
                    doc.text('[Digital Signature]', 300, signatureY + 40);
                }
            } else {
                doc.text('[Not Signed]', 300, signatureY + 40);
            }
            doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 300, signatureY + 100);

            doc.moveDown(6);

            // QR Code Verification
            if (qrCodeDataUrl) {
                doc.image(qrCodeDataUrl, doc.page.width - 120, doc.page.height - 120, { width: 70 });
                doc.fontSize(8).text('Scan to Verify', doc.page.width - 120, doc.page.height - 40, { width: 70, align: 'center' });
            }

            doc.end();

            stream.on('finish', () => {
                resolve({ path: outputPath, documentId, documentHash });
            });

            stream.on('error', (err) => reject(err));
        } catch (e) {
            reject(e);
        }
    });
}
