import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { verifyIdentity } from '../api';
import { 
    ShieldCheck, Upload, AlertCircle, CheckCircle, 
    Camera, CreditCard, Eye, Fingerprint, Loader2,
    XCircle, Info, AlertTriangle, User, FileCheck
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Verification() {
    const [idCard, setIdCard] = useState(null);
    const [selfie, setSelfie] = useState(null);
    const [idCardPreview, setIdCardPreview] = useState(null);
    const [selfiePreview, setSelfiePreview] = useState(null);
    const [verifying, setVerifying] = useState(false);
    const [currentStep, setCurrentStep] = useState('');
    const [result, setResult] = useState(null);
    const navigate = useNavigate();

    // Create image previews
    useEffect(() => {
        if (idCard) {
            const url = URL.createObjectURL(idCard);
            setIdCardPreview(url);
            return () => URL.revokeObjectURL(url);
        }
    }, [idCard]);

    useEffect(() => {
        if (selfie) {
            const url = URL.createObjectURL(selfie);
            setSelfiePreview(url);
            return () => URL.revokeObjectURL(url);
        }
    }, [selfie]);

    const handleVerify = async (e) => {
        e.preventDefault();
        if (!idCard || !selfie) return toast.error("Please upload both documents");

        const formData = new FormData();
        formData.append('idCard', idCard);
        formData.append('selfie', selfie);

        setVerifying(true);
        setCurrentStep('Uploading documents...');
        const toastId = toast.loading('AI is analyzing your identity...');

        // Simulate step progression for UX
        const steps = [
            'Analyzing ID document...',
            'Checking document authenticity...',
            'Analyzing selfie quality...',
            'Detecting liveness...',
            'Comparing faces...',
            'Finalizing verification...'
        ];
        
        let stepIndex = 0;
        const stepInterval = setInterval(() => {
            if (stepIndex < steps.length) {
                setCurrentStep(steps[stepIndex]);
                stepIndex++;
            }
        }, 2000);

        try {
            const res = await verifyIdentity(formData);
            clearInterval(stepInterval);
            setResult(res.data.verification);

            if (res.data.user.isVerified) {
                toast.success("Identity Verified Successfully!", { id: toastId });
                localStorage.setItem('isVerified', 'true');
                setTimeout(() => navigate('/dashboard'), 3000);
            } else {
                toast.error("Verification Failed - Please try again", { id: toastId });
            }
        } catch (err) {
            clearInterval(stepInterval);
            const errorMsg = err.response?.data?.error || "Verification failed";
            toast.error(errorMsg, { id: toastId });
            setResult({
                verified: false,
                reason: errorMsg,
                steps: err.response?.data?.verification?.steps || {}
            });
        } finally {
            setVerifying(false);
            setCurrentStep('');
        }
    };

    const renderStepResult = (stepName, stepData, icon) => {
        if (!stepData) return null;
        
        const Icon = icon;
        const isSuccess = stepData.valid || stepData.matchConfidence >= 75;
        
        return (
            <div className={`p-3 rounded-lg border ${isSuccess ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}`}>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                        <Icon className={`w-4 h-4 mr-2 ${isSuccess ? 'text-green-600' : 'text-red-600'}`} />
                        <span className={`font-medium text-sm ${isSuccess ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                            {stepName}
                        </span>
                    </div>
                    {isSuccess ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                        <XCircle className="w-4 h-4 text-red-600" />
                    )}
                </div>
                
                {/* Additional details */}
                <div className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
                    {stepData.documentType && (
                        <p>Document: <span className="font-medium">{stepData.documentType}</span></p>
                    )}
                    {stepData.confidence && (
                        <p>Confidence: <span className="font-medium">{stepData.confidence}%</span></p>
                    )}
                    {stepData.matchConfidence !== undefined && (
                        <p>Face Match: <span className={`font-medium ${stepData.matchConfidence >= 75 ? 'text-green-600' : 'text-red-600'}`}>
                            {stepData.matchConfidence}%
                        </span></p>
                    )}
                    {stepData.qualityScore && (
                        <p>Quality: <span className="font-medium">{stepData.qualityScore}%</span></p>
                    )}
                    {stepData.spoofingDetected && (
                        <p className="text-red-600 font-medium flex items-center">
                            <AlertTriangle className="w-3 h-3 mr-1" /> Spoofing Detected
                        </p>
                    )}
                    {stepData.issues && stepData.issues.length > 0 && (
                        <div className="mt-1">
                            <p className="text-red-600">Issues:</p>
                            <ul className="list-disc list-inside">
                                {stepData.issues.map((issue, i) => (
                                    <li key={i} className="text-red-500">{issue}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
            <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
                <div className="text-center mb-8">
                    <div className="bg-indigo-100 dark:bg-indigo-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ShieldCheck className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Identity Verification</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">
                        Our AI will verify your identity by analyzing your documents and comparing your face.
                    </p>
                </div>

                {/* Verification in progress overlay */}
                {verifying && (
                    <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
                        <div className="flex items-center justify-center mb-3">
                            <Loader2 className="w-6 h-6 text-indigo-600 animate-spin mr-2" />
                            <span className="font-medium text-indigo-800 dark:text-indigo-300">Verifying...</span>
                        </div>
                        <p className="text-center text-sm text-indigo-600 dark:text-indigo-400">{currentStep}</p>
                        <div className="mt-3 flex justify-center gap-2">
                            {['document', 'selfie', 'match'].map((step, i) => (
                                <div key={step} className="flex items-center">
                                    <div className={`w-2 h-2 rounded-full ${
                                        currentStep.toLowerCase().includes(step) || 
                                        (i === 0 && currentStep.includes('ID')) ||
                                        (i === 2 && currentStep.includes('Comparing'))
                                            ? 'bg-indigo-600 animate-pulse' 
                                            : 'bg-gray-300 dark:bg-gray-600'
                                    }`} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {!result || !result.verified ? (
                    <form onSubmit={handleVerify} className="space-y-6">
                        {/* Guidelines */}
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                            <div className="flex items-start">
                                <Info className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
                                <div className="text-sm text-blue-800 dark:text-blue-300">
                                    <p className="font-medium mb-1">For best results:</p>
                                    <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-400">
                                        <li>Use a clear, high-quality photo of your ID</li>
                                        <li>Ensure good lighting for your selfie</li>
                                        <li>Face the camera directly without glasses</li>
                                        <li>Avoid screenshots or photos of photos</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* ID Card Upload */}
                        <div className="space-y-2">
                            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                                <CreditCard className="w-4 h-4 mr-2" />
                                1. Upload Government ID (Aadhaar, PAN, Passport, Driver's License)
                            </label>
                            <div className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                                idCard 
                                    ? 'border-green-400 bg-green-50 dark:bg-green-900/20' 
                                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    id="id-upload"
                                    onChange={(e) => setIdCard(e.target.files[0])}
                                    disabled={verifying}
                                />
                                <label htmlFor="id-upload" className="cursor-pointer">
                                    {idCardPreview ? (
                                        <div className="space-y-2">
                                            <img 
                                                src={idCardPreview} 
                                                alt="ID Preview" 
                                                className="max-h-32 mx-auto rounded-lg shadow-sm"
                                            />
                                            <div className="text-green-600 dark:text-green-400 flex items-center justify-center text-sm">
                                                <CheckCircle className="w-4 h-4 mr-1" /> {idCard.name}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center py-4">
                                            <Upload className="w-8 h-8 text-gray-400 mb-2" />
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Click to upload ID document</span>
                                        </div>
                                    )}
                                </label>
                            </div>
                        </div>

                        {/* Selfie Upload */}
                        <div className="space-y-2">
                            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                                <Camera className="w-4 h-4 mr-2" />
                                2. Upload a Clear Selfie
                            </label>
                            <div className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                                selfie 
                                    ? 'border-green-400 bg-green-50 dark:bg-green-900/20' 
                                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    id="selfie-upload"
                                    onChange={(e) => setSelfie(e.target.files[0])}
                                    disabled={verifying}
                                />
                                <label htmlFor="selfie-upload" className="cursor-pointer">
                                    {selfiePreview ? (
                                        <div className="space-y-2">
                                            <img 
                                                src={selfiePreview} 
                                                alt="Selfie Preview" 
                                                className="max-h-32 mx-auto rounded-lg shadow-sm"
                                            />
                                            <div className="text-green-600 dark:text-green-400 flex items-center justify-center text-sm">
                                                <CheckCircle className="w-4 h-4 mr-1" /> {selfie.name}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center py-4">
                                            <Camera className="w-8 h-8 text-gray-400 mb-2" />
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Click to upload selfie</span>
                                        </div>
                                    )}
                                </label>
                            </div>
                        </div>

                        {/* Failed verification details */}
                        {result && !result.verified && (
                            <div className="space-y-3">
                                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
                                    <div className="flex items-start">
                                        <AlertCircle className="w-5 h-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="font-semibold text-red-800 dark:text-red-300">Verification Failed</p>
                                            <p className="text-sm text-red-600 dark:text-red-400 mt-1">{result.reason}</p>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Show step-by-step results if available */}
                                {result.steps && (
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Verification Steps:</p>
                                        {renderStepResult('Document Analysis', result.steps.documentAnalysis, FileCheck)}
                                        {renderStepResult('Selfie Analysis', result.steps.selfieAnalysis, User)}
                                        {renderStepResult('Face Comparison', result.steps.faceComparison, Fingerprint)}
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={verifying || !idCard || !selfie}
                            className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {verifying ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <Eye className="w-4 h-4 mr-2" />
                                    Verify with AI
                                </>
                            )}
                        </button>
                    </form>
                ) : (
                    <div className="space-y-6">
                        {/* Success header */}
                        <div className="text-center">
                            <div className="bg-green-100 dark:bg-green-900/30 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-10 h-10 text-green-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-green-800 dark:text-green-300">Identity Verified!</h2>
                            <p className="text-gray-600 dark:text-gray-400 mt-2">
                                Your identity has been successfully confirmed by our AI system.
                            </p>
                        </div>

                        {/* Verification details */}
                        {result.steps && (
                            <div className="space-y-3">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                                    <Fingerprint className="w-4 h-4 mr-2" />
                                    Verification Details
                                </p>
                                {renderStepResult('Document Analysis', result.steps.documentAnalysis, FileCheck)}
                                {renderStepResult('Selfie Analysis', result.steps.selfieAnalysis, User)}
                                {renderStepResult('Face Comparison', result.steps.faceComparison, Fingerprint)}
                            </div>
                        )}

                        {/* Overall confidence */}
                        {result.overallConfidence && (
                            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Overall Confidence</span>
                                    <span className="text-lg font-bold text-green-600">{result.overallConfidence}%</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                                    <div 
                                        className="bg-green-600 h-2 rounded-full transition-all duration-500" 
                                        style={{ width: `${result.overallConfidence}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* AI Note */}
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-200 dark:border-indigo-800">
                            <p className="text-sm text-indigo-800 dark:text-indigo-300">
                                <span className="font-medium">AI Analysis: </span>
                                {result.reason}
                            </p>
                        </div>

                        <button
                            onClick={() => navigate('/dashboard')}
                            className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center"
                        >
                            Continue to Dashboard
                            <CheckCircle className="w-4 h-4 ml-2" />
                        </button>
                    </div>
                )}

                {/* Security note */}
                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-center text-gray-500 dark:text-gray-400 flex items-center justify-center">
                        <ShieldCheck className="w-3 h-3 mr-1" />
                        Your data is encrypted and processed securely. We comply with GDPR regulations.
                    </p>
                </div>
            </div>
        </div>
    );
}
