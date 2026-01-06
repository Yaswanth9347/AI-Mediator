import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import api, { getDispute, getMessages, sendMessage, acceptCase, submitDecision, getMessageCount, getCaseHistory, downloadCaseSummaryReport, downloadAgreementPDF, getAgreementPreviewUrl } from '../api';
import { ArrowLeft, Send, Paperclip, CheckCircle, XCircle, User, Users, MessageCircle, Scale, AlertTriangle, Building, Clock, Shield, FileText, PenTool, Download, RefreshCw, X, ChevronDown, File } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import toast from 'react-hot-toast';
import { useSocket } from '../context/SocketContext';
import CaseHistory from '../components/CaseHistory';
import EvidenceSection from '../components/EvidenceSection';

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
    
    // Pagination for messages
    const [messagePage, setMessagePage] = useState(1);
    const [totalMessagePages, setTotalMessagePages] = useState(1);
    const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
    
    // Socket.io for real-time updates
    const { socket, connected, joinDisputeRoom, leaveDisputeRoom, startTyping, stopTyping } = useSocket();
    const [typingUsers, setTypingUsers] = useState(new Set());
    const typingTimeoutRef = useRef(null);

    const currentUserEmail = localStorage.getItem('userEmail');
    const currentUsername = localStorage.getItem('username');
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

    // Join dispute room for real-time updates
    useEffect(() => {
        if (socket && connected && id) {
            joinDisputeRoom(id);
            return () => leaveDisputeRoom(id);
        }
    }, [socket, connected, id, joinDisputeRoom, leaveDisputeRoom]);

    // Listen for real-time messages
    useEffect(() => {
        if (!socket) return;

        const handleNewMessage = (message) => {
            setMessages(prev => [...prev, message]);
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

        socket.on('message:new', handleNewMessage);
        socket.on('user:typing', handleTyping);
        socket.on('user:stop-typing', handleStopTyping);
        socket.on('dispute:accepted', handleDisputeAccepted);
        socket.on('dispute:ai-ready', handleAiReady);
        socket.on('dispute:status-changed', handleStatusChanged);
        socket.on('dispute:vote-recorded', handleVoteRecorded);

        return () => {
            socket.off('message:new', handleNewMessage);
            socket.off('user:typing', handleTyping);
            socket.off('user:stop-typing', handleStopTyping);
            socket.off('dispute:accepted', handleDisputeAccepted);
            socket.off('dispute:ai-ready', handleAiReady);
            socket.off('dispute:status-changed', handleStatusChanged);
            socket.off('dispute:vote-recorded', handleVoteRecorded);
        };
    }, [socket, currentUsername]);

    // Auto-scroll to latest message when messages change
    const scrollToBottom = () => {
        // Use setTimeout to ensure DOM has updated before scrolling
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    // Scroll to bottom when messages array changes (new message added)
    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() && !attachment) return;

        const formData = new FormData();
        formData.append('content', newMessage);
        if (attachment) formData.append('attachment', attachment);

        try {
            await sendMessage(id, formData);
            setNewMessage('');
            setAttachment(null);
            // Stop typing when message is sent
            if (socket && connected) {
                stopTyping(id);
            }
            // Message will be added via socket event, no need to fetch
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to send message');
        }
    };

    // Handle typing indicator
    const handleMessageChange = (e) => {
        setNewMessage(e.target.value);
        
        if (socket && connected && e.target.value.trim()) {
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

    const handleAcceptCase = async () => {
        try {
            await acceptCase(id);
            toast.success('You accepted the case.');
            fetchData();
        } catch (err) {
            toast.error('Failed to accept');
        }
    };

    const handleDecision = async (choiceIdx) => {
        try {
            const res = await submitDecision(id, choiceIdx);
            toast.success(res.data.message);
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
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-white text-lg">Loading dispute details...</p>
                </div>
            </div>
        );
    }

    const myChoice = isPlaintiff ? dispute.plaintiffChoice : isDefendant ? dispute.defendantChoice : null;
    const canParticipate = isPlaintiff || (isDefendant && dispute.respondentAccepted) || isAdmin;

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
                                <button
                                    onClick={handleDownloadCaseSummary}
                                    className="inline-flex items-center px-4 py-2 bg-blue-600/20 text-blue-200 rounded hover:bg-blue-600/30 font-medium transition-colors border border-blue-600/30 text-sm"
                                    title="Download a comprehensive summary of this case"
                                >
                                    <File className="w-4 h-4 mr-2" /> Case Summary
                                </button>
                                {dispute.agreementDocPath && (
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

                {/* Accept Case Banner */}
                {isDefendant && !dispute.respondentAccepted && !dispute.forwardedToCourt && (
                    <div className="p-4 bg-blue-950/30 border-b border-blue-800 flex items-center justify-between">
                        <div>
                            <p className="font-semibold text-blue-200">Accept to participate in this case</p>
                        </div>
                        <button onClick={handleAcceptCase} className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 flex items-center">
                            <CheckCircle className="w-4 h-4 mr-2" /> Accept Case
                        </button>
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
                    />
                </div>
            )}

            {/* Case History / Audit Trail Section */}
            <div className="mt-6 mb-6">
                <CaseHistory disputeId={id} />
            </div>

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
                            messages.map((msg) => (
                                <div key={msg.id} className="flex justify-start">
                                    <div className={`max-w-[85%] sm:max-w-xs md:max-w-2xl px-3 sm:px-4 py-2 rounded-lg ${msg.senderRole === 'plaintiff' ? 'bg-slate-800/70 text-blue-100 border border-blue-800' : msg.senderRole === 'defendant' ? 'bg-slate-800/70 text-blue-100 border border-blue-800' : 'bg-slate-800/70 text-blue-100 border border-blue-800'}`}>
                                        <p className="text-xs font-semibold mb-1 text-blue-300">{msg.senderName} ({msg.senderRole})</p>
                                        <p className="text-xs sm:text-sm break-words">{msg.content}</p>
                                        {msg.attachmentPath && <img src={`http://localhost:5000/uploads/${msg.attachmentPath}`} alt="" className="mt-2 max-w-full rounded border border-blue-800" />}
                                        <p className="text-xs text-blue-400 mt-1">{new Date(msg.createdAt).toLocaleTimeString()}</p>
                                    </div>
                                </div>
                            ))
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
                        <form onSubmit={handleSendMessage} className="p-2 sm:p-4 border-t border-blue-800 bg-slate-900/70 flex items-center gap-1 sm:gap-2 shrink-0">
                            <label className="cursor-pointer text-blue-400 hover:text-blue-300">
                                <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => setAttachment(e.target.files[0])} />
                            </label>
                            <input type="text" value={newMessage} onChange={handleMessageChange} placeholder="Type your message..." className="flex-1 px-4 py-2.5 text-sm border border-blue-800 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-900/50 text-blue-100 placeholder-blue-500" />
                            <button type="submit" className="p-1.5 sm:p-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full hover:from-blue-700 hover:to-indigo-700">
                                <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                        </form>
                    )}
                    {attachment && <div className="px-3 sm:px-4 pb-2 text-xs sm:text-sm text-green-400">📎 {attachment.name}</div>}
                </div>
            )}
        </div>
    );
}

