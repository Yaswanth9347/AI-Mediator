import { useState } from 'react';
import { Shield, Upload, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { acceptCase, verifyGovtId } from '../api';
import toast from 'react-hot-toast';

const RespondentAcceptance = ({ dispute, onAccepted }) => {
    const [idVerificationStatus, setIdVerificationStatus] = useState('pending'); // pending | verifying | verified | rejected | error
    const [idVerificationResult, setIdVerificationResult] = useState(null);
    const [verificationError, setVerificationError] = useState(null);
    const [accepting, setAccepting] = useState(false);

    const handleIdUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIdVerificationStatus('verifying');
        setVerificationError(null);
        setIdVerificationResult(null);

        const formData = new FormData();
        formData.append('idDocument', file);

        try {
            const res = await verifyGovtId(formData);
            const data = res.data;

            if (data.status === 'verified') {
                setIdVerificationStatus('verified');
                setIdVerificationResult(data);
                toast.success(`Identity verified: ${data.detected_document_type || 'Government ID'}`);
            } else {
                setIdVerificationStatus('rejected');
                setVerificationError(data.failure_reason || data.error || 'Verification failed. Please try a clearer image.');
                toast.error(`Verification failed: ${data.failure_reason || 'Invalid document'}`);
            }
        } catch (err) {
            console.error('ID Verification Error:', err);
            setIdVerificationStatus('error');
            setVerificationError('Server error during verification. Please try again.');
            toast.error('Verification service error');
        }
    };

    const handleAcceptCase = async () => {
        if (idVerificationStatus !== 'verified') {
            toast.error('Please verify your identity before accepting the case.');
            return;
        }

        try {
            setAccepting(true);
            const acceptData = {
                respondentIdVerified: true,
                respondentIdData: idVerificationResult
            };

            await acceptCase(dispute.id, acceptData);
            toast.success('You accepted the case.');
            if (onAccepted) onAccepted();
        } catch (err) {
            toast.error('Failed to accept the case.');
            console.error('Accept case error:', err);
        } finally {
            setAccepting(false);
        }
    };

    return (
        <div className="bg-gradient-to-br from-yellow-900/20 to-orange-900/10 rounded-lg border-2 border-yellow-600/40 p-6">
            <div className="flex items-start gap-3 mb-4">
                <Shield className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                    <h3 className="text-lg font-semibold text-yellow-300">Identity Verification Required</h3>
                    <p className="text-sm text-yellow-200 mt-1">
                        You have been named as the respondent in this dispute. Please verify your identity and accept the case to participate.
                    </p>
                </div>
            </div>

            {/* Step 1: ID Verification */}
            <div className="mb-4 p-4 bg-slate-900/50 rounded-lg border border-blue-800">
                <h4 className="text-sm font-semibold text-blue-200 mb-3 flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idVerificationStatus === 'verified' ? 'bg-green-500/30 text-green-400 border border-green-500/40' : 'bg-blue-500/30 text-blue-300 border border-blue-500/40'}`}>
                        {idVerificationStatus === 'verified' ? '✓' : '1'}
                    </span>
                    Upload Government ID
                </h4>

                {idVerificationStatus === 'pending' && (
                    <div>
                        <p className="text-xs text-blue-300 mb-3">
                            Upload a clear photo of your government-issued ID (Aadhaar, PAN, Passport, Driving License, etc.)
                        </p>
                        <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-200 rounded-lg cursor-pointer hover:bg-blue-600/30 transition-colors border border-blue-600/30 text-sm">
                            <Upload className="w-4 h-4" />
                            Choose ID Document
                            <input
                                type="file"
                                accept="image/*,.pdf"
                                onChange={handleIdUpload}
                                className="hidden"
                            />
                        </label>
                    </div>
                )}

                {idVerificationStatus === 'verifying' && (
                    <div className="flex items-center gap-3 text-blue-300">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Verifying your identity document...</span>
                    </div>
                )}

                {idVerificationStatus === 'verified' && (
                    <div className="flex items-center gap-2 text-green-400">
                        <CheckCircle className="w-5 h-5" />
                        <span className="text-sm font-medium">
                            Identity verified: {idVerificationResult?.detected_document_type || 'Government ID'}
                        </span>
                    </div>
                )}

                {(idVerificationStatus === 'rejected' || idVerificationStatus === 'error') && (
                    <div>
                        <div className="flex items-center gap-2 text-red-400 mb-2">
                            <XCircle className="w-5 h-5" />
                            <span className="text-sm font-medium">{verificationError}</span>
                        </div>
                        <label className="inline-flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-200 rounded-lg cursor-pointer hover:bg-red-600/30 transition-colors border border-red-600/30 text-sm">
                            <Upload className="w-4 h-4" />
                            Try Again
                            <input
                                type="file"
                                accept="image/*,.pdf"
                                onChange={handleIdUpload}
                                className="hidden"
                            />
                        </label>
                    </div>
                )}
            </div>

            {/* Step 2: Accept Case */}
            <div className="p-4 bg-slate-900/50 rounded-lg border border-blue-800">
                <h4 className="text-sm font-semibold text-blue-200 mb-3 flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idVerificationStatus !== 'verified' ? 'bg-slate-600/30 text-slate-400 border border-slate-500/40' : 'bg-blue-500/30 text-blue-300 border border-blue-500/40'}`}>
                        2
                    </span>
                    Accept the Case
                </h4>
                <p className="text-xs text-blue-300 mb-3">
                    By accepting, you agree to participate in the AI-mediated dispute resolution process.
                </p>
                <button
                    onClick={handleAcceptCase}
                    disabled={idVerificationStatus !== 'verified' || accepting}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:from-green-700 hover:to-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm"
                >
                    {accepting ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Accepting...
                        </>
                    ) : (
                        <>
                            <CheckCircle className="w-4 h-4" />
                            Accept Case
                        </>
                    )}
                </button>
            </div>

            {/* Warning */}
            <div className="mt-4 flex items-start gap-2 text-xs text-yellow-300/70">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                    If you do not accept, the case may proceed without your participation and may be forwarded to the court system.
                </p>
            </div>
        </div>
    );
};

export default RespondentAcceptance;
