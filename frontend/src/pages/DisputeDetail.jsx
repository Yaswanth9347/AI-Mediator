import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import api, { getDispute, getMessages, sendMessage, acceptCase, submitDecision, getMessageCount, getCaseHistory, downloadCaseSummaryReport, downloadAgreementPDF, getAgreementPreviewUrl, getStats, verifyGovtId } from '../api';
import { ArrowLeft, Send, Paperclip, CheckCircle, XCircle, User, Users, MessageCircle, Scale, AlertTriangle, Building, Clock, Shield, FileText, PenTool, Download, RefreshCw, X, ChevronDown, File, Image, FileAudio, Video, Eye, Mic, MicOff } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import toast from 'react-hot-toast';
import { useSocket } from '../context/SocketContext';
import { useNotifications } from '../context/NotificationContext';
import CaseHistory from '../components/CaseHistory';
import EvidenceSection from '../components/EvidenceSection';
import ResolutionProgress from '../components/ResolutionProgress';

// Helper function to get file type from path
const getFileType = (filePath) => {
    if (!filePath) return 'unknown';
    const ext = filePath.split('.').pop()?.toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    const docExts = ['pdf', 'doc', 'docx'];
    const videoExts = ['mp4', 'mpeg', 'mov', 'webm'];
    const audioExts = ['mp3', 'wav', 'ogg'];

    if (imageExts.includes(ext)) return 'image';
    if (docExts.includes(ext)) return 'document';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    return 'file';
};

// Helper function to get file name from path
const getFileName = (filePath) => {
    if (!filePath) return 'Unknown file';
    const parts = filePath.split('/');
    return parts[parts.length - 1];
};

// Helper function to build file URL
const getFileUrl = (filePath) => {
    if (!filePath) return '';
    if (filePath.startsWith('http')) return filePath;
    // Handle different path formats
    const cleanPath = filePath.replace(/^\.?\/?(uploads\/)?/, '');
    return `http://localhost:5000/uploads/${cleanPath}`;
};

