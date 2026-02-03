import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDispute, verifyGovtId } from '../api';
import { Upload, Loader2, Scale, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import PaymentModal from '../components/PaymentModal';

export default function NewDispute() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [createdDispute, setCreatedDispute] = useState(null);

    // Plaintiff Details
    const [plaintiffName, setPlaintiffName] = useState('');
    const [plaintiffEmail, setPlaintiffEmail] = useState('');
    const [plaintiffPhone, setPlaintiffPhone] = useState('');
    const [plaintiffAddress, setPlaintiffAddress] = useState('');
    const [plaintiffOccupation, setPlaintiffOccupation] = useState('');

    // Respondent Details
    const [respondentName, setRespondentName] = useState('');
    const [respondentEmail, setRespondentEmail] = useState('');
    const [respondentPhone, setRespondentPhone] = useState('');
    const [respondentAddress, setRespondentAddress] = useState('');
    const [respondentOccupation, setRespondentOccupation] = useState('');

    // Case Details
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [evidenceFile, setEvidenceFile] = useState(null);
    const [idCardFile, setIdCardFile] = useState(null);
    const [verificationStatus, setVerificationStatus] = useState('idle'); // idle, verifying, verified, rejected
    const [verifiedData, setVerifiedData] = useState(null);
    const [verificationError, setVerificationError] = useState(null);
    const [isIdentityVerified, setIsIdentityVerified] = useState(false);

    const handleIdUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIdCardFile(file);
        setVerificationStatus('verifying');
        setVerificationError(null);
        setVerifiedData(null);

        const formData = new FormData();
        formData.append('idDocument', file);

        try {
            const res = await verifyGovtId(formData);
            const data = res.data;

            if (data.status === 'verified') {
                setVerificationStatus('verified');
                setVerifiedData(data);
                setIsIdentityVerified(true);
                toast.success(`ID Verified: ${data.detected_document_type}`);
            } else {
                setVerificationStatus('rejected');
                setVerifiedData(data); // Contains failure reason
                setIsIdentityVerified(false);
                toast.error(`Verification Failed: ${data.failure_reason}`);
            }
        } catch (error) {
            console.error(error);
            setVerificationStatus('error');
            setVerificationError('Failed to connect to verification service.');
            setIsIdentityVerified(false);
            toast.error('Identity check failed to run.');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!idCardFile) return toast.error('Proof of Identity is required!');
        if (verificationStatus !== 'verified') {
            return toast.error('Please complete identity verification before submitting.');
        }

        setLoading(true);

        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        formData.append('plaintiffName', plaintiffName);
        formData.append('plaintiffEmail', plaintiffEmail);
        formData.append('plaintiffPhone', plaintiffPhone);
        formData.append('plaintiffAddress', plaintiffAddress);
        formData.append('plaintiffOccupation', plaintiffOccupation);
        formData.append('respondentName', respondentName);
        formData.append('respondentEmail', respondentEmail);
        formData.append('respondentPhone', respondentPhone);
        formData.append('respondentAddress', respondentAddress);
        formData.append('respondentOccupation', respondentOccupation);

        // Append files
        if (evidenceFile) formData.append('evidence', evidenceFile);
        if (idCardFile) formData.append('idCard', idCardFile);

        try {
            const res = await createDispute(formData);
            // ============ PAYMENT BYPASS FOR TESTING ============
            // Skip payment modal and go directly to dispute page
            toast.success('Case created and filed successfully!');
            navigate(`/disputes/${res.data.id}`);
            // ====================================================
            // ORIGINAL CODE (uncomment to restore payment):
            // toast.success('Case created successfully! Please complete payment to file.');
            // setCreatedDispute(res.data);
            // setShowPaymentModal(true);
            setLoading(false);
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.error || 'Failed to create case');
            setLoading(false);
        }
    };

    const handlePaymentSuccess = (paymentIntent) => {
        toast.success('Payment successful! Your dispute has been filed.');
        navigate(`/disputes/${createdDispute.id}`);
    };

    const handlePaymentCancel = () => {
        setShowPaymentModal(false);
        toast.info('You can complete payment later from your dashboard.');
        navigate('/dashboard');
    };

    const InputClass = "w-full px-4 py-2.5 border border-blue-800 rounded-lg text-blue-100 placeholder-blue-500 bg-slate-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm";
    const DisabledInputClass = "w-full px-4 py-2.5 border border-gray-600 rounded-lg text-gray-400 placeholder-gray-500 bg-gray-800/30 cursor-not-allowed transition-all text-sm";
    const LabelClass = "block text-sm font-medium text-blue-200 mb-1.5";
    const DisabledLabelClass = "block text-sm font-medium text-gray-400 mb-1.5";

    const getInputClass = (isDisabled) => isDisabled ? DisabledInputClass : InputClass;
    const getLabelClass = (isDisabled) => isDisabled ? DisabledLabelClass : LabelClass;

    return (
        <div className="flex-1 py-8 px-4">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-lg mb-3">
                        <Scale className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-semibold text-blue-100 mb-1">File a New Dispute Case</h1>
                    <p className="text-sm text-blue-300">Complete all required information to submit your case</p>
                    
                    {/* Step Indicator */}
                    <div className="flex items-center justify-center gap-4 mt-6">
                        <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                                isIdentityVerified ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'
                            }`}>
                                {isIdentityVerified ? '✓' : '1'}
                            </div>
                            <span className={`text-sm ${isIdentityVerified ? 'text-green-400' : 'text-blue-300'}`}>
                                Identity Verification
                            </span>
                        </div>
                        <div className={`w-8 h-0.5 ${isIdentityVerified ? 'bg-green-400' : 'bg-gray-600'}`}></div>
                        <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                                isIdentityVerified ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-400'
                            }`}>
                                2
                            </div>
                            <span className={`text-sm ${isIdentityVerified ? 'text-blue-300' : 'text-gray-500'}`}>
                                Case Details
                            </span>
                        </div>
                    </div>
                </div>

                {/* Form Container */}
                <div className="bg-slate-800/70 backdrop-blur-xl rounded-xl shadow-2xl border border-blue-800 p-8">
                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Identity Verification */}
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-base font-medium text-blue-100">Identity Verification</h3>
                                {isIdentityVerified && (
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4 text-green-400" />
                                        <span className="text-xs text-green-400 font-medium">Verified ✓</span>
                                    </div>
                                )}
                            </div>
                            <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4 mb-4">
                                <p className="text-xs text-blue-300 leading-relaxed">
                                    {!isIdentityVerified 
                                        ? "⚠️ Complete this step first to unlock the form sections below. Indian government ID required (Aadhaar, PAN, or Driving License)."
                                        : "✅ Identity verified! You can now complete the remaining form sections below."
                                    }
                                </p>
                            </div>
                            <div>
                                <label className={LabelClass}>Government ID *</label>
                                <div className="mt-1 flex justify-center px-6 py-8 border border-blue-800 rounded-lg hover:border-blue-600 transition-colors bg-slate-900/30">
                                    <div className="text-center w-full">
                                        {verificationStatus === 'verifying' ? (
                                            <div className="py-2">
                                                <Loader2 className="animate-spin h-8 w-8 text-blue-400 mx-auto mb-2" />
                                                <p className="text-sm text-blue-300">Verifying Identity Document...</p>
                                            </div>
                                        ) : (
                                            <>
                                                <Upload className="mx-auto h-8 w-8 text-blue-400 mb-3" />
                                                <label className="cursor-pointer text-sm text-blue-300 hover:text-blue-200 transition-colors">
                                                    <span>{idCardFile ? 'Change ID Card' : 'Upload ID Card'}</span>
                                                    <input type="file" className="sr-only" onChange={handleIdUpload} accept="image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
                                                </label>
                                                <p className="text-xs text-blue-500 mt-2">PDF, JPG, PNG (DOC/DOCX will be rejected) up to 10MB</p>

                                                {/* Verification Results */}
                                                {verificationStatus === 'verified' && (
                                                    <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-3 text-left">
                                                        <CheckCircle className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                                                        <div>
                                                            <p className="text-sm font-medium text-green-400">Verified Successfully</p>
                                                            <p className="text-xs text-green-300/80 mt-1">
                                                                Type: <span className="uppercase">{verifiedData?.detected_document_type}</span>
                                                            </p>
                                                            {verifiedData?.extracted_fields?.id_number && (
                                                                <p className="text-xs text-green-300/80">
                                                                    ID: {verifiedData.extracted_fields.id_number}
                                                                </p>
                                                            )}
                                                            <p className="text-xs text-green-300/60 mt-1">Confidence: {Math.round(verifiedData?.confidence_score * 100)}%</p>
                                                        </div>
                                                    </div>
                                                )}

                                                {verificationStatus === 'rejected' && (
                                                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3 text-left">
                                                        <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                                                        <div>
                                                            <p className="text-sm font-medium text-red-400">Verification Failed</p>
                                                            <p className="text-xs text-red-300/80 mt-1">{verifiedData?.failure_reason}</p>
                                                            <p className="text-xs text-red-300/60 mt-1">Please upload a clearer image or a valid Government ID.</p>
                                                        </div>
                                                    </div>
                                                )}

                                                {verificationStatus === 'error' && (
                                                    <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-3 text-left">
                                                        <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
                                                        <div>
                                                            <p className="text-sm font-medium text-yellow-400">Service Unavailable</p>
                                                            <p className="text-xs text-yellow-300/80 mt-1">{verificationError}</p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* File Name display if just selected but not processed (fallback) or if valid */}
                                                {idCardFile && verificationStatus === 'idle' && (
                                                    <p className="text-sm text-blue-400 font-medium mt-3">{idCardFile.name}</p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-blue-800 pt-8"></div>

                        {/* Your Details */}
                        <div className={`transition-all duration-300 ${!isIdentityVerified ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className={`text-base font-medium ${isIdentityVerified ? 'text-blue-100' : 'text-gray-400'}`}>Your Details</h3>
                                {!isIdentityVerified && (
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                                        <span className="text-xs text-yellow-400 font-medium">Identity verification required</span>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={getLabelClass(!isIdentityVerified)}>Full Name *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        disabled={!isIdentityVerified}
                                        value={plaintiffName} 
                                        onChange={e => setPlaintiffName(e.target.value)} 
                                        placeholder="Full legal name" 
                                        className={getInputClass(!isIdentityVerified)} 
                                    />
                                </div>
                                <div>
                                    <label className={getLabelClass(!isIdentityVerified)}>Email Address *</label>
                                    <input 
                                        type="email" 
                                        required 
                                        disabled={!isIdentityVerified}
                                        value={plaintiffEmail} 
                                        onChange={e => setPlaintiffEmail(e.target.value)} 
                                        placeholder="Email" 
                                        className={getInputClass(!isIdentityVerified)} 
                                    />
                                </div>
                                <div>
                                    <label className={getLabelClass(!isIdentityVerified)}>Phone Number *</label>
                                    <input 
                                        type="tel" 
                                        required 
                                        disabled={!isIdentityVerified}
                                        value={plaintiffPhone} 
                                        onChange={e => setPlaintiffPhone(e.target.value)} 
                                        placeholder="Phone number" 
                                        className={getInputClass(!isIdentityVerified)} 
                                    />
                                </div>
                                <div>
                                    <label className={getLabelClass(!isIdentityVerified)}>Occupation *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        disabled={!isIdentityVerified}
                                        value={plaintiffOccupation} 
                                        onChange={e => setPlaintiffOccupation(e.target.value)} 
                                        placeholder="Occupation" 
                                        className={getInputClass(!isIdentityVerified)} 
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={getLabelClass(!isIdentityVerified)}>Address *</label>
                                    <textarea 
                                        rows={2} 
                                        required 
                                        disabled={!isIdentityVerified}
                                        value={plaintiffAddress} 
                                        onChange={e => setPlaintiffAddress(e.target.value)} 
                                        placeholder="Complete address" 
                                        className={getInputClass(!isIdentityVerified)} 
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-blue-800 pt-8"></div>

                        {/* Respondent Details */}
                        <div className={`transition-all duration-300 ${!isIdentityVerified ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className={`text-base font-medium ${isIdentityVerified ? 'text-blue-100' : 'text-gray-400'}`}>Respondent Details</h3>
                                {!isIdentityVerified && (
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                                        <span className="text-xs text-yellow-400 font-medium">Identity verification required</span>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={getLabelClass(!isIdentityVerified)}>Full Name *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        disabled={!isIdentityVerified}
                                        value={respondentName} 
                                        onChange={e => setRespondentName(e.target.value)} 
                                        placeholder="Full legal name" 
                                        className={getInputClass(!isIdentityVerified)} 
                                    />
                                </div>
                                <div>
                                    <label className={getLabelClass(!isIdentityVerified)}>Email Address *</label>
                                    <input 
                                        type="email" 
                                        required 
                                        disabled={!isIdentityVerified}
                                        value={respondentEmail} 
                                        onChange={e => setRespondentEmail(e.target.value)} 
                                        placeholder="Email" 
                                        className={getInputClass(!isIdentityVerified)} 
                                    />
                                </div>
                                <div>
                                    <label className={getLabelClass(!isIdentityVerified)}>Phone Number *</label>
                                    <input 
                                        type="tel" 
                                        required 
                                        disabled={!isIdentityVerified}
                                        value={respondentPhone} 
                                        onChange={e => setRespondentPhone(e.target.value)} 
                                        placeholder="Phone number" 
                                        className={getInputClass(!isIdentityVerified)} 
                                    />
                                </div>
                                <div>
                                    <label className={getLabelClass(!isIdentityVerified)}>Occupation *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        disabled={!isIdentityVerified}
                                        value={respondentOccupation} 
                                        onChange={e => setRespondentOccupation(e.target.value)} 
                                        placeholder="Occupation" 
                                        className={getInputClass(!isIdentityVerified)} 
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={getLabelClass(!isIdentityVerified)}>Address *</label>
                                    <textarea 
                                        rows={2} 
                                        required 
                                        disabled={!isIdentityVerified}
                                        value={respondentAddress} 
                                        onChange={e => setRespondentAddress(e.target.value)} 
                                        placeholder="Complete address" 
                                        className={getInputClass(!isIdentityVerified)} 
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-blue-800 pt-8"></div>

                        {/* Case Details */}
                        <div className={`transition-all duration-300 ${!isIdentityVerified ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className={`text-base font-medium ${isIdentityVerified ? 'text-blue-100' : 'text-gray-400'}`}>Case Details</h3>
                                {!isIdentityVerified && (
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                                        <span className="text-xs text-yellow-400 font-medium">Identity verification required</span>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className={getLabelClass(!isIdentityVerified)}>Case Title *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        disabled={!isIdentityVerified}
                                        value={title} 
                                        onChange={e => setTitle(e.target.value)} 
                                        placeholder="Brief case title" 
                                        className={getInputClass(!isIdentityVerified)} 
                                    />
                                </div>
                                <div>
                                    <label className={getLabelClass(!isIdentityVerified)}>Case Statement *</label>
                                    <textarea 
                                        rows={6} 
                                        required 
                                        disabled={!isIdentityVerified}
                                        value={description} 
                                        onChange={e => setDescription(e.target.value)} 
                                        placeholder="Detailed description of the dispute" 
                                        className={getInputClass(!isIdentityVerified)} 
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-blue-800 pt-8"></div>

                        {/* Evidence */}
                        <div className={`transition-all duration-300 ${!isIdentityVerified ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className={`text-base font-medium ${isIdentityVerified ? 'text-blue-100' : 'text-gray-400'}`}>Evidence (Optional)</h3>
                                {!isIdentityVerified && (
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                                        <span className="text-xs text-yellow-400 font-medium">Identity verification required</span>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className={getLabelClass(!isIdentityVerified)}>Supporting Document</label>
                                <div className={`mt-1 flex justify-center px-6 py-8 border rounded-lg transition-colors ${!isIdentityVerified ? 'border-gray-600 bg-gray-800/20' : 'border-blue-800 bg-slate-900/30 hover:border-blue-600'}`}>
                                    <div className="text-center">
                                        <Upload className={`mx-auto h-8 w-8 mb-3 ${isIdentityVerified ? 'text-blue-400' : 'text-gray-500'}`} />
                                        <label className={`cursor-pointer text-sm transition-colors ${!isIdentityVerified ? 'text-gray-500 cursor-not-allowed' : 'text-blue-300 hover:text-blue-200'}`}>
                                            <span>Upload File</span>
                                            <input 
                                                type="file" 
                                                className="sr-only" 
                                                disabled={!isIdentityVerified}
                                                onChange={e => setEvidenceFile(e.target.files[0])} 
                                                accept="image/*" 
                                            />
                                        </label>
                                        <p className={`text-xs mt-2 ${isIdentityVerified ? 'text-blue-500' : 'text-gray-600'}`}>PNG, JPG up to 10MB</p>
                                        {evidenceFile && <p className="text-sm text-green-400 font-medium mt-3">{evidenceFile.name}</p>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Identity Verification Notice */}
                        {!isIdentityVerified && (
                            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-yellow-400">Identity Verification Required</p>
                                    <p className="text-xs text-yellow-300/80 mt-1">
                                        Please complete identity verification above to unlock the form sections and submit your case.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading || !isIdentityVerified}
                            className={`w-full py-3 px-4 font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 transition-all shadow-md flex items-center justify-center gap-2 ${
                                !isIdentityVerified 
                                    ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
                                    : loading 
                                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white opacity-50 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700'
                            }`}
                        >
                            {!isIdentityVerified ? (
                                'Complete Identity Verification First'
                            ) : loading ? (
                                <>
                                    <Loader2 className="animate-spin h-5 w-5" />
                                    Creating Dispute...
                                </>
                            ) : (
                                'Submit Case'
                            )}
                        </button>
                    </form>
                </div>

                {/* Payment Modal */}
                {showPaymentModal && createdDispute && (
                    <PaymentModal
                        isOpen={showPaymentModal}
                        onClose={handlePaymentCancel}
                        disputeId={createdDispute.id}
                        disputeTitle={createdDispute.title}
                        onPaymentSuccess={handlePaymentSuccess}
                    />
                )}
            </div>
        </div>
    );
}
