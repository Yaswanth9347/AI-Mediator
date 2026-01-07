import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import toast from 'react-hot-toast';
import { 
    LayoutDashboard, Users, FileText, Scale, TrendingUp, TrendingDown, 
    Clock, CheckCircle, XCircle, AlertTriangle, Activity, Server, 
    Database, Wifi, Shield, Eye, ChevronRight, RefreshCw, Gavel,
    UserCheck, UserX, BarChart3, Calendar, Zap
} from 'lucide-react';

// Simple bar chart component (no external library needed)
function SimpleBarChart({ data, height = 120 }) {
    if (!data || data.length === 0) return null;
    
    const maxValue = Math.max(...data.map(d => d.count), 1);
    
    return (
        <div className="flex items-end justify-between gap-2" style={{ height }}>
            {data.map((item, index) => (
                <div key={index} className="flex flex-col items-center flex-1">
                    <div 
                        className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t transition-all duration-500 hover:from-blue-500 hover:to-blue-300"
                        style={{ 
                            height: `${(item.count / maxValue) * 100}%`,
                            minHeight: item.count > 0 ? '8px' : '2px'
                        }}
                        title={`${item.count} disputes`}
                    />
                    <span className="text-xs text-gray-400 mt-2">{item.month}</span>
                </div>
            ))}
        </div>
    );
}