export default function DisputeDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [dispute, setDispute] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messageCount, setMessageCount] = useState(0);
    const [newMessage, setNewMessage] = useState('');
    const [attachment, setAttachment] = useState(null);
    const [aiSolutions, setAiSolutions] = useState([]);
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef(null);

    // Attachment preview modal
    const [previewAttachment, setPreviewAttachment] = useState(null);

    // Speech-to-text state
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    const finalTranscriptRef = useRef(''); // Track final transcript separately to avoid duplication

    // Pagination for messages
    const [messagePage, setMessagePage] = useState(1);
    const [totalMessagePages, setTotalMessagePages] = useState(1);
    const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);

    // Socket.io for real-time updates
    const { socket, connected, joinDisputeRoom, leaveDisputeRoom, startTyping, stopTyping } = useSocket();
    const { acknowledgeAction } = useNotifications();
    const [typingUsers, setTypingUsers] = useState(new Set());
    const typingTimeoutRef = useRef(null);

    const currentUserEmail = localStorage.getItem('userEmail');
    const currentUsername = localStorage.getItem('username');
    const [currentUserIdResolved, setCurrentUserIdResolved] = useState(localStorage.getItem('userId')); // resolved from profile for reliable alignment
    const role = localStorage.getItem('role');
    const isAdmin = role === 'Admin';
    const isPlaintiff = dispute?.plaintiffEmail === currentUserEmail;
    const isDefendant = dispute?.respondentEmail === currentUserEmail;

    // Fetch Dispute Data
    const fetchData = async (loadMore = false) => {
        try {
            if (!loadMore) setLoading(true);
            const res = await getDispute(id);
            setDispute(res.data);
            if (res.data.aiSolutions) {
                try {
                    setAiSolutions(JSON.parse(res.data.aiSolutions));
                } catch (e) {
                    console.error('Failed to parse aiSolutions:', e);
                    setAiSolutions([]);
                }
            } else {
                setAiSolutions([]);
            }

            const pageToFetch = loadMore ? messagePage + 1 : 1;
            const msgs = await getMessages(id, { page: pageToFetch, limit: 20 });

            // Handle both old and new API response formats
            const messagesData = msgs.data.messages || msgs.data;
            const paginationData = msgs.data.pagination;

            if (loadMore) {
                setMessages(prev => [...prev, ...messagesData]);
                setMessagePage(pageToFetch);
            } else {
                setMessages(messagesData);
                setMessagePage(1);
            }

            if (paginationData) {
                setTotalMessagePages(paginationData.totalPages);
                setMessageCount(paginationData.totalItems);
            } else {
                const countRes = await getMessageCount(id);
                setMessageCount(countRes.data.count);
            }
        } catch (err) {
            console.error(err);
            toast.error('Failed to load dispute details');
        } finally {
            setLoading(false);
        }
    };

    const loadMoreMessages = async () => {
        setLoadingMoreMessages(true);
        await fetchData(true);
        setLoadingMoreMessages(false);
    };

    const updateDispute = async () => {
        await fetchData();
    };

    useEffect(() => {
        fetchData();
    }, [id]);

    // Resolve current user id reliably via profile to ensure alignment works across refresh/navigation
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const profile = await getUserProfile();
                const idStr = String(profile.data?.id ?? '');
                if (mounted && idStr) {
                    setCurrentUserIdResolved(idStr);
                    // Keep localStorage in sync for other parts of the app
                    if (localStorage.getItem('userId') !== idStr) {
                        localStorage.setItem('userId', idStr);
                    }
                }
            } catch (e) {
                // If profile fetch fails, we fallback to localStorage
                // Do not toast here to avoid noise in discussion page
            }
        })();
        return () => { mounted = false; };
    }, []);

    // Join dispute room for real-time updates with sync callback
    useEffect(() => {
        if (socket && connected && id) {
            // Pass sync callback to refetch data on reconnection
            joinDisputeRoom(id, () => {
                console.log('Reconnection sync: refetching dispute data');
                fetchData();
            });
            return () => leaveDisputeRoom(id);
        }
    }, [socket, connected, id, joinDisputeRoom, leaveDisputeRoom]);

    // Listen for real-time messages
    useEffect(() => {
        if (!socket) return;

        const handleNewMessage = (message) => {
            // Check if this is our optimistic message being confirmed
            setMessages(prev => {
                // Remove any pending version of this message and add the confirmed one
                const filtered = prev.filter(m =>
                    !(m.pending && m.content === message.content && m.senderId === message.senderId)
                );
                // Avoid duplicates
                if (filtered.some(m => m.id === message.id)) {
                    return filtered;
                }
                return [...filtered, message];
            });
            setMessageCount(prev => prev + 1);
        };

        const handleTyping = ({ username }) => {
            if (username !== currentUsername) {
                setTypingUsers(prev => new Set(prev).add(username));
            }
        };

        const handleStopTyping = ({ username }) => {
            setTypingUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(username);
                return newSet;
            });
        };

        const handleDisputeAccepted = (updatedDispute) => {
            setDispute(prev => ({ ...prev, ...updatedDispute }));
            toast.success('Case has been accepted!');
        };

        const handleAiReady = (data) => {
            console.log('AI Ready event received:', data);
            // Backend sends: { disputeId, status, aiSolutions }
            if (data.aiSolutions) {
                setAiSolutions(data.aiSolutions);
            } else if (data.solutions) {
                // Fallback for legacy format
                setAiSolutions(data.solutions);
            }
            // Update dispute status to AwaitingDecision
            if (data.status) {
                setDispute(prev => prev ? { ...prev, status: data.status } : prev);
            }
            toast.success('AI solutions are ready!');
        };

        // Handle dispute status changes
        const handleStatusChanged = (data) => {
            console.log('Dispute status changed:', data);
            setDispute(prev => prev ? {
                ...prev,
                status: data.status,
                resolutionStatus: data.resolutionStatus || prev?.resolutionStatus,
                forwardedToCourt: data.forwardedToCourt || prev?.forwardedToCourt,
                courtType: data.courtType || prev?.courtType
            } : prev);

            if (data.status === 'Reanalyzing') {
                setAiSolutions([]);
                toast.info('AI is generating new solutions...');
            } else if (data.status === 'ResolutionInProgress') {
                toast.success('Agreement reached! Proceeding to resolution.');
            } else if (data.status === 'ForwardedToCourt') {
                toast.info(`Case forwarded to ${data.courtType} Court`);
            }
        };

        // Handle vote recorded
        const handleVoteRecorded = (data) => {
            console.log('Vote recorded:', data);
            setDispute(prev => prev ? {
                ...prev,
                plaintiffChoice: data.plaintiffChoice,
                defendantChoice: data.defendantChoice
            } : prev);
            toast.info(`${data.voterRole === 'plaintiff' ? 'Plaintiff' : 'Defendant'} has voted`);
        };

        // Handle signature submitted
        const handleSignatureSubmitted = (data) => {
            console.log('Signature submitted:', data);
            setDispute(prev => prev ? {
                ...prev,
                plaintiffSignature: data.plaintiffSigned ? (prev?.plaintiffSignature || 'signed') : prev?.plaintiffSignature,
                respondentSignature: data.respondentSigned ? (prev?.respondentSignature || 'signed') : prev?.respondentSignature,
            } : prev);
            toast.success(`${data.signerName} has signed the agreement`);
        };

        // Handle agreement generated
        const handleAgreementGenerated = (data) => {
            console.log('Agreement generated:', data);
            setDispute(prev => prev ? {
                ...prev,
                status: data.status,
                resolutionStatus: data.resolutionStatus,
                agreementDocPath: data.agreementDocPath,
                documentId: data.documentId,
            } : prev);
            toast.success('Settlement agreement has been generated!');
        };

        // Handle resolution finalized
        const handleResolutionFinalized = (data) => {
            console.log('Resolution finalized:', data);
            setDispute(prev => prev ? {
                ...prev,
                status: data.status,
                resolutionStatus: data.resolutionStatus,
            } : prev);
            toast.success('🎉 Case has been resolved! Settlement agreement is ready.');
        };

        // Handle court forwarding
        const handleForwardedToCourt = (data) => {
            console.log('Case forwarded to court:', data);
            setDispute(prev => prev ? {
                ...prev,
                status: data.status,
                forwardedToCourt: true,
                courtType: data.courtType,
                courtName: data.courtName,
                courtLocation: data.courtLocation,
                courtForwardedAt: data.courtForwardedAt,
            } : prev);
            toast.info(`Case forwarded to ${data.courtName} (${data.courtType} Court)`);
        };

        // Handle evidence uploaded
        const handleEvidenceUploaded = (data) => {
            console.log('Evidence uploaded:', data);
            toast.success(`New evidence uploaded by ${data.evidence?.uploaderName}`);
            // Optionally trigger evidence refresh here
        };

        // Handle OCR complete
        const handleOcrComplete = (data) => {
            console.log('OCR completed for evidence:', data);
            // Could update evidence list or show notification
        };

        socket.on('message:new', handleNewMessage);
        socket.on('user:typing', handleTyping);
        socket.on('user:stop-typing', handleStopTyping);
        socket.on('dispute:accepted', handleDisputeAccepted);
        socket.on('dispute:ai-ready', handleAiReady);
        socket.on('dispute:status-changed', handleStatusChanged);
        socket.on('dispute:vote-recorded', handleVoteRecorded);
        socket.on('dispute:signature-submitted', handleSignatureSubmitted);
        socket.on('dispute:agreement-generated', handleAgreementGenerated);
        socket.on('dispute:resolution-finalized', handleResolutionFinalized);
        socket.on('dispute:forwarded-to-court', handleForwardedToCourt);
        socket.on('dispute:evidence-uploaded', handleEvidenceUploaded);
        socket.on('dispute:ocr-complete', handleOcrComplete);

        return () => {
            socket.off('message:new', handleNewMessage);
            socket.off('user:typing', handleTyping);
            socket.off('user:stop-typing', handleStopTyping);
            socket.off('dispute:accepted', handleDisputeAccepted);
            socket.off('dispute:ai-ready', handleAiReady);
            socket.off('dispute:status-changed', handleStatusChanged);
            socket.off('dispute:vote-recorded', handleVoteRecorded);
            socket.off('dispute:signature-submitted', handleSignatureSubmitted);
            socket.off('dispute:agreement-generated', handleAgreementGenerated);
            socket.off('dispute:resolution-finalized', handleResolutionFinalized);
            socket.off('dispute:forwarded-to-court', handleForwardedToCourt);
            socket.off('dispute:evidence-uploaded', handleEvidenceUploaded);
            socket.off('dispute:ocr-complete', handleOcrComplete);
        };
    }, [socket, currentUsername]);

    // Auto-scroll disabled: do not programmatically change scroll position on load or message updates.
    // The page should remain at the top by default and users can scroll manually.

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() && !attachment) return;

        const messageContent = newMessage.trim();
        setNewMessage('');
        finalTranscriptRef.current = ''; // Reset speech recognition transcript

        const formData = new FormData();
        formData.append('content', messageContent);
        if (attachment) formData.append('attachment', attachment);

        try {
            // Do not mutate messages here; rely on server socket to emit persisted message
            await sendMessage(id, formData);
            setAttachment(null);
            // Stop typing when message is sent
            if (socket && connected) {
                stopTyping(id);
            }
            // Message will arrive via 'message:new' socket event as a single persisted entry
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to send message');
        }
    };

    // Handle typing indicator
    const handleMessageChange = (e) => {
        const value = e.target.value;
        setNewMessage(value);

        // Sync the final transcript ref when user manually types/edits
        // This ensures speech recognition appends to the correct text
        finalTranscriptRef.current = value;

        if (socket && connected && value.trim()) {
            // Start typing
            startTyping(id);

            // Clear existing timeout
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }

            // Set timeout to stop typing after 2 seconds of inactivity
            typingTimeoutRef.current = setTimeout(() => {
                stopTyping(id);
            }, 2000);
        } else if (socket && connected && !e.target.value.trim()) {
            stopTyping(id);
        }
    };

    // Speech Recognition Functions
    const initSpeechRecognition = () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            toast.error('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
            return null;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.continuous = true;
        recognition.interimResults = true;
        // Empty string enables automatic language detection
        // Browser will detect the spoken language automatically
        recognition.lang = '';

        return recognition;
    };

    const startListening = () => {
        const recognition = initSpeechRecognition();
        if (!recognition) return;

        recognitionRef.current = recognition;

        // Initialize final transcript with current message content
        finalTranscriptRef.current = newMessage;

        recognition.onstart = () => {
            setIsListening(true);
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';

            // Process results from the current result index onwards
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    // Append final result to our tracked final transcript
                    const separator = finalTranscriptRef.current && !finalTranscriptRef.current.endsWith(' ') ? ' ' : '';
                    finalTranscriptRef.current += separator + transcript;
                } else {
                    // Accumulate interim results
                    interimTranscript += transcript;
                }
            }

            // Construct the display text: final transcript + current interim
            const displayText = finalTranscriptRef.current +
                (interimTranscript ? (finalTranscriptRef.current && !finalTranscriptRef.current.endsWith(' ') ? ' ' : '') + interimTranscript : '');

            setNewMessage(displayText);
        };

        recognition.onerror = (event) => {
            // Only log significant errors
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                console.error('Speech recognition error:', event.error);
            }

            // Handle different error types gracefully
            switch (event.error) {
                case 'no-speech':
                    // Silent - user simply didn't speak, they can try again
                    break;
                case 'aborted':
                    // Silent - user manually stopped
                    break;
                case 'audio-capture':
                    toast.error('No microphone found. Please check your device.');
                    break;
                case 'not-allowed':
                    toast.error('Microphone access denied. Please allow microphone access in your browser settings.');
                    break;
                case 'network':
                    toast.error('Network error. Please check your internet connection.');
                    break;
                default:
                    // Don't show error for minor issues
                    break;
            }

            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
            // Sync the final transcript ref with the current message state
            // This ensures consistency when user edits text manually
            finalTranscriptRef.current = newMessage;
        };

        try {
            recognition.start();
        } catch (error) {
            console.error('Failed to start speech recognition:', error);
            toast.error('Failed to start speech recognition. Please try again.');
            setIsListening(false);
        }
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setIsListening(false);
    };

    const toggleListening = () => {
        if (isListening) {
            stopListening();
        } else {
            // Sync final transcript ref with current message before starting
            finalTranscriptRef.current = newMessage;
            startListening();
        }
    };

    // Cleanup speech recognition on unmount or navigation
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
                recognitionRef.current = null;
            }
        };
    }, []);

    const handleIdUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Reset states
        setIdVerificationStatus('verifying');
        setVerificationError(null);
        setIdVerificationResult(null);

        const formData = new FormData();
        formData.append('idDocument', file);

        try {
            const res = await verifyGovtId(formData);

            if (res.data.verified) {
                setIdVerificationStatus('verified');
                setIdVerificationResult(res.data);
                toast.success('Identity verified successfully!');
            } else {
                setIdVerificationStatus('rejected');
                setVerificationError(res.data.error || 'Verification failed. Please try a clearer image.');
                toast.error('Identity verification failed');
            }
        } catch (err) {
            console.error('ID Verification Error:', err);
            setIdVerificationStatus('error');
            setVerificationError('Server error during verification. Please try again.');
            toast.error('Verification service error');
        }
    };

    const handleAcceptCase = async () => {
        // Enforce verification for defendant
        if (isDefendant && idVerificationStatus !== 'verified') {
            toast.error('Please verify your identity before accepting the case.');
            return;
        }

        try {
            const acceptData = {
                respondentIdVerified: idVerificationStatus === 'verified',
                respondentIdData: idVerificationResult
            };

            await acceptCase(id, acceptData);
            toast.success('You accepted the case.');
            acknowledgeAction(id, 'dispute'); // Clear "New Dispute" notification if exists
            fetchData();
        } catch (err) {
            toast.error('Failed to accept');
        }
    };

    const handleDecision = async (choiceIdx) => {
        try {
            const res = await submitDecision(id, choiceIdx);
            toast.success(res.data.message);
            acknowledgeAction(id, 'resolution'); // Clear "Resolution Ready" notification
            fetchData();
        } catch (err) {
            toast.error('Failed to submit decision');
        }
    };

    const handleRequestReanalysis = async () => {
        const remainingAttempts = 2 - (dispute.reanalysisCount || 0);

        if (remainingAttempts <= 0) {
            toast.error('Maximum reanalysis limit reached (3 attempts total)');
            return;
        }

        const confirmMessage = `Request AI to reanalyze this case and generate new solutions?\n\nReanalysis Count: ${(dispute.reanalysisCount || 0) + 1} of 3\nRemaining Attempts: ${remainingAttempts - 1}\n\nNote: Your current choices will be reset.`;

        if (!confirm(confirmMessage)) return;

        try {
            setLoading(true);
            const res = await api.post(`/disputes/${id}/request-reanalysis`);
            toast.success(res.data.message);
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to request reanalysis');
        } finally {
            setLoading(false);
        }
    };

    // PDF Download Handlers
    const handleDownloadCaseSummary = async () => {
        try {
            const isClosed = dispute?.status === 'Resolved' || dispute?.forwardedToCourt;
            if (!isClosed) {
                toast.error('Case summary is available only after the case is closed.');
                return;
            }
            toast.loading('Generating case summary report...', { id: 'pdf-summary' });
            const response = await downloadCaseSummaryReport(id);
            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Case_Summary_${id}_${Date.now()}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success('Case summary downloaded!', { id: 'pdf-summary' });
        } catch (err) {
            toast.error('Failed to download case summary', { id: 'pdf-summary' });
            console.error('PDF download error:', err);
        }
    };

    const handleDownloadAgreement = async () => {
        try {
            const ready = dispute?.status === 'Resolved' && dispute?.resolutionStatus === 'Finalized' && dispute?.agreementDocPath;
            if (!ready) {
                toast.error('Agreement is available only after admin finalization.');
                return;
            }
            toast.loading('Downloading settlement agreement...', { id: 'pdf-agreement' });
            const response = await downloadAgreementPDF(id);
            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Settlement_Agreement_Case_${id}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success('Settlement agreement downloaded!', { id: 'pdf-agreement' });
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to download agreement';
            toast.error(errorMsg, { id: 'pdf-agreement' });
            console.error('Agreement download error:', err);
        }
    };

    const handleViewAgreement = async () => {
        try {
            const ready = dispute?.status === 'Resolved' && dispute?.resolutionStatus === 'Finalized' && dispute?.agreementDocPath;
            if (!ready) {
                toast.error('Agreement preview is available only after admin finalization.');
                return;
            }
            const res = await getAgreementPreviewUrl(id);
            // API may return full URL or an object with data.url
            const url = res?.data?.url || res;
            if (!url) throw new Error('Preview URL not available');
            window.open(url, '_blank');
        } catch (err) {
            console.error('View agreement error:', err);
            toast.error('Failed to open agreement preview');
        }
    };

    // Show loading state
    if (loading || !dispute) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-blue-300 text-lg">Loading dispute details...</p>
                </div>
            </div>
        );
    }

    const myChoice = isPlaintiff ? dispute.plaintiffChoice : isDefendant ? dispute.defendantChoice : null;
    // Admins can view but cannot participate in case discussions
    const canParticipate = isPlaintiff || (isDefendant && dispute.respondentAccepted);

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Link to="/dashboard" className="inline-flex items-center text-blue-400 mb-6 hover:text-blue-300">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
            </Link>

            <div className="bg-slate-900/50 border border-blue-800 rounded-lg overflow-hidden mb-8">
                {/* Header */}
                <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-6 border-b border-blue-800">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-2xl font-bold mb-2 text-blue-100">{dispute.title}</h1>
                            <div className="flex items-center gap-4 text-sm text-blue-200">
                                <span className={`px-3 py-1 rounded text-xs font-medium ${dispute.status === 'Resolved' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}`}>
                                    {dispute.status}
                                </span>
                                <span>ID: #{dispute.id}</span>
                                <span>{new Date(dispute.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                        {/* PDF Reports Dropdown */}
                        <div className="relative">
                            <div className="flex flex-col sm:flex-row gap-2">
                                {(dispute.status === 'Resolved' || dispute.forwardedToCourt) && (
                                    <button
                                        onClick={handleDownloadCaseSummary}
                                        className="inline-flex items-center px-4 py-2 bg-blue-600/20 text-blue-200 rounded hover:bg-blue-600/30 font-medium transition-colors border border-blue-600/30 text-sm"
                                        title="Download a comprehensive summary of this case"
                                    >
                                        <File className="w-4 h-4 mr-2" /> Case Summary
                                    </button>
                                )}
                                {(dispute.status === 'Resolved' && dispute.resolutionStatus === 'Finalized' && dispute.agreementDocPath) && (
                                    <button
                                        onClick={handleDownloadAgreement}
                                        className="inline-flex items-center px-4 py-2 bg-green-600/20 text-green-200 rounded hover:bg-green-600/30 font-medium transition-colors border border-green-600/30 text-sm"
                                        title="Download the settlement agreement PDF"
                                    >
                                        <Download className="w-4 h-4 mr-2" /> Agreement
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Parties */}
                <div className="grid md:grid-cols-2 border-b border-blue-800">
                    <div className="p-6 border-r border-blue-800">
                        <div className="flex items-center mb-2">
                            <User className="w-4 h-4 mr-2 text-blue-400" />
                            <h3 className="font-semibold text-blue-200">Plaintiff</h3>
                        </div>
                        <p className="text-sm text-blue-100">{dispute.plaintiffName}</p>
                        <p className="text-xs text-blue-300">{dispute.plaintiffEmail}</p>
                    </div>
                    <div className="p-6">
                        <div className="flex items-center mb-2">
                            <Users className="w-4 h-4 mr-2 text-blue-400" />
                            <h3 className="font-semibold text-blue-200">Defendant</h3>
                        </div>
                        <p className="text-sm text-blue-100">{dispute.respondentName}</p>
                        <p className="text-xs text-blue-300">{dispute.respondentEmail}</p>
                    </div>
                </div>

                {/* Initial Statement */}
                <div className="p-6 border-b border-blue-800 bg-slate-900/30">
                    <h4 className="text-sm font-semibold text-blue-200 mb-2">Initial Complaint</h4>
                    <p className="text-sm text-blue-100">{dispute.description}</p>
                </div>

                {/* Accept Case Banner with Verification */}
                {isDefendant && !dispute.respondentAccepted && !dispute.forwardedToCourt && (
                    <div className="p-6 bg-slate-900/50 border-b border-blue-800">
                        <div className="mb-4">
                            <h3 className="text-lg font-bold text-blue-100 mb-2">Accept Case Logic</h3>
                            <p className="text-sm text-blue-300">
                                To ensure fairness and security, you must verify your identity before participating in this dispute.
                            </p>
                        </div>

                        <div className="flex flex-col md:flex-row items-center gap-6">
                            {/* Verification Status Card */}
                            <div className={`flex-1 w-full p-4 rounded-lg border ${idVerificationStatus === 'verified' ? 'bg-green-500/10 border-green-500/50' :
                                idVerificationStatus === 'rejected' || idVerificationStatus === 'error' ? 'bg-red-500/10 border-red-500/50' :
                                    'bg-slate-800 border-blue-800'
                                }`}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-semibold text-blue-200">Identity Verification</span>
                                    {idVerificationStatus === 'verifying' && <span className="text-xs text-blue-400 animate-pulse">Verifying...</span>}
                                    {idVerificationStatus === 'verified' && <span className="text-xs text-green-400 font-bold">✓ Verified</span>}
                                </div>

                                {idVerificationStatus === 'idle' && (
                                    <div className="text-center py-2">
                                        <p className="text-xs text-blue-400 mb-3">Please upload your Government ID (Aadhaar/PAN/Driving License)</p>
                                        <label className="cursor-pointer inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors">
                                            <input type="file" className="hidden" accept="image/*" onChange={handleIdUpload} />
                                            Upload ID Card
                                        </label>
                                    </div>
                                )}

                                {idVerificationStatus === 'verifying' && (
                                    <div className="flex justify-center py-4">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                                    </div>
                                )}

                                {idVerificationStatus === 'verified' && (
                                    <div className="text-sm">
                                        <p className="text-green-300 mb-1"><strong>Name:</strong> {idVerificationResult?.details?.name || 'Verified Person'}</p>
                                        <p className="text-green-300"><strong>ID No:</strong> {idVerificationResult?.details?.idNumber || 'Create'}</p>
                                    </div>
                                )}

                                {(idVerificationStatus === 'rejected' || idVerificationStatus === 'error') && (
                                    <div className="text-center py-2">
                                        <p className="text-xs text-red-400 mb-2">{verificationError}</p>
                                        <label className="cursor-pointer text-xs text-blue-400 hover:underline">
                                            <input type="file" className="hidden" accept="image/*" onChange={handleIdUpload} />
                                            Try Again
                                        </label>
                                    </div>
                                )}
                            </div>

                            {/* Action Button */}
                            <div className="shrink-0">
                                <button
                                    onClick={handleAcceptCase}
                                    disabled={idVerificationStatus !== 'verified'}
                                    className={`px-8 py-3 rounded-lg font-bold flex items-center transition-all ${idVerificationStatus === 'verified'
                                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 shadow-lg shadow-green-900/20'
                                        : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                        }`}
                                >
                                    <CheckCircle className="w-5 h-5 mr-2" />
                                    Accept Case
                                </button>
                                {idVerificationStatus !== 'verified' && (
                                    <p className="text-xs text-center text-slate-500 mt-2">Verification required</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Court Forwarded Banner */}
                {dispute.forwardedToCourt && (
                    <div className="p-4 sm:p-6 bg-slate-800/50 border-b border-blue-800">
                        <div className="flex flex-col sm:flex-row items-start">
                            <Building className="w-6 h-6 text-blue-400 mb-3 sm:mb-0 sm:mr-4 flex-shrink-0" />
                            <div className="flex-1">
                                <h3 className="text-base sm:text-lg font-bold text-blue-100 mb-2">
                                    Case Forwarded to Court
                                </h3>
                                <p className="text-xs sm:text-sm text-blue-200 mb-3">
                                    This case could not be resolved through AI-mediation and has been escalated to the traditional court system.
                                </p>
                                <div className="bg-slate-900/50 p-3 sm:p-4 rounded-lg border border-blue-800 space-y-2 text-xs sm:text-sm">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                                        <div>
                                            <span className="font-semibold text-blue-200">Court Type:</span>
                                            <span className="ml-2 text-blue-300">{dispute.courtType || 'District'} Court</span>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-blue-200">Court Name:</span>
                                            <span className="ml-2 text-blue-300">{dispute.courtName || 'N/A'}</span>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-blue-200">Location:</span>
                                            <span className="ml-2 text-blue-300">{dispute.courtLocation || 'N/A'}</span>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-blue-200">Forwarded On:</span>
                                            <span className="ml-2 text-blue-300">
                                                {dispute.courtForwardedAt ? new Date(dispute.courtForwardedAt).toLocaleDateString() : 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                    {dispute.courtReason && (
                                        <div className="pt-2 border-t border-blue-800">
                                            <span className="font-semibold text-blue-200">Reason:</span>
                                            <p className="mt-1 text-blue-300">{dispute.courtReason}</p>
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-blue-300 mt-3 italic">
                                    Both parties will receive further instructions from the court system. This case is now closed on MediaAI platform.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Resolution Workflow Section */}
                {(dispute.status === 'ResolutionInProgress' || dispute.status === 'PendingAdminApproval' || dispute.status === 'Resolved' || dispute.resolutionStatus !== 'None') && !dispute.forwardedToCourt && (
                    <ResolutionSection
                        dispute={dispute}
                        isPlaintiff={isPlaintiff}
                        isDefendant={isDefendant}
                        isAdmin={isAdmin}
                        onUpdate={updateDispute}
                        onViewAgreement={handleViewAgreement}
                        onDownloadAgreement={handleDownloadAgreement}
                        onDownloadCaseSummary={handleDownloadCaseSummary}
                    />
                )}

                {/* AI Solutions Section: Show ONLY if NOT in resolution phase yet */}
                {Array.isArray(aiSolutions) && aiSolutions.length > 0 && !dispute.forwardedToCourt && dispute.resolutionStatus === 'None' && dispute.status !== 'ResolutionInProgress' && dispute.status !== 'Resolved' && (
                    <div className="p-4 sm:p-6 bg-slate-900/30 border-b border-blue-800">
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                            <Scale className="w-5 h-5 text-blue-400" />
                            <h3 className="text-base sm:text-lg font-bold text-blue-100">AI Proposed Solutions</h3>
                            {dispute.reanalysisCount > 0 && (
                                <span className="px-2 py-0.5 bg-blue-950/50 text-blue-300 text-xs rounded border border-blue-800">Reanalyzed</span>
                            )}
                        </div>

                        {dispute.aiAnalysis && (
                            <div className="mb-4 p-3 bg-slate-800/50 rounded-lg text-xs sm:text-sm text-blue-200 border border-blue-800 whitespace-pre-line overflow-x-auto">
                                {dispute.aiAnalysis}
                            </div>
                        )}

                        <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                            {aiSolutions.map((solution, idx) => (
                                <div key={idx} className={`bg-slate-800/50 p-3 sm:p-4 rounded-lg border ${myChoice === idx ? 'ring-2 ring-blue-500 border-blue-500' : 'border-blue-800'}`}>
                                    <h4 className="font-semibold text-sm sm:text-base text-blue-100 mb-2">Option {idx + 1}: {solution.title}</h4>
                                    <p className="text-xs sm:text-sm text-blue-200 mb-3">{solution.description}</p>
                                    <div className="text-xs space-y-1 mb-4">
                                        <p className="text-blue-300 break-words">✓ Plaintiff: {solution.benefitsPlaintiff}</p>
                                        <p className="text-blue-300 break-words">✓ Defendant: {solution.benefitsDefendant}</p>
                                    </div>
                                    {dispute.status === 'AwaitingDecision' && (isPlaintiff || isDefendant) && myChoice === null && (
                                        <button onClick={() => handleDecision(idx)} className="w-full mt-2 py-2 px-3 bg-blue-950/50 text-blue-200 rounded-md text-xs sm:text-sm font-medium hover:bg-blue-900/50 border border-blue-700 transition-colors">
                                            Vote for Option {idx + 1}
                                        </button>
                                    )}
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {dispute.plaintiffChoice === idx && <span className="text-xs bg-blue-950/50 text-blue-300 px-2 py-1 rounded border border-blue-700">Plaintiff Voted</span>}
                                        {dispute.defendantChoice === idx && <span className="text-xs bg-blue-950/50 text-blue-300 px-2 py-1 rounded border border-blue-700">Defendant Voted</span>}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Request Reanalysis Button */}
                        {dispute.status === 'AwaitingDecision' && (isPlaintiff || isDefendant) && (dispute.reanalysisCount || 0) < 2 && (
                            <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-slate-800/50 rounded-lg border border-blue-800">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                    <div className="flex-1">
                                        <h4 className="font-semibold text-sm sm:text-base text-blue-100 flex items-center">
                                            <RefreshCw className="w-4 h-4 mr-2 text-blue-400" />
                                            Not satisfied with these solutions?
                                        </h4>
                                        <p className="text-sm text-blue-200 mt-1">
                                            You can request AI to reanalyze this case and generate new solutions.
                                        </p>
                                        <p className="text-xs text-blue-300 mt-2">
                                            Analysis {(dispute.reanalysisCount || 0) + 1} of 3 • {2 - (dispute.reanalysisCount || 0)} reanalysis attempts remaining
                                        </p>
                                        {(dispute.reanalysisCount || 0) >= 1 && (
                                            <p className="text-xs text-yellow-400 mt-1 font-medium">
                                                ⚠️ {(dispute.reanalysisCount || 0) === 1 ? 'Final reanalysis attempt available' : 'Last chance for reanalysis'}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleRequestReanalysis}
                                        disabled={loading}
                                        className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                        {loading ? 'Reanalyzing...' : 'Request Reanalysis'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Decision Footer */}
                        {dispute.status === 'AwaitingDecision' && (isPlaintiff || isDefendant) && (
                            <div className="mt-6 p-4 bg-slate-800/50 rounded-lg border border-blue-800">
                                <h4 className="font-semibold text-blue-100 mb-2">Status</h4>
                                {myChoice === null ? (
                                    <div>
                                        <p className="text-sm text-blue-200 mb-4">Please review the AI proposed solutions above. You can vote for the one you prefer, or reject all if none are suitable.</p>
                                        <button onClick={() => handleDecision(-1)} className="w-full md:w-auto py-2 px-4 bg-red-500/20 text-red-300 rounded-lg font-medium hover:bg-red-500/30 flex items-center justify-center border border-red-500/30">
                                            <XCircle className="w-4 h-4 mr-2" /> Reject All Solutions
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center text-green-400">
                                        <CheckCircle className="w-5 h-5 mr-2" />
                                        <span>You voted for Option {myChoice + 1}. Waiting for other party...</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Evidence Section */}
            {!dispute.forwardedToCourt && (
                <div className="mt-6 mb-6">
                    <EvidenceSection
                        disputeId={id}
                        isPlaintiff={isPlaintiff}
                        isDefendant={isDefendant}
                        isAdmin={isAdmin}
                        messageAttachments={messages}
                        caseStatus={dispute.status}
                    />
                </div>
            )}

            {/* Chat Section */}
            {(dispute.respondentAccepted || isPlaintiff || isAdmin) && !dispute.forwardedToCourt && (
                <div className="bg-slate-900/50 border border-blue-800 rounded-lg overflow-hidden h-[500px] md:h-[700px] flex flex-col">
                    <div className="px-3 sm:px-4 py-2 sm:py-3 bg-slate-900/70 border-b border-blue-800 flex items-center justify-between shrink-0">
                        <div className="flex items-center">
                            <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2 text-blue-400" />
                            <h3 className="font-semibold text-sm sm:text-base text-blue-100">Case Discussion</h3>
                        </div>
                        <span className="text-xs sm:text-sm text-blue-300 hidden sm:inline">
                            {messageCount >= 10 ? <span className="text-green-400 font-medium">AI Analysis Ready ✓</span> : `${10 - messageCount} more messages for AI analysis`}
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/50">
                        {/* Load More Button (at top for older messages) */}
                        {messagePage < totalMessagePages && (
                            <div className="flex justify-center mb-4">
                                <button
                                    onClick={loadMoreMessages}
                                    disabled={loadingMoreMessages}
                                    className="px-4 py-2 bg-blue-950/50 text-blue-200 rounded-lg hover:bg-blue-900/50 disabled:opacity-50 flex items-center gap-2 transition-colors border border-blue-800"
                                >
                                    {loadingMoreMessages ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            Loading...
                                        </>
                                    ) : (
                                        <>
                                            <ChevronDown className="w-4 h-4" />
                                            Load Earlier Messages ({(totalMessagePages - messagePage) * 20} more)
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {messages.length === 0 ? <p className="text-center text-blue-300 py-10 text-sm">Start the conversation</p> :
                            messages.map((msg) => {
                                // Alignment logic:
                                // - For plaintiff: own messages on right, defendant on left
                                // - For defendant: own messages on right, plaintiff on left  
                                // - For admin: show plaintiff's view (plaintiff on right, defendant on left)
                                const isOwnMessage = isAdmin
                                    ? msg.senderRole === 'plaintiff'  // Admin sees plaintiff's perspective
                                    : String(msg.senderId) === String(currentUserIdResolved);
                                // Keep role label display
                                const isPlaintiffMessage = msg.senderRole === 'plaintiff';
                                const isDefendantMessage = msg.senderRole === 'defendant';

                                return (
                                    <div
                                        key={msg.id}
                                        className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} ${msg.pending ? 'opacity-70' : ''}`}
                                    >
                                        <div className={`max-w-[85%] sm:max-w-xs md:max-w-2xl px-3 sm:px-4 py-2 rounded-lg ${isOwnMessage
                                            ? 'bg-blue-900/60 text-blue-50 border border-blue-600 rounded-br-sm'
                                            : 'bg-slate-700/70 text-slate-100 border border-slate-500 rounded-bl-sm'
                                            }`}>
                                            <p className={`text-xs font-semibold mb-1 ${isOwnMessage
                                                ? 'text-blue-200'
                                                : 'text-slate-300'
                                                }`}>
                                                {msg.senderName} <span className={`font-normal ${isOwnMessage ? 'text-blue-300' : 'text-slate-400'}`}>({msg.senderRole})</span>
                                            </p>
                                            <p className="text-xs sm:text-sm break-words">{msg.content}</p>
                                            {msg.attachmentPath && !msg.pending && (() => {
                                                const fileType = getFileType(msg.attachmentPath);
                                                const fileUrl = getFileUrl(msg.attachmentPath);
                                                const fileName = getFileName(msg.attachmentPath);

                                                if (fileType === 'image') {
                                                    return (
                                                        <div className="mt-2 relative group">
                                                            <img
                                                                src={fileUrl}
                                                                alt="Attachment"
                                                                className={`max-w-[200px] max-h-[150px] object-cover rounded cursor-pointer transition-all ${isOwnMessage
                                                                    ? 'border border-blue-600 hover:border-blue-400'
                                                                    : 'border border-slate-500 hover:border-slate-400'
                                                                    }`}
                                                                onClick={() => setPreviewAttachment({ type: 'image', url: fileUrl, name: fileName })}
                                                            />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                                                                <Eye className="w-6 h-6 text-white" />
                                                            </div>
                                                        </div>
                                                    );
                                                } else if (fileType === 'document') {
                                                    const isPdf = fileName.toLowerCase().endsWith('.pdf');
                                                    return (
                                                        <div
                                                            className={`mt-2 flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${isOwnMessage
                                                                ? 'bg-blue-800/40 hover:bg-blue-800/60 border border-blue-600'
                                                                : 'bg-slate-600/40 hover:bg-slate-600/60 border border-slate-500'
                                                                }`}
                                                            onClick={() => setPreviewAttachment({ type: 'document', url: fileUrl, name: fileName, isPdf })}
                                                        >
                                                            <FileText className={`w-8 h-8 ${isPdf ? 'text-red-400' : 'text-blue-400'}`} />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-medium truncate">{fileName}</p>
                                                                <p className="text-xs opacity-70">{isPdf ? 'PDF Document' : 'Document'}</p>
                                                            </div>
                                                            <Eye className="w-4 h-4 opacity-60" />
                                                        </div>
                                                    );
                                                } else if (fileType === 'video') {
                                                    return (
                                                        <div
                                                            className={`mt-2 flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${isOwnMessage
                                                                ? 'bg-blue-800/40 hover:bg-blue-800/60 border border-blue-600'
                                                                : 'bg-slate-600/40 hover:bg-slate-600/60 border border-slate-500'
                                                                }`}
                                                            onClick={() => setPreviewAttachment({ type: 'video', url: fileUrl, name: fileName })}
                                                        >
                                                            <Video className="w-8 h-8 text-purple-400" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-medium truncate">{fileName}</p>
                                                                <p className="text-xs opacity-70">Video</p>
                                                            </div>
                                                            <Eye className="w-4 h-4 opacity-60" />
                                                        </div>
                                                    );
                                                } else if (fileType === 'audio') {
                                                    return (
                                                        <div
                                                            className={`mt-2 flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${isOwnMessage
                                                                ? 'bg-blue-800/40 hover:bg-blue-800/60 border border-blue-600'
                                                                : 'bg-slate-600/40 hover:bg-slate-600/60 border border-slate-500'
                                                                }`}
                                                            onClick={() => setPreviewAttachment({ type: 'audio', url: fileUrl, name: fileName })}
                                                        >
                                                            <FileAudio className="w-8 h-8 text-green-400" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-medium truncate">{fileName}</p>
                                                                <p className="text-xs opacity-70">Audio</p>
                                                            </div>
                                                            <Eye className="w-4 h-4 opacity-60" />
                                                        </div>
                                                    );
                                                } else {
                                                    return (
                                                        <div
                                                            className={`mt-2 flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${isOwnMessage
                                                                ? 'bg-blue-800/40 hover:bg-blue-800/60 border border-blue-600'
                                                                : 'bg-slate-600/40 hover:bg-slate-600/60 border border-slate-500'
                                                                }`}
                                                            onClick={() => window.open(fileUrl, '_blank')}
                                                        >
                                                            <File className="w-8 h-8 text-gray-400" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-medium truncate">{fileName}</p>
                                                                <p className="text-xs opacity-70">File</p>
                                                            </div>
                                                            <Download className="w-4 h-4 opacity-60" />
                                                        </div>
                                                    );
                                                }
                                            })()}
                                            <div className={`flex items-center gap-2 mt-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                                                <p className={`text-xs ${isOwnMessage ? 'text-blue-300' : 'text-slate-400'}`}>
                                                    {new Date(msg.createdAt).toLocaleTimeString()}
                                                </p>
                                                {msg.pending && (
                                                    <span className="text-xs text-blue-400 italic flex items-center gap-1">
                                                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                        </svg>
                                                        Sending...
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        }

                        {/* Typing indicator */}
                        {typingUsers.size > 0 && (
                            <div className="flex justify-start mb-2">
                                <div className="max-w-xs px-4 py-2 rounded-lg bg-slate-800/70 border border-blue-800">
                                    <p className="text-xs text-blue-300 italic">
                                        {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
                                    </p>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {canParticipate && dispute.status !== 'Resolved' && (
                        <div className="border-t border-blue-800 bg-slate-900/70 shrink-0">
                            {/* Listening Indicator */}
                            {isListening && (
                                <div className="px-4 pt-2 flex items-center justify-center">
                                    <div className="flex items-center gap-2 text-red-400 text-xs">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                        </span>
                                        <span>Listening... (auto-detecting language)</span>
                                    </div>
                                </div>
                            )}

                            {/* Message Input Row */}
                            <form onSubmit={handleSendMessage} className="p-2 sm:p-4 flex items-center gap-1 sm:gap-2">
                                <label className="cursor-pointer text-blue-400 hover:text-blue-300 p-1.5" title="Attach file (images, PDF, documents)">
                                    <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                                    <input type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,video/*,audio/*" onChange={(e) => setAttachment(e.target.files[0])} />
                                </label>

                                {/* Microphone Button */}
                                <button
                                    type="button"
                                    onClick={toggleListening}
                                    className={`p-1.5 rounded-full transition-all ${isListening
                                        ? 'bg-red-500 text-white animate-pulse hover:bg-red-600'
                                        : 'text-blue-400 hover:text-blue-300 hover:bg-blue-900/30'
                                        }`}
                                    title={isListening ? 'Stop listening' : 'Speak your message'}
                                >
                                    {isListening ? (
                                        <MicOff className="w-4 h-4 sm:w-5 sm:h-5" />
                                    ) : (
                                        <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                                    )}
                                </button>

                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={handleMessageChange}
                                    placeholder={isListening ? "Speak now..." : "Type or speak your message..."}
                                    className={`flex-1 px-4 py-2.5 text-sm border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-900/50 text-blue-100 placeholder-blue-500 transition-colors ${isListening
                                        ? 'border-red-500/50 ring-1 ring-red-500/30'
                                        : 'border-blue-800'
                                        }`}
                                />

                                <button
                                    type="submit"
                                    disabled={!newMessage.trim() && !attachment}
                                    className="p-1.5 sm:p-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                                >
                                    <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                                </button>
                            </form>
                        </div>
                    )}
                    {attachment && <div className="px-3 sm:px-4 pb-2 text-xs sm:text-sm text-green-400">📎 {attachment.name}</div>}
                </div>
            )}

            {/* Attachment Preview Modal */}
            {previewAttachment && (
                <div
                    className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
                    onClick={() => setPreviewAttachment(null)}
                >
                    <div
                        className="relative max-w-4xl max-h-[90vh] w-full bg-slate-900 rounded-lg overflow-hidden border border-blue-800"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-3 border-b border-blue-800 bg-slate-800">
                            <div className="flex items-center gap-2">
                                {previewAttachment.type === 'image' && <Image className="w-5 h-5 text-blue-400" />}
                                {previewAttachment.type === 'document' && <FileText className="w-5 h-5 text-red-400" />}
                                {previewAttachment.type === 'video' && <Video className="w-5 h-5 text-purple-400" />}
                                {previewAttachment.type === 'audio' && <FileAudio className="w-5 h-5 text-green-400" />}
                                <span className="text-sm text-blue-100 truncate max-w-[300px]">{previewAttachment.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <a
                                    href={previewAttachment.url}
                                    download
                                    className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded transition-colors"
                                    title="Download"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Download className="w-5 h-5" />
                                </a>
                                <button
                                    onClick={() => setPreviewAttachment(null)}
                                    className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-4 flex items-center justify-center overflow-auto max-h-[calc(90vh-60px)]">
                            {previewAttachment.type === 'image' && (
                                <img
                                    src={previewAttachment.url}
                                    alt={previewAttachment.name}
                                    className="max-w-full max-h-[70vh] object-contain rounded"
                                />
                            )}
                            {previewAttachment.type === 'document' && previewAttachment.isPdf && (
                                <iframe
                                    src={previewAttachment.url}
                                    className="w-full h-[70vh] rounded border border-slate-700"
                                    title={previewAttachment.name}
                                />
                            )}
                            {previewAttachment.type === 'document' && !previewAttachment.isPdf && (
                                <div className="text-center p-8">
                                    <FileText className="w-16 h-16 text-blue-400 mx-auto mb-4" />
                                    <p className="text-blue-100 mb-4">{previewAttachment.name}</p>
                                    <p className="text-sm text-gray-400 mb-4">Document preview not available</p>
                                    <a
                                        href={previewAttachment.url}
                                        download
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                                    >
                                        <Download className="w-4 h-4" />
                                        Download File
                                    </a>
                                </div>
                            )}
                            {previewAttachment.type === 'video' && (
                                <video
                                    src={previewAttachment.url}
                                    controls
                                    className="max-w-full max-h-[70vh] rounded"
                                >
                                    Your browser does not support video playback.
                                </video>
                            )}
                            {previewAttachment.type === 'audio' && (
                                <div className="text-center p-8">
                                    <FileAudio className="w-16 h-16 text-green-400 mx-auto mb-4" />
                                    <p className="text-blue-100 mb-4">{previewAttachment.name}</p>
                                    <audio
                                        src={previewAttachment.url}
                                        controls
                                        className="w-full max-w-md"
                                    >
                                        Your browser does not support audio playback.
                                    </audio>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ResolutionSection({ dispute, isPlaintiff, isDefendant, isAdmin, onUpdate, onViewAgreement, onDownloadAgreement, onDownloadCaseSummary }) {
    const token = localStorage.getItem('token');
    const sigPad = useRef({});
    const [loading, setLoading] = useState(false);

    // Resolution Progress Logic
    const steps = [
        { label: 'Verify Details', description: 'Confirm your personal information' },
        { label: 'Digital Signature', description: 'Sign the resolution agreement' },
        { label: 'Admin Review', description: 'Final compliance check' },
        { label: 'Resolved', description: 'Case closed and agreement generated' }
    ];

    let currentStep = 0;
    if (dispute.status === 'Resolved') currentStep = 4;
    else if (dispute.status === 'PendingAdminApproval' || dispute.resolutionStatus === 'AdminReview') currentStep = 2;
    else if (dispute.plaintiffSignature && dispute.respondentSignature) currentStep = 2;
    else if (dispute.plaintiffVerified && dispute.respondentVerified) currentStep = 1;
    else currentStep = 0;

    // View state logic
    // If case is resolved and not viewed yet -> Expanded.
    // If case is resolved and viewed -> Compact.
    // If case is in progress -> Always Compact (or Expanded? Requirement says "Full steps only on first visit").
    // Let's default to Compact for in-progress to be non-intrusive, unless it's the very first time? 
    // Actually, distinct phases usually benefit from specific focus. The user wants to "reduce clutter".
    // I'll use the resolutionViewed flag as the main driver.
    const [isCompact, setIsCompact] = useState(dispute.resolutionViewed);

    const handleToggleExpand = () => setIsCompact(!isCompact);

    // Mark as viewed if Resolved and not yet marked
    useEffect(() => {
        if (dispute.status === 'Resolved' && !dispute.resolutionViewed) {
            // Mark as viewed in backend so next visit is compact
            api.post(`/disputes/${dispute.id}/resolution-viewed`).catch(err => console.error('Failed to mark resolution viewed', err));
        }
    }, [dispute.status, dispute.resolutionViewed, dispute.id]);


    // Determine current user's role status
    const verified = isPlaintiff ? dispute.plaintiffVerified : isDefendant ? dispute.respondentVerified : true;
    const signed = isPlaintiff ? dispute.plaintiffSignature : isDefendant ? dispute.respondentSignature : true;

    // Admin View
    if (isAdmin) {
        return (
            <div className="bg-slate-800/50 p-6 rounded-lg border border-blue-800 mb-6">
                <ResolutionProgress
                    steps={steps}
                    currentStep={currentStep}
                    isCompact={isCompact}
                    onToggleExpand={handleToggleExpand}
                />


                <h3 className="text-xl font-bold text-blue-100 mb-4 flex items-center mt-4">
                    <Shield className="w-6 h-6 mr-2 text-blue-400" /> Administrative Review
                </h3>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm text-blue-200">
                        <div className={dispute.plaintiffVerified ? "text-green-400" : "text-red-400"}>Plaintiff Verified: {dispute.plaintiffVerified ? 'YES' : 'NO'}</div>
                        <div className={dispute.respondentVerified ? "text-green-400" : "text-red-400"}>Respondent Verified: {dispute.respondentVerified ? 'YES' : 'NO'}</div>
                        <div className={dispute.plaintiffSignature ? "text-green-400" : "text-red-400"}>Plaintiff Signed: {dispute.plaintiffSignature ? 'YES' : 'NO'}</div>
                        <div className={dispute.respondentSignature ? "text-green-400" : "text-red-400"}>Respondent Signed: {dispute.respondentSignature ? 'YES' : 'NO'}</div>
                    </div>

                    {dispute.resolutionStatus === 'AdminReview' && (
                        <div className="bg-blue-950/30 p-4 rounded border border-blue-800">
                            <p className="font-semibold text-blue-200 mb-2">Action Required: Review Draft Agreement</p>
                            <p className="text-sm text-blue-300 mb-4">Both parties have accepted and signed. Please preview the document below before finalizing.</p>

                            {dispute.documentId && (
                                <div className="mb-4 p-3 bg-slate-900/50 rounded border border-blue-800">
                                    <p className="text-xs font-semibold text-blue-300 mb-2">Document Metadata</p>
                                    <div className="grid grid-cols-2 gap-2 text-xs text-blue-200">
                                        <div><span className="font-semibold">Document ID:</span> {dispute.documentId.substring(0, 16)}...</div>
                                        <div><span className="font-semibold">Hash:</span> {dispute.documentHash?.substring(0, 16)}...</div>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-4">
                                {dispute.agreementDocPath && (
                                    <button
                                        onClick={() => {
                                            const token = localStorage.getItem('token');
                                            const url = `http://localhost:5000/api/disputes/${dispute.id}/report/agreement/preview?token=${encodeURIComponent(token)}`;
                                            window.open(url, '_blank');
                                        }}
                                        className="px-4 py-2 bg-slate-900/50 border border-blue-800 rounded text-blue-200 hover:bg-slate-800/50 flex items-center"
                                    >
                                        <FileText className="w-4 h-4 mr-2" /> View Draft PDF
                                    </button>
                                )}
                                <button
                                    onClick={async () => {
                                        try {
                                            await api.post(`/admin/approve-resolution/${dispute.id}`);
                                            toast.success('Resolution Finalized!');
                                            onUpdate();
                                        } catch (e) { toast.error('Failed to approve'); }
                                    }}
                                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded hover:from-blue-700 hover:to-indigo-700 font-bold"
                                >
                                    Approve & Finalize
                                </button>
                            </div>
                        </div>
                    )}

                    {dispute.status === 'Resolved' && (
                        <div className="p-4 bg-green-500/20 rounded border border-green-500/30 text-green-400 font-bold flex items-center">
                            <CheckCircle className="w-6 h-6 mr-2" /> Case Officially Resolved and Closed.
                        </div>
                    )}

                    {/* Court Forwarding Section - Only show for active unresolved cases */}
                    {dispute.status !== 'Resolved' && !dispute.forwardedToCourt && (
                        <CourtForwardingModal dispute={dispute} onUpdate={onUpdate} />
                    )}
                </div>
            </div>
        );
    }

    // User View
    if (!isPlaintiff && !isDefendant && !isAdmin) return null; // Bystander

    // Select details based on role
    const myDetails = isPlaintiff ? {
        name: dispute.plaintiffName,
        email: dispute.plaintiffEmail,
        phone: dispute.plaintiffPhone,
        address: dispute.plaintiffAddress,
        occupation: dispute.plaintiffOccupation
    } : {
        name: dispute.respondentName,
        email: dispute.respondentEmail,
        phone: dispute.respondentPhone,
        address: dispute.respondentAddress,
        occupation: dispute.respondentOccupation
    };

    const confirmDetails = async () => {
        try {
            await api.post(`/disputes/${dispute.id}/verify-details`, { confirmed: true });
            toast.success('Details Confirmed');
            onUpdate();
        } catch (e) { toast.error('Error confirming details'); }
    };

    const submitSignature = async () => {
        if (sigPad.current.isEmpty()) return toast.error('Please sign first');
        const dataURL = sigPad.current.getCanvas().toDataURL('image/png');
        const blob = await (await fetch(dataURL)).blob(); // Convert base64 to blob

        const formData = new FormData();
        formData.append('signature', blob, 'signature.png');

        setLoading(true);
        try {
            await api.post(`/disputes/${dispute.id}/sign`, formData);
            toast.success('Signature Submitted');
            onUpdate();
        } catch (e) { toast.error('Error submitting signature'); }
        setLoading(false);
    };

    return (
        <div className="bg-slate-800/50 p-6 rounded-lg border border-blue-800 mb-6">
            <ResolutionProgress
                steps={steps}
                currentStep={currentStep}
                isCompact={isCompact}
                onToggleExpand={handleToggleExpand}
            />

            <div className="space-y-8 mt-6">
                {/* Step 1: Verification */}
                {(!isCompact || !verified) && (
                    <div className="flex items-start">
                        <div className={`p-2 rounded-full mr-4 ${verified ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                            {verified ? <CheckCircle className="w-6 h-6" /> : <Users className="w-6 h-6" />}
                        </div>
                        <div className="flex-1">
                            <h4 className={`font-semibold text-lg flex items-center gap-2 ${verified ? 'text-green-400' : 'text-blue-100'}`}>
                                Step 1: Confirm Personal Details
                                {verified && <CheckCircle className="w-5 h-5 text-green-400" />}
                            </h4>

                            {!verified && (
                                <>
                                    <p className="text-sm text-blue-200 mb-4">Please verify that your details below are correct for the legal agreement.</p>

                                    <div className="bg-slate-900/50 p-4 rounded-md border border-blue-800 grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4 max-w-lg">
                                        <span className="text-blue-300">Full Name:</span>
                                        <span className="font-medium text-blue-100">{myDetails.name}</span>

                                        <span className="text-blue-300">Email:</span>
                                        <span className="font-medium text-blue-100">{myDetails.email}</span>

                                        <span className="text-blue-300">Phone:</span>
                                        <span className="font-medium text-blue-100">{myDetails.phone}</span>

                                        <span className="text-blue-300">Occupation:</span>
                                        <span className="font-medium text-blue-100">{myDetails.occupation}</span>

                                        <span className="text-blue-300">Address:</span>
                                        <span className="font-medium text-blue-100">{myDetails.address}</span>
                                    </div>

                                    <button onClick={confirmDetails} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded hover:from-blue-700 hover:to-indigo-700 font-medium">
                                        Confirm These Details Are Correct
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Step 2: Signature */}
                {verified && (!isCompact || !signed) && (
                    <div className="flex items-start">
                        <div className={`p-2 rounded-full mr-4 ${signed ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                            {signed ? <CheckCircle className="w-6 h-6" /> : <PenTool className="w-6 h-6" />}
                        </div>
                        <div className="flex-1">
                            <h4 className={`font-semibold text-lg flex items-center gap-2 ${signed ? 'text-green-400' : 'text-blue-100'}`}>
                                Step 2: Digital Signature
                                {signed && <CheckCircle className="w-5 h-5 text-green-400" />}
                            </h4>

                            {!signed && (
                                <>
                                    <p className="text-sm text-blue-200 mb-2">Sign the "Promissory Note / Settlement Agreement" digitally.</p>
                                    <div className="mt-3 border-2 border-dashed border-blue-800 rounded-lg p-2 inline-block bg-slate-900/30">
                                        <SignatureCanvas
                                            penColor="white"
                                            canvasProps={{ width: 300, height: 150, className: 'sigCanvas' }}
                                            ref={sigPad}
                                        />
                                        <div className="flex justify-between mt-2">
                                            <button onClick={() => sigPad.current.clear()} className="text-xs text-red-400 hover:text-red-300">Clear</button>
                                            <button onClick={submitSignature} disabled={loading} className="px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm rounded hover:from-blue-700 hover:to-indigo-700">
                                                {loading ? 'Submitting...' : 'Sign & Submit'}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Step 3: Admin Review */}
                {(dispute.status === 'PendingAdminApproval' || dispute.status === 'Resolved') && (
                    <div className="flex items-start">
                        <div className={`p-2 rounded-full mr-4 ${dispute.status === 'Resolved' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                            {dispute.status === 'Resolved' ? <CheckCircle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                        </div>
                        <div className="flex-1">
                            <h4 className="font-semibold text-lg text-blue-100">
                                {dispute.status === 'Resolved' ? 'Step 3: Verification Complete' : 'Step 3: Administrative Review & Finalization'}
                            </h4>
                            <p className="text-sm text-blue-200">
                                {dispute.status === 'Resolved' ? 'The resolution process is complete.' : 'Waiting for Admin to review and finalize the agreement.'}
                            </p>
                            {dispute.status === 'Resolved' && (
                                <div className="mt-3 p-4 bg-green-500/20 border border-green-500/30 rounded text-green-400">
                                    <p className="font-bold mb-3 flex items-center">
                                        <CheckCircle className="w-5 h-5 mr-2" /> Success! The dispute is officially resolved.
                                    </p>

                                    {dispute.documentId && (
                                        <div className="mb-3 p-3 bg-slate-900/50 rounded border border-blue-800">
                                            <p className="text-xs font-semibold text-blue-300 mb-2">Settlement Document Details</p>
                                            <div className="space-y-1 text-xs text-blue-200">
                                                <div><span className="font-semibold">Document ID:</span> <span className="font-mono">{dispute.documentId}</span></div>
                                                <div><span className="font-semibold">Verification Hash:</span> <span className="font-mono text-[10px]">{dispute.documentHash?.substring(0, 32)}...</span></div>
                                                <div className="text-[10px] text-blue-300 italic mt-2">
                                                    This document is digitally signed and tamper-proof. The hash can be used to verify authenticity.
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {dispute.agreementDocPath && (
                                        <div className="flex gap-3">
                                            <button
                                                onClick={onViewAgreement}
                                                className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded hover:from-blue-700 hover:to-indigo-700 font-medium transition-colors"
                                            >
                                                <FileText className="w-4 h-4 mr-2" /> View Settlement Agreement
                                            </button>
                                            <button
                                                onClick={onDownloadAgreement}
                                                className="inline-flex items-center px-4 py-2 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 font-medium transition-colors border border-green-500/30"
                                            >
                                                <Download className="w-4 h-4 mr-2" /> Download PDF
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
function CourtForwardingModal({ dispute, onUpdate }) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        courtType: 'District',
        courtName: '',
        courtLocation: '',
        reason: ''
    });

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.courtName || !formData.courtLocation || !formData.reason) {
            toast.error('Please fill all fields');
            return;
        }

        if (!confirm('Are you sure you want to forward this case to court? This action cannot be undone and will close the case on MediaAI platform.')) {
            return;
        }

        setLoading(true);
        try {
            await api.post(`/admin/forward-to-court/${dispute.id}`, formData);
            toast.success('Case successfully forwarded to court');
            setIsOpen(false);
            onUpdate();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to forward case');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded hover:from-blue-700 hover:to-indigo-700 font-semibold flex items-center justify-center transition-colors"
            >
                <Building className="w-5 h-5 mr-2" /> Forward Case to Court
            </button>

            {isOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-blue-800">
                        <div className="p-6 border-b border-blue-800">
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-bold text-blue-100 flex items-center">
                                    <Building className="w-6 h-6 mr-2 text-blue-400" /> Forward Case to Court
                                </h2>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="text-blue-400 hover:text-blue-300"
                                    disabled={loading}
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            <div className="bg-blue-950/30 p-4 rounded-lg border border-blue-800">
                                <p className="text-sm text-blue-200">
                                    <strong>Warning:</strong> Forwarding this case to the traditional court system will:
                                </p>
                                <ul className="mt-2 text-sm text-blue-300 list-disc list-inside space-y-1">
                                    <li>Close this case on the MediaAI platform</li>
                                    <li>Disable all chat and resolution features</li>
                                    <li>Transfer jurisdiction to the specified court</li>
                                    <li>This action cannot be reversed</li>
                                </ul>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                                        Court Type <span className="text-red-400">*</span>
                                    </label>
                                    <select
                                        value={formData.courtType}
                                        onChange={(e) => setFormData({ ...formData, courtType: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-blue-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-900/50 text-blue-100"
                                        disabled={loading}
                                    >
                                        <option value="District">District Court</option>
                                        <option value="High">High Court</option>
                                        <option value="Supreme">Supreme Court</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                                        Court Name <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.courtName}
                                        onChange={(e) => setFormData({ ...formData, courtName: e.target.value })}
                                        placeholder="e.g., District Court of Mumbai"
                                        className="w-full px-4 py-2.5 border border-blue-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-900/50 text-blue-100 placeholder-blue-500"
                                        disabled={loading}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                                        Court Location <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.courtLocation}
                                        onChange={(e) => setFormData({ ...formData, courtLocation: e.target.value })}
                                        placeholder="e.g., Mumbai, Maharashtra"
                                        className="w-full px-4 py-2.5 border border-blue-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-900/50 text-blue-100 placeholder-blue-500"
                                        disabled={loading}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                                        Reason for Court Forwarding <span className="text-red-400">*</span>
                                    </label>
                                    <textarea
                                        value={formData.reason}
                                        onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                                        placeholder="Please provide detailed reasons why this case needs to be forwarded to court (e.g., AI mediation failed, legal complexity, parties uncooperative, etc.)"
                                        rows={5}
                                        className="w-full px-4 py-2.5 border border-blue-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-900/50 text-blue-100 placeholder-blue-500"
                                        disabled={loading}
                                    />
                                    <p className="mt-1 text-xs text-blue-300">
                                        Minimum 50 characters required. This will be documented in the case records.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-blue-800">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="flex-1 px-4 py-2 border border-blue-800 text-blue-200 rounded-lg hover:bg-slate-800/50 font-medium transition-colors"
                                    disabled={loading}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                    disabled={loading || formData.reason.length < 50}
                                >
                                    {loading ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                                            Forwarding...
                                        </>
                                    ) : (
                                        <>
                                            <Building className="w-4 h-4 mr-2" /> Forward to Court
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}