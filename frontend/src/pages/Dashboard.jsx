import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDisputes, getStats } from '../api';
import { Scale, Clock, CheckCircle, AlertCircle, Plus, Building, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSocket } from '../context/SocketContext';
import NotificationBell from '../components/NotificationBell';

export default function Dashboard() {
    const [disputes, setDisputes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('all'); // 'all', 'my_cases', 'against_me'
    const [stats, setStats] = useState(null);
    
    // Search & Filter States
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    
    // Pagination States
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(9);
    
    // Socket.io for online status and real-time updates
    const socketContext = useSocket();
    const { socket, onlineUsers } = socketContext || {};

    const currentUserEmail = localStorage.getItem('userEmail');
    const userRole = localStorage.getItem('role');

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setCurrentPage(1); // Reset to first page on search
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [statusFilter, viewMode]);

    useEffect(() => {
        setLoading(true);
        const fetchData = async () => {
            try {
                const params = {
                    page: currentPage,
                    limit: itemsPerPage
                };
                
                if (debouncedSearch) {
                    params.search = debouncedSearch;
                }
                
                if (statusFilter && statusFilter !== 'All') {
                    params.status = statusFilter;
                }
                
                const disputesRes = await getDisputes(params);
                setDisputes(disputesRes.data.disputes || disputesRes.data);
                
                // Handle pagination data if available
                if (disputesRes.data.pagination) {
                    setTotalPages(disputesRes.data.pagination.totalPages);
                    setTotalItems(disputesRes.data.pagination.totalItems);
                    setCurrentPage(disputesRes.data.pagination.currentPage);
                }

                if (userRole === 'Admin') {
                    try {
                        const statsRes = await getStats();
                        setStats(statsRes.data);
                    } catch (e) { console.error('Failed to fetch stats'); }
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [currentPage, debouncedSearch, statusFilter, userRole, itemsPerPage]);

    // Listen for real-time dispute updates
    useEffect(() => {
        if (!socket) return;

        const handleDisputeAccepted = (updatedDispute) => {
            setDisputes(prev => 
                prev.map(d => d.id === updatedDispute.id ? { ...d, ...updatedDispute } : d)
            );
        };

        const handleAiReady = ({ disputeId }) => {
            setDisputes(prev => 
                prev.map(d => d.id === disputeId ? { ...d, aiSolutionsReady: true } : d)
            );
        };

        socket.on('dispute:accepted', handleDisputeAccepted);
        socket.on('dispute:ai-ready', handleAiReady);

        return () => {
            socket.off('dispute:accepted', handleDisputeAccepted);
            socket.off('dispute:ai-ready', handleAiReady);
        };
    }, [socket]);

    // Filter disputes based on view mode
    const filteredDisputes = disputes.filter(d => {
        if (userRole === 'Admin') return true;

        if (viewMode === 'my_cases') {
            return d.plaintiffEmail === currentUserEmail;
        } else if (viewMode === 'against_me') {
            return d.respondentEmail === currentUserEmail;
        }
        // 'all' - show disputes where user is either party
        return d.plaintiffEmail === currentUserEmail || d.respondentEmail === currentUserEmail;
    });

    const getStatusBadge = (dispute) => {
        const isDefendant = dispute.respondentEmail === currentUserEmail;

        // Payment status check
        if (dispute.paymentStatus === 'pending' || dispute.paymentStatus === 'processing') {
            return { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300', text: 'Payment Pending', icon: AlertCircle };
        }
        if (dispute.paymentStatus === 'failed') {
            return { color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300', text: 'Payment Failed', icon: AlertCircle };
        }

        if (dispute.forwardedToCourt || dispute.status === 'ForwardedToCourt') {
            return { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300', text: 'Forwarded to Court', icon: Building };
        }
        if (dispute.status === 'Resolved') {
            return { color: 'bg-blue-100 text-blue-800', text: 'Resolved', icon: CheckCircle };
        }
        if (dispute.status === 'Active') {
            return { color: 'bg-green-100 text-green-800', text: 'Active', icon: CheckCircle };
        }
        if (dispute.status === 'Pending' && isDefendant) {
            return { color: 'bg-yellow-100 text-yellow-800', text: 'Action Required', icon: AlertCircle };
        }
        return { color: 'bg-gray-100 text-gray-800', text: dispute.status, icon: Clock };
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold text-blue-100 mb-1">
                            {userRole === 'Admin' ? 'All Disputes' : 'My Disputes'}
                        </h1>
                        <p className="text-sm text-blue-300">
                            {loading ? 'Loading...' : `${totalItems} total case${totalItems !== 1 ? 's' : ''}`}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <NotificationBell />
                        <Link
                            to="/new"
                            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md flex items-center gap-2 text-sm"
                        >
                            <Plus className="w-4 h-4" />
                            File New Case
                        </Link>
                    </div>
                </div>

                {/* Search & Filter Bar */}
                <div className="flex flex-col md:flex-row gap-3 mb-6">
                    {/* Search Input */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search by title or description..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-blue-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-900/50 text-blue-100 placeholder-blue-500 text-sm"
                        />
                    </div>

                    {/* Status Filter */}
                    <div className="relative">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full md:w-48 px-4 py-2.5 border border-blue-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-900/50 text-blue-100 appearance-none cursor-pointer text-sm"
                        >
                            <option value="All">All Status</option>
                            <option value="Pending">Pending</option>
                            <option value="Active">Active</option>
                            <option value="Resolved">Resolved</option>
                            <option value="ForwardedToCourt">Forwarded to Court</option>
                        </select>
                    </div>

                    {/* Items Per Page */}
                    <div className="relative">
                        <select
                            value={itemsPerPage}
                            onChange={(e) => {
                                setItemsPerPage(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="w-full md:w-40 px-4 py-2.5 border border-blue-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-900/50 text-blue-100 appearance-none cursor-pointer text-sm"
                        >
                            <option value={9}>Show 9</option>
                            <option value={18}>Show 18</option>
                            <option value={27}>Show 27</option>
                        </select>
                    </div>
                </div>

                {/* View Mode Tabs (Non-Admin) */}
                {userRole !== 'Admin' && (
                    <div className="flex gap-1 mb-6 border-b border-blue-800">
                        <button
                            onClick={() => setViewMode('all')}
                            className={`px-4 py-2.5 font-medium transition-colors text-sm ${
                                viewMode === 'all'
                                    ? 'text-blue-100 border-b-2 border-blue-500'
                                    : 'text-blue-400 hover:text-blue-300'
                            }`}
                        >
                            All Cases
                        </button>
                        <button
                            onClick={() => setViewMode('my_cases')}
                            className={`px-4 py-2.5 font-medium transition-colors text-sm ${
                                viewMode === 'my_cases'
                                    ? 'text-blue-100 border-b-2 border-blue-500'
                                    : 'text-blue-400 hover:text-blue-300'
                            }`}
                        >
                            Filed by Me
                        </button>
                        <button
                            onClick={() => setViewMode('against_me')}
                            className={`px-4 py-2.5 font-medium transition-colors text-sm ${
                                viewMode === 'against_me'
                                    ? 'text-blue-100 border-b-2 border-blue-500'
                                    : 'text-blue-400 hover:text-blue-300'
                            }`}
                        >
                            Against Me
                        </button>
                    </div>
                )}

                {/* Admin Stats */}
                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-slate-800/50 border border-blue-800 rounded-lg p-4">
                            <p className="text-xs text-blue-400 mb-1">Total Disputes</p>
                            <p className="text-2xl font-semibold text-blue-100">{stats.totalDisputes}</p>
                        </div>
                        <div className="bg-slate-800/50 border border-blue-800 rounded-lg p-4">
                            <p className="text-xs text-blue-400 mb-1">Pending</p>
                            <p className="text-2xl font-semibold text-yellow-400">{stats.pending}</p>
                        </div>
                        <div className="bg-slate-800/50 border border-blue-800 rounded-lg p-4">
                            <p className="text-xs text-blue-400 mb-1">Active</p>
                            <p className="text-2xl font-semibold text-green-400">{stats.active || 0}</p>
                        </div>
                        <div className="bg-slate-800/50 border border-blue-800 rounded-lg p-4">
                            <p className="text-xs text-blue-400 mb-1">Resolved</p>
                            <p className="text-2xl font-semibold text-blue-400">{stats.resolved || 0}</p>
                        </div>
                    </div>
                )}

                {/* Disputes Grid */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredDisputes.map((dispute, index) => {
                        const statusBadge = getStatusBadge(dispute);
                        const StatusIcon = statusBadge.icon;
                        const isPlaintiff = dispute.plaintiffEmail === currentUserEmail;
                        const opposingPartyEmail = isPlaintiff ? dispute.respondentEmail : dispute.plaintiffEmail;
                        const isOpposingPartyOnline = onlineUsers && onlineUsers.has(opposingPartyEmail);

                        return (
                            <Link key={dispute.id} to={`/disputes/${dispute.id}`} className="block">
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className="bg-slate-800/50 border border-blue-800 rounded-lg hover:border-blue-600 transition-all p-5"
                                >
                                    {/* Card Header */}
                                    <div className="flex items-start justify-between mb-3">
                                        <h3 className="font-medium text-blue-100 text-base flex-1 pr-2 leading-snug">{dispute.title}</h3>
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                                            dispute.forwardedToCourt || dispute.status === 'ForwardedToCourt'
                                                ? 'bg-orange-900/30 text-orange-300'
                                                : dispute.status === 'Resolved'
                                                ? 'bg-blue-900/30 text-blue-300'
                                                : dispute.status === 'Active'
                                                ? 'bg-green-900/30 text-green-300'
                                                : dispute.status === 'Pending' && dispute.respondentEmail === currentUserEmail
                                                ? 'bg-yellow-900/30 text-yellow-300'
                                                : 'bg-slate-700 text-slate-300'
                                        }`}>
                                            {statusBadge.text}
                                        </span>
                                    </div>
                                    
                                    {/* Description */}
                                    <p className="text-sm text-blue-300 mb-4 line-clamp-2 leading-relaxed">{dispute.description}</p>
                                    
                                    {/* Metadata */}
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-blue-400">Case #{dispute.id}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-blue-400">{isPlaintiff ? `vs ${dispute.respondentName}` : `by ${dispute.plaintiffName}`}</span>
                                            {/* Online status indicator */}
                                            {isOpposingPartyOnline && (
                                                <div className="flex items-center gap-1">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            </Link>
                        );
                    })}
                </div>

                {/* Empty State */}
                {filteredDisputes.length === 0 && !loading && (
                    <div className="text-center py-16 bg-slate-800/30 rounded-lg border border-blue-800/50 border-dashed">
                        <Scale className="w-12 h-12 text-blue-700 mx-auto mb-4" />
                        <p className="text-blue-300 mb-4 text-sm">
                            {debouncedSearch || statusFilter !== 'All' 
                                ? 'No disputes match your search criteria' 
                                : 'No disputes found'}
                        </p>
                        {!debouncedSearch && statusFilter === 'All' && (
                            <Link
                                to="/new"
                                className="inline-flex items-center text-blue-400 hover:text-blue-300 font-medium text-sm"
                            >
                                <Plus className="w-4 h-4 mr-1" />
                                File your first case
                            </Link>
                        )}
                    </div>
                )}
                
                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-800/30 border border-blue-800 rounded-lg p-4">
                        <div className="text-sm text-blue-300">
                            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems}
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg border border-blue-800 hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-blue-300"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            
                            <div className="flex gap-1">
                                {[...Array(totalPages)].map((_, idx) => {
                                    const pageNum = idx + 1;
                                    // Show first, last, current, and adjacent pages
                                    if (
                                        pageNum === 1 ||
                                        pageNum === totalPages ||
                                        (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                                    ) {
                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => handlePageChange(pageNum)}
                                                className={`px-3 py-1.5 rounded-lg transition-colors text-sm ${
                                                    currentPage === pageNum
                                                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
                                                        : 'border border-blue-800 text-blue-300 hover:bg-slate-700/50'
                                                }`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    } else if (
                                        pageNum === currentPage - 2 ||
                                        pageNum === currentPage + 2
                                    ) {
                                        return <span key={pageNum} className="px-2 text-blue-500">...</span>;
                                    }
                                    return null;
                                })}
                            </div>
                            
                            <button
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-lg border border-blue-800 hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-blue-300"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
