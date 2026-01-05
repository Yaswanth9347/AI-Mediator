import { useState, useEffect } from 'react';
import { getCaseHistory } from '../api';
import { 
    Clock, 
    ChevronDown, 
    ChevronUp, 
    User, 
    Shield, 
    MessageCircle, 
    Scale, 
    FileText, 
    AlertCircle,
    CheckCircle,
    XCircle,
    PenTool,
    Building
} from 'lucide-react';

// Action to icon mapping
const actionIcons = {
    USER_REGISTER: User,
    USER_LOGIN: Shield,
    DISPUTE_CREATE: FileText,
    DISPUTE_ACCEPT: CheckCircle,
    DISPUTE_REJECT: XCircle,
    MESSAGE_SEND: MessageCircle,
    ATTACHMENT_UPLOAD: FileText,
    AI_ANALYSIS_TRIGGER: Scale,
    AI_ANALYSIS_COMPLETE: Scale,
    SOLUTION_VOTE: Scale,
    SOLUTION_REJECT_ALL: XCircle,
    DETAILS_VERIFY: User,
    SIGNATURE_SUBMIT: PenTool,
    AGREEMENT_GENERATE: FileText,
    ADMIN_APPROVE_RESOLUTION: Shield,
    ADMIN_FORWARD_TO_COURT: Building,
};

// Category to color mapping
const categoryColors = {
    AUTH: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    DISPUTE: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    MESSAGE: 'bg-green-500/20 text-green-400 border-green-500/30',
    AI: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    RESOLUTION: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    ADMIN: 'bg-red-500/20 text-red-400 border-red-500/30',
    SYSTEM: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

// Format relative time
const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
    });
};

export default function CaseHistory({ disputeId }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                setLoading(true);
                const response = await getCaseHistory(disputeId);
                setHistory(response.data.history || []);
                setError(null);
            } catch (err) {
                console.error('Failed to fetch case history:', err);
                setError('Unable to load case history');
            } finally {
                setLoading(false);
            }
        };

        if (disputeId && isExpanded) {
            fetchHistory();
        }
    }, [disputeId, isExpanded]);

    const displayedHistory = showAll ? history : history.slice(0, 5);

    return (
        <div className="bg-slate-800/50 rounded-lg border border-blue-800 overflow-hidden">
            {/* Header - Collapsible */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/70 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-semibold text-blue-100">Case History & Audit Trail</h3>
                    {history.length > 0 && !loading && (
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded-full border border-blue-500/30">
                            {history.length} events
                        </span>
                    )}
                </div>
                {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-blue-400" />
                ) : (
                    <ChevronDown className="w-5 h-5 text-blue-400" />
                )}
            </button>

            {/* Content */}
            {isExpanded && (
                <div className="border-t border-blue-800 p-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
                            <span className="ml-3 text-blue-300">Loading case history...</span>
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center py-8 text-red-400">
                            <AlertCircle className="w-5 h-5 mr-2" />
                            {error}
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-8 text-blue-300">
                            <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>No history available yet</p>
                        </div>
                    ) : (
                        <>
                            {/* Timeline */}
                            <div className="relative">
                                {/* Vertical line */}
                                <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-blue-800" />

                                <div className="space-y-4">
                                    {displayedHistory.map((event, idx) => {
                                        const IconComponent = actionIcons[event.action] || Clock;
                                        const colorClass = categoryColors[event.category] || categoryColors.SYSTEM;
                                        
                                        return (
                                            <div key={event.id || idx} className="relative pl-10">
                                                {/* Timeline dot */}
                                                <div className={`absolute left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center bg-slate-900 ${colorClass}`}>
                                                    <IconComponent className="w-3 h-3" />
                                                </div>

                                                {/* Event card */}
                                                <div className="bg-slate-900/50 rounded-lg p-3 border border-blue-800/50">
                                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm text-blue-100 font-medium">
                                                                {event.description}
                                                            </p>
                                                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                                                <span className={`px-1.5 py-0.5 rounded text-xs border ${colorClass}`}>
                                                                    {event.category}
                                                                </span>
                                                                <span className="text-xs text-blue-300">
                                                                    by <span className="font-medium">{event.actor}</span>
                                                                    {event.actorRole && (
                                                                        <span className="text-blue-400"> ({event.actorRole})</span>
                                                                    )}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {event.status === 'FAILURE' && (
                                                                <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs rounded border border-red-500/30">
                                                                    Failed
                                                                </span>
                                                            )}
                                                            <span className="text-xs text-blue-400 whitespace-nowrap">
                                                                {formatRelativeTime(event.timestamp)}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Metadata preview */}
                                                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                                                        <details className="mt-2">
                                                            <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">
                                                                View details
                                                            </summary>
                                                            <pre className="mt-2 text-xs text-blue-300 bg-slate-800/50 p-2 rounded overflow-x-auto">
                                                                {JSON.stringify(event.metadata, null, 2)}
                                                            </pre>
                                                        </details>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Show more/less button */}
                            {history.length > 5 && (
                                <button
                                    onClick={() => setShowAll(!showAll)}
                                    className="mt-4 w-full py-2 text-sm text-blue-400 hover:text-blue-300 flex items-center justify-center gap-1 border-t border-blue-800/50"
                                >
                                    {showAll ? (
                                        <>
                                            <ChevronUp className="w-4 h-4" />
                                            Show less
                                        </>
                                    ) : (
                                        <>
                                            <ChevronDown className="w-4 h-4" />
                                            Show all {history.length} events
                                        </>
                                    )}
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
