import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { verifyIdentity } from '../api';
import { ShieldCheck, Upload, AlertCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Verification() {
    const [idCard, setIdCard] = useState(null);
    const [selfie, setSelfie] = useState(null);
    const [verifying, setVerifying] = useState(false);
    const [result, setResult] = useState(null);
    const navigate = useNavigate();

    const handleVerify = async (e) => {
        e.preventDefault();
        if (!idCard || !selfie) return toast.error("Please upload both documents");

        const formData = new FormData();
        formData.append('idCard', idCard);
        formData.append('selfie', selfie);

        setVerifying(true);
        const toastId = toast.loading('AI is analyzing your identity...');

        try {
            const res = await verifyIdentity(formData);
            setResult(res.data.verification);

            if (res.data.user.isVerified) {
                toast.success("Identity Verified Successfuly!", { id: toastId });
                localStorage.setItem('isVerified', 'true');
                setTimeout(() => navigate('/dashboard'), 2000);
            } else {
                toast.error("Verification Failed!", { id: toastId });
            }
        } catch (err) {
            toast.error(err.response?.data?.error || "Verification failed", { id: toastId });
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
                <div className="text-center mb-8">
                    <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ShieldCheck className="w-8 h-8 text-indigo-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Identity Verification</h1>
                    <p className="text-gray-500 mt-2">Before start a dispute, we need to verify your identity using AI.</p>
                </div>

                {!result || !result.verified ? (
                    <form onSubmit={handleVerify} className="space-y-6">
                        {/* ID Card Upload */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">1. Upload Government ID</label>
                            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    id="id-upload"
                                    onChange={(e) => setIdCard(e.target.files[0])}
                                />
                                <label htmlFor="id-upload" className="cursor-pointer">
                                    {idCard ? (
                                        <div className="text-green-600 flex items-center justify-center">
                                            <CheckCircle className="w-5 h-5 mr-2" /> {idCard.name}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center">
                                            <Upload className="w-8 h-8 text-gray-400 mb-2" />
                                            <span className="text-sm text-gray-500">Tap to upload Aadhaar/PAN</span>
                                        </div>
                                    )}
                                </label>
                            </div>
                        </div>

                        {/* Selfie Upload */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">2. Upload Selfie</label>
                            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    id="selfie-upload"
                                    onChange={(e) => setSelfie(e.target.files[0])}
                                />
                                <label htmlFor="selfie-upload" className="cursor-pointer">
                                    {selfie ? (
                                        <div className="text-green-600 flex items-center justify-center">
                                            <CheckCircle className="w-5 h-5 mr-2" /> {selfie.name}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center">
                                            <Upload className="w-8 h-8 text-gray-400 mb-2" />
                                            <span className="text-sm text-gray-500">Tap to upload Selfie</span>
                                        </div>
                                    )}
                                </label>
                            </div>
                        </div>

                        {result && !result.verified && (
                            <div className="bg-red-50 p-4 rounded-lg flex items-start">
                                <AlertCircle className="w-5 h-5 text-red-600 mr-2 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-red-800">Verification Failed</p>
                                    <p className="text-sm text-red-600">{result.reason}</p>
                                </div>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={verifying || !idCard || !selfie}
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                            {verifying ? 'Analyzing...' : 'Verify Identity'}
                        </button>
                    </form>
                ) : (
                    <div className="text-center space-y-4">
                        <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle className="w-8 h-8 text-green-600" />
                        </div>
                        <h2 className="text-xl font-bold text-green-800">Verified!</h2>
                        <p className="text-gray-600">Your identity has been confirmed. You can now access the dashboard.</p>
                        <p className="text-sm text-gray-500 bg-gray-100 p-3 rounded">AI Note: {result.reason}</p>
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                        >
                            Continue to Dashboard
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