function ResolutionSection({ dispute, isPlaintiff, isDefendant, isAdmin, onUpdate, onViewAgreement, onDownloadAgreement, onDownloadCaseSummary }) {
    const token = localStorage.getItem('token');
    const sigPad = useRef({});
    const [loading, setLoading] = useState(false);

    // Determine current user's role status
    const verified = isPlaintiff ? dispute.plaintiffVerified : isDefendant ? dispute.respondentVerified : true;
    const signed = isPlaintiff ? dispute.plaintiffSignature : isDefendant ? dispute.respondentSignature : true;

    // Admin View
    if (isAdmin) {
        return (
            <div className="bg-slate-800/50 p-6 rounded-lg border border-blue-800 mb-6">
                <h3 className="text-xl font-bold text-blue-100 mb-4 flex items-center">
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
                                        if (!confirm('Have you reviewed the PDF? Approve resolution now?')) return;
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
            <h3 className="text-xl font-bold text-blue-100 mb-6 flex items-center border-b border-blue-800 pb-2">
                <FileText className="w-6 h-6 mr-2 text-blue-400" /> Resolution Workflow
            </h3>

            <div className="space-y-8">
                {/* Step 1: Verification */}
                <div className={`flex items-start ${verified ? 'opacity-50' : ''}`}>
                    <div className={`p-2 rounded-full mr-4 ${verified ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {verified ? <CheckCircle className="w-6 h-6" /> : <Users className="w-6 h-6" />}
                    </div>
                    <div className="flex-1">
                        <h4 className="font-semibold text-lg text-blue-100">Step 1: Confirm Personal Details</h4>
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

                        {!verified && (
                            <button onClick={confirmDetails} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded hover:from-blue-700 hover:to-indigo-700 font-medium">
                                Confirm These Details Are Correct
                            </button>
                        )}
                        {verified && <span className="text-green-400 font-medium text-sm">✓ Details Confirmed</span>}
                    </div>
                </div>

                {/* Step 2: Signature */}
                {verified && (
                    <div className={`flex items-start ${signed ? 'opacity-50' : ''}`}>
                        <div className={`p-2 rounded-full mr-4 ${signed ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                            {signed ? <CheckCircle className="w-6 h-6" /> : <PenTool className="w-6 h-6" />}
                        </div>
                        <div className="flex-1">
                            <h4 className="font-semibold text-lg text-blue-100">Step 2: Digital Signature</h4>
                            <p className="text-sm text-blue-200 mb-2">Sign the "Promissory Note / Settlement Agreement" digitally.</p>

                            {!signed && (
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
                            )}
                            {signed && <span className="text-green-400 font-medium text-sm">✓ Signed</span>}
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