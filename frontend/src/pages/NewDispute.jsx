import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDispute } from '../api';
import { Upload, Loader2, Scale } from 'lucide-react';
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!idCardFile) return toast.error('Proof of Identity is required!');

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
    const LabelClass = "block text-sm font-medium text-blue-200 mb-1.5";

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
                </div>

                {/* Form Container */}
                <div className="bg-slate-800/70 backdrop-blur-xl rounded-xl shadow-2xl border border-blue-800 p-8">
                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Identity Verification */}
                        <div>
                            <h3 className="text-base font-medium text-blue-100 mb-4">Identity Verification</h3>
                            <div className="bg-blue-950/50 border border-blue-800 rounded-lg p-4 mb-4">
                                <p className="text-xs text-blue-300 leading-relaxed">
                                    Government-issued ID required to verify identity and ensure case integrity.
                                </p>
                            </div>
                            <div>
                                <label className={LabelClass}>Government ID *</label>
                                <div className="mt-1 flex justify-center px-6 py-8 border border-blue-800 rounded-lg hover:border-blue-600 transition-colors bg-slate-900/30">
                                    <div className="text-center">
                                        <Upload className="mx-auto h-8 w-8 text-blue-400 mb-3" />
                                        <label className="cursor-pointer text-sm text-blue-300 hover:text-blue-200 transition-colors">
                                            <span>Upload ID Card</span>
                                            <input type="file" required className="sr-only" onChange={e => setIdCardFile(e.target.files[0])} accept="image/*" />
                                        </label>
                                        <p className="text-xs text-blue-500 mt-2">PNG, JPG up to 10MB</p>
                                        {idCardFile && <p className="text-sm text-green-400 font-medium mt-3">{idCardFile.name}</p>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-blue-800 pt-8"></div>

                        {/* Your Details */}
                        <div>
                            <h3 className="text-base font-medium text-blue-100 mb-4">Your Details</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={LabelClass}>Full Name *</label>
                                    <input type="text" required value={plaintiffName} onChange={e => setPlaintiffName(e.target.value)} placeholder="Full legal name" className={InputClass} />
                                </div>
                                <div>
                                    <label className={LabelClass}>Email Address *</label>
                                    <input type="email" required value={plaintiffEmail} onChange={e => setPlaintiffEmail(e.target.value)} placeholder="Email" className={InputClass} />
                                </div>
                                <div>
                                    <label className={LabelClass}>Phone Number *</label>
                                    <input type="tel" required value={plaintiffPhone} onChange={e => setPlaintiffPhone(e.target.value)} placeholder="Phone number" className={InputClass} />
                                </div>
                                <div>
                                    <label className={LabelClass}>Occupation *</label>
                                    <input type="text" required value={plaintiffOccupation} onChange={e => setPlaintiffOccupation(e.target.value)} placeholder="Occupation" className={InputClass} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={LabelClass}>Address *</label>
                                    <textarea rows={2} required value={plaintiffAddress} onChange={e => setPlaintiffAddress(e.target.value)} placeholder="Complete address" className={InputClass} />
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-blue-800 pt-8"></div>

                        {/* Respondent Details */}
                        <div>
                            <h3 className="text-base font-medium text-blue-100 mb-4">Respondent Details</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={LabelClass}>Full Name *</label>
                                    <input type="text" required value={respondentName} onChange={e => setRespondentName(e.target.value)} placeholder="Full legal name" className={InputClass} />
                                </div>
                                <div>
                                    <label className={LabelClass}>Email Address *</label>
                                    <input type="email" required value={respondentEmail} onChange={e => setRespondentEmail(e.target.value)} placeholder="Email" className={InputClass} />
                                </div>
                                <div>
                                    <label className={LabelClass}>Phone Number *</label>
                                    <input type="tel" required value={respondentPhone} onChange={e => setRespondentPhone(e.target.value)} placeholder="Phone number" className={InputClass} />
                                </div>
                                <div>
                                    <label className={LabelClass}>Occupation *</label>
                                    <input type="text" required value={respondentOccupation} onChange={e => setRespondentOccupation(e.target.value)} placeholder="Occupation" className={InputClass} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={LabelClass}>Address *</label>
                                    <textarea rows={2} required value={respondentAddress} onChange={e => setRespondentAddress(e.target.value)} placeholder="Complete address" className={InputClass} />
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-blue-800 pt-8"></div>

                        {/* Case Details */}
                        <div>
                            <h3 className="text-base font-medium text-blue-100 mb-4">Case Details</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className={LabelClass}>Case Title *</label>
                                    <input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief case title" className={InputClass} />
                                </div>
                                <div>
                                    <label className={LabelClass}>Case Statement *</label>
                                    <textarea rows={6} required value={description} onChange={e => setDescription(e.target.value)} placeholder="Detailed description of the dispute" className={InputClass} />
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-blue-800 pt-8"></div>

                        {/* Evidence */}
                        <div>
                            <h3 className="text-base font-medium text-blue-100 mb-4">Evidence (Optional)</h3>
                            <div>
                                <label className={LabelClass}>Supporting Document</label>
                                <div className="mt-1 flex justify-center px-6 py-8 border border-blue-800 rounded-lg hover:border-blue-600 transition-colors bg-slate-900/30">
                                    <div className="text-center">
                                        <Upload className="mx-auto h-8 w-8 text-blue-400 mb-3" />
                                        <label className="cursor-pointer text-sm text-blue-300 hover:text-blue-200 transition-colors">
                                            <span>Upload File</span>
                                            <input type="file" className="sr-only" onChange={e => setEvidenceFile(e.target.files[0])} accept="image/*" />
                                        </label>
                                        <p className="text-xs text-blue-500 mt-2">PNG, JPG up to 10MB</p>
                                        {evidenceFile && <p className="text-sm text-green-400 font-medium mt-3">{evidenceFile.name}</p>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
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