// Status badge component
function StatusBadge({ status, count }) {
    const statusColors = {
        Pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        Active: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        AwaitingDecision: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        PendingAdminApproval: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        Resolved: 'bg-green-500/20 text-green-400 border-green-500/30',
        ForwardedToCourt: 'bg-red-500/20 text-red-400 border-red-500/30',
    };

    return (
        <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${statusColors[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
            <span className="text-sm font-medium">{status.replace(/([A-Z])/g, ' $1').trim()}</span>
            <span className="text-lg font-bold">{count}</span>
        </div>
    );
}

// Stat card component
function StatCard({ title, value, subtitle, icon: Icon, trend, trendValue, color = 'blue' }) {
    const colorClasses = {
        blue: 'from-blue-600 to-blue-800',
        green: 'from-green-600 to-green-800',
        purple: 'from-purple-600 to-purple-800',
        orange: 'from-orange-600 to-orange-800',
        red: 'from-red-600 to-red-800',
    };

    return (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 hover:border-slate-600 transition-all">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-gray-400 mb-1">{title}</p>
                    <p className="text-3xl font-bold text-white">{value}</p>
                    {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
                </div>
                <div className={`p-3 rounded-lg bg-gradient-to-br ${colorClasses[color]}`}>
                    <Icon className="w-6 h-6 text-white" />
                </div>
            </div>
            {trend && (
                <div className={`flex items-center gap-1 mt-3 text-sm ${trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                    {trend === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    <span>{trendValue}% from last month</span>
                </div>
            )}
        </div>
    );
}

// Activity item component
function ActivityItem({ activity }) {
    const actionIcons = {
        USER_REGISTER: Users,
        USER_LOGIN: Users,
        DISPUTE_CREATE: FileText,
        DISPUTE_ACCEPT: CheckCircle,
        MESSAGE_SEND: Activity,
        EVIDENCE_UPLOAD: FileText,
        AI_ANALYSIS_COMPLETE: Zap,
        SOLUTION_VOTE: Scale,
        ADMIN_APPROVE_RESOLUTION: CheckCircle,
        ADMIN_FORWARD_TO_COURT: Gavel,
    };

    const Icon = actionIcons[activity.action] || Activity;
    const timeAgo = getTimeAgo(new Date(activity.createdAt));

    return (
        <div className="flex items-start gap-3 py-3 border-b border-slate-700/50 last:border-0">
            <div className="p-2 rounded-lg bg-slate-700/50">
                <Icon className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 truncate">{activity.description}</p>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">{timeAgo}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                        activity.status === 'SUCCESS' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                        {activity.status}
                    </span>
                </div>
            </div>
        </div>
    );
}

// Helper function to format time ago
function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
}

export default function AdminDashboard() {
    const [stats, setStats] = useState(null);
    const [activity, setActivity] = useState([]);
    const [pending, setPending] = useState(null);
    const [health, setHealth] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchDashboardData = async () => {
        try {
            const [statsRes, activityRes, pendingRes, healthRes] = await Promise.all([
                api.get('/admin/dashboard/stats'),
                api.get('/admin/dashboard/activity?limit=20'),
                api.get('/admin/dashboard/pending'),
                api.get('/admin/dashboard/health'),
            ]);

            setStats(statsRes.data);
            setActivity(activityRes.data.activities);
            setPending(pendingRes.data);
            setHealth(healthRes.data);
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
            toast.error('Failed to load dashboard data');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchDashboardData, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchDashboardData();
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-white text-lg">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <LayoutDashboard className="w-7 h-7 text-blue-500" />
                        Admin Dashboard
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">System overview and management</p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* System Health Bar */}
            {health && (
                <div className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                    health.status === 'healthy' 
                        ? 'bg-green-500/10 border-green-500/30' 
                        : 'bg-yellow-500/10 border-yellow-500/30'
                }`}>
                    <div className="flex items-center gap-3">
                        <Server className={`w-5 h-5 ${health.status === 'healthy' ? 'text-green-400' : 'text-yellow-400'}`} />
                        <span className="text-sm font-medium text-gray-200">
                            System Status: <span className={health.status === 'healthy' ? 'text-green-400' : 'text-yellow-400'}>
                                {health.status.toUpperCase()}
                            </span>
                        </span>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            Uptime: {health.server?.uptimeFormatted}
                        </span>
                        <span className="flex items-center gap-1">
                            <Database className="w-4 h-4" />
                            Memory: {health.server?.memoryPercent}%
                        </span>
                        <span className="flex items-center gap-1">
                            <Wifi className="w-4 h-4" />
                            {health.realtime?.activeConnections} connected
                        </span>
                    </div>
                </div>
            )}

            {/* Stats Grid */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        title="Total Disputes"
                        value={stats.overview.totalDisputes}
                        subtitle={`${stats.overview.disputesToday} new today`}
                        icon={FileText}
                        color="blue"
                        trend={parseFloat(stats.overview.disputesTrend) >= 0 ? 'up' : 'down'}
                        trendValue={Math.abs(parseFloat(stats.overview.disputesTrend))}
                    />
                    <StatCard
                        title="Resolution Rate"
                        value={`${stats.overview.resolutionRate}%`}
                        subtitle={`${stats.overview.resolvedDisputes} resolved`}
                        icon={CheckCircle}
                        color="green"
                    />
                    <StatCard
                        title="Total Users"
                        value={stats.users.total}
                        subtitle={`${stats.users.newThisMonth} new this month`}
                        icon={Users}
                        color="purple"
                    />
                    <StatCard
                        title="Avg Resolution Time"
                        value={`${stats.overview.avgResolutionDays} days`}
                        subtitle="From creation to resolution"
                        icon={Clock}
                        color="orange"
                    />
                </div>
            )}

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Charts and Status */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Disputes Trend Chart */}
                    {stats && (
                        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <BarChart3 className="w-5 h-5 text-blue-400" />
                                    Disputes Trend (6 Months)
                                </h2>
                            </div>
                            <SimpleBarChart data={stats.disputes.trend} height={140} />
                        </div>
                    )}

                    {/* Disputes by Status */}
                    {stats && (
                        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Scale className="w-5 h-5 text-purple-400" />
                                Disputes by Status
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {Object.entries(stats.disputes.byStatus).map(([status, count]) => (
                                    <StatusBadge key={status} status={status} count={count} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pending Actions */}
                    {pending && (
                        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-orange-400" />
                                Pending Actions
                                {stats?.pendingActions?.total > 0 && (
                                    <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-orange-500 text-white rounded-full">
                                        {stats.pendingActions.total}
                                    </span>
                                )}
                            </h2>

                            {/* Pending Approvals */}
                            {pending.approvals.length > 0 && (
                                <div className="mb-4">
                                    <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-1">
                                        <CheckCircle className="w-4 h-4" />
                                        Agreements Pending Approval ({pending.approvals.length})
                                    </h3>
                                    <div className="space-y-2">
                                        {pending.approvals.slice(0, 5).map(dispute => (
                                            <Link
                                                key={dispute.id}
                                                to={`/disputes/${dispute.id}`}
                                                className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors"
                                            >
                                                <div>
                                                    <p className="text-sm font-medium text-white">{dispute.title}</p>
                                                    <p className="text-xs text-gray-400">Case #{dispute.id}</p>
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-gray-400" />
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Pending Verifications */}
                            {pending.verifications.length > 0 && (
                                <div className="mb-4">
                                    <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-1">
                                        <UserCheck className="w-4 h-4" />
                                        User Verifications Pending ({pending.verifications.length})
                                    </h3>
                                    <div className="space-y-2">
                                        {pending.verifications.slice(0, 5).map(user => (
                                            <Link
                                                key={user.id}
                                                to={`/admin/users`}
                                                className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors"
                                            >
                                                <div>
                                                    <p className="text-sm font-medium text-white">{user.username}</p>
                                                    <p className="text-xs text-gray-400">{user.email}</p>
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-gray-400" />
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Stale Disputes */}
                            {pending.staleDisputes.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-1">
                                        <Clock className="w-4 h-4" />
                                        Stale Disputes (No activity 3+ days)
                                    </h3>
                                    <div className="space-y-2">
                                        {pending.staleDisputes.slice(0, 5).map(dispute => (
                                            <Link
                                                key={dispute.id}
                                                to={`/disputes/${dispute.id}`}
                                                className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors"
                                            >
                                                <div>
                                                    <p className="text-sm font-medium text-white">{dispute.title}</p>
                                                    <p className="text-xs text-gray-400">
                                                        Last activity: {getTimeAgo(new Date(dispute.updatedAt))}
                                                    </p>
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-gray-400" />
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {pending.approvals.length === 0 && pending.verifications.length === 0 && pending.staleDisputes.length === 0 && (
                                <div className="text-center py-8 text-gray-400">
                                    <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-400" />
                                    <p>All caught up! No pending actions.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Column - Activity Feed & Quick Stats */}
                <div className="space-y-6">
                    {/* User Stats */}
                    {stats && (
                        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Users className="w-5 h-5 text-purple-400" />
                                User Statistics
                            </h2>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-400 flex items-center gap-2">
                                        <UserCheck className="w-4 h-4" />
                                        Verified Users
                                    </span>
                                    <span className="text-white font-medium">{stats.users.verified}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-400 flex items-center gap-2">
                                        <UserX className="w-4 h-4" />
                                        Suspended
                                    </span>
                                    <span className="text-white font-medium">{stats.users.suspended}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-400 flex items-center gap-2">
                                        <Shield className="w-4 h-4" />
                                        Admins
                                    </span>
                                    <span className="text-white font-medium">{stats.users.admins}</span>
                                </div>
                            </div>
                            <Link
                                to="/admin/users"
                                className="mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm"
                            >
                                Manage Users
                                <ChevronRight className="w-4 h-4" />
                            </Link>
                        </div>
                    )}

                    {/* Quick Stats */}
                    {stats && (
                        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-blue-400" />
                                This Week
                            </h2>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-400">Messages Sent</span>
                                    <span className="text-white font-medium">{stats.activity.messagesThisWeek}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-400">Evidence Uploaded</span>
                                    <span className="text-white font-medium">{stats.activity.evidenceThisWeek}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-400">Court Forwards</span>
                                    <span className="text-white font-medium">{stats.overview.forwardedToCourt}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Recent Activity */}
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-green-400" />
                            Recent Activity
                        </h2>
                        <div className="max-h-96 overflow-y-auto">
                            {activity.length > 0 ? (
                                activity.map((item) => (
                                    <ActivityItem key={item.id} activity={item} />
                                ))
                            ) : (
                                <p className="text-center text-gray-400 py-4">No recent activity</p>
                            )}
                        </div>
                    </div>

                    {/* Services Status */}
                    {health && (
                        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Server className="w-5 h-5 text-cyan-400" />
                                Services
                            </h2>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-700/30">
                                    <span className="text-gray-300">AI Service</span>
                                    <span className={`px-2 py-0.5 text-xs rounded ${health.services.ai ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                        {health.services.ai ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-700/30">
                                    <span className="text-gray-300">Email Service</span>
                                    <span className={`px-2 py-0.5 text-xs rounded ${health.services.email ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                        {health.services.email ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-700/30">
                                    <span className="text-gray-300">Error Tracking</span>
                                    <span className={`px-2 py-0.5 text-xs rounded ${health.services.sentry ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                        {health.services.sentry ? 'Active' : 'Not Configured'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
