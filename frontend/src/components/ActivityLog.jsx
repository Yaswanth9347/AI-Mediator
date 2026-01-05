import { useState, useEffect } from 'react';
import { Activity, Filter, Calendar, Globe, Shield, FileText, ChevronRight, Loader2 } from 'lucide-react';
import { getActivityLogs } from '../api';
import toast from 'react-hot-toast';

export default function ActivityLog() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [category, setCategory] = useState('all');

    useEffect(() => {
        fetchLogs();
    }, [page, category]);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const response = await getActivityLogs(page, 20, category);
            setLogs(response.data.logs);
            setTotalPages(response.data.pagination.pages);
        } catch (error) {
            console.error('Fetch logs error:', error);
            toast.error('Failed to load activity logs');
        } finally {
            setLoading(false);
        }
    };

    const getCategoryIcon = (cat) => {
        const icons = {
            auth: Shield,
            dispute: FileText,
            profile: Activity,
            payment: Globe,
            security: Shield,
            privacy: Shield,
        };
        return icons[cat] || Activity;
    };

    const getCategoryColor = (cat) => {
        const colors = {
            auth: 'text-green-400',
            dispute: 'text-blue-400',
            profile: 'text-purple-400',
            payment: 'text-yellow-400',
            security: 'text-red-400',
            privacy: 'text-pink-400',
        };
        return colors[cat] || 'text-gray-400';
    };

    const formatDate = (date) => {
        const d = new Date(date);
        const now = new Date();
        const diff = now - d;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        
        return d.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                        <Activity className="w-6 h-6 text-blue-400" />
                        Activity Log
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        Track all your account activities and changes
                    </p>
                </div>

                {/* Category Filter */}
                <select
                    value={category}
                    onChange={(e) => {
                        setCategory(e.target.value);
                        setPage(1);
                    }}
                    className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="all">All Activities</option>
                    <option value="auth">Authentication</option>
                    <option value="dispute">Disputes</option>
                    <option value="profile">Profile</option>
                    <option value="payment">Payments</option>
                    <option value="security">Security</option>
                    <option value="privacy">Privacy</option>
                </select>
            </div>

            {/* Activity List */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
            ) : logs.length === 0 ? (
                <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700">
                    <Activity className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400">No activity logs found</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {logs.map((log) => {
                        const Icon = getCategoryIcon(log.category);
                        const colorClass = getCategoryColor(log.category);

                        return (
                            <div
                                key={log.id}
                                className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:bg-gray-800 transition-colors"
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`mt-0.5 ${colorClass}`}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-medium">
                                            {log.description}
                                        </p>
                                        
                                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                            <span className="capitalize">{log.category}</span>
                                            <span>•</span>
                                            <span className="capitalize">{log.action}</span>
                                            <span>•</span>
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {formatDate(log.createdAt)}
                                            </span>
                                            {log.ipAddress && (
                                                <>
                                                    <span>•</span>
                                                    <span className="flex items-center gap-1">
                                                        <Globe className="w-3 h-3" />
                                                        {log.ipAddress}
                                                    </span>
                                                </>
                                            )}
                                        </div>

                                        {/* Metadata */}
                                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                                            <details className="mt-2">
                                                <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">
                                                    View Details
                                                </summary>
                                                <pre className="mt-2 p-2 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">
                                                    {JSON.stringify(log.metadata, null, 2)}
                                                </pre>
                                            </details>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                    >
                        Previous
                    </button>
                    
                    <span className="text-gray-400 px-4">
                        Page {page} of {totalPages}
                    </span>
                    
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
