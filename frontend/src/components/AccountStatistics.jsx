import { useState, useEffect } from 'react';
import { TrendingUp, Scale, CheckCircle, Clock, Activity, Loader2, BarChart3 } from 'lucide-react';
import { getUserStatistics } from '../api';
import toast from 'react-hot-toast';

export default function AccountStatistics() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStatistics();
    }, []);

    const fetchStatistics = async () => {
        try {
            setLoading(true);
            const response = await getUserStatistics();
            setStats(response.data);
        } catch (error) {
            console.error('Fetch statistics error:', error);
            toast.error('Failed to load statistics');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="text-center py-12 text-gray-400">
                Failed to load statistics
            </div>
        );
    }

    const StatCard = ({ icon: Icon, label, value, color = 'blue', description }) => (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 hover:bg-gray-800 transition-colors">
            <div className="flex items-start justify-between mb-3">
                <div className={`bg-${color}-600/20 p-3 rounded-lg`}>
                    <Icon className={`w-6 h-6 text-${color}-400`} />
                </div>
                <div className="text-right">
                    <div className="text-3xl font-bold text-white">{value}</div>
                    {description && (
                        <div className="text-xs text-gray-400 mt-1">{description}</div>
                    )}
                </div>
            </div>
            <div className="text-sm font-medium text-gray-300">{label}</div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    <BarChart3 className="w-6 h-6 text-blue-400" />
                    Account Statistics
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                    Overview of your activity and disputes
                </p>
            </div>

            {/* Dispute Statistics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard
                    icon={Scale}
                    label="Total Disputes"
                    value={stats.disputes.total}
                    color="blue"
                />
                
                <StatCard
                    icon={TrendingUp}
                    label="As Plaintiff"
                    value={stats.disputes.asPlaintiff}
                    color="purple"
                    description="Cases you filed"
                />
                
                <StatCard
                    icon={Scale}
                    label="As Defendant"
                    value={stats.disputes.asDefendant}
                    color="orange"
                    description="Cases against you"
                />
                
                <StatCard
                    icon={CheckCircle}
                    label="Resolved Cases"
                    value={stats.disputes.resolved}
                    color="green"
                />
                
                <StatCard
                    icon={Activity}
                    label="Active Cases"
                    value={stats.disputes.active}
                    color="blue"
                />
                
                <StatCard
                    icon={Clock}
                    label="Pending Cases"
                    value={stats.disputes.pending}
                    color="yellow"
                />
            </div>

            {/* Activity Statistics */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-400" />
                    Account Activity
                </h3>
                
                <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg mb-4">
                    <div>
                        <div className="text-sm text-gray-400">Total Activities Logged</div>
                        <div className="text-2xl font-bold text-white mt-1">
                            {stats.activityCount}
                        </div>
                    </div>
                    <Activity className="w-8 h-8 text-blue-400" />
                </div>

                {/* Recent Activity */}
                {stats.recentActivity && stats.recentActivity.length > 0 && (
                    <div>
                        <h4 className="text-sm font-semibold text-gray-300 mb-3">Recent Activity</h4>
                        <div className="space-y-2">
                            {stats.recentActivity.map((activity, index) => (
                                <div
                                    key={index}
                                    className="flex items-start gap-3 p-3 bg-gray-900/30 border border-gray-700 rounded-lg"
                                >
                                    <div className={`w-2 h-2 rounded-full mt-2 ${
                                        activity.category === 'auth' ? 'bg-green-400' :
                                        activity.category === 'dispute' ? 'bg-blue-400' :
                                        activity.category === 'payment' ? 'bg-yellow-400' :
                                        activity.category === 'security' ? 'bg-red-400' :
                                        'bg-gray-400'
                                    }`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-white">{activity.description}</div>
                                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                                            <span className="capitalize">{activity.category}</span>
                                            <span>•</span>
                                            <span>{new Date(activity.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Success Rate */}
            {stats.disputes.total > 0 && (
                <div className="bg-gradient-to-r from-green-900/20 to-blue-900/20 border border-green-700 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-green-400" />
                        Resolution Rate
                    </h3>
                    
                    <div className="flex items-end gap-4">
                        <div className="flex-1">
                            <div className="text-4xl font-bold text-white mb-2">
                                {Math.round((stats.disputes.resolved / stats.disputes.total) * 100)}%
                            </div>
                            <div className="text-sm text-gray-400">
                                {stats.disputes.resolved} of {stats.disputes.total} disputes resolved
                            </div>
                        </div>
                        
                        <div className="w-1/2">
                            <div className="bg-gray-800 rounded-full h-4 overflow-hidden">
                                <div
                                    className="bg-gradient-to-r from-green-500 to-blue-500 h-full transition-all duration-500"
                                    style={{
                                        width: `${(stats.disputes.resolved / stats.disputes.total) * 100}%`
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
