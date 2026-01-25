import { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, X, AlertCircle, MessageCircle, Scale, FileText, Shield, Building, Bot, Clock } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { useNavigate } from 'react-router-dom';

const typeIcons = {
    dispute: FileText,
    message: MessageCircle,
    ai: Bot,
    resolution: CheckCheck,
    admin: Shield,
    system: AlertCircle
};

const priorityStyles = {
    low: 'bg-slate-700/50 border-slate-600/50 text-slate-300',
    normal: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    high: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
    urgent: 'bg-red-500/10 border-red-500/20 text-red-400'
};

export default function NotificationBell() {
    const {
        notifications,
        unreadCount,
        markRead,
        markAllRead,
        dismissNotification,
        loading
    } = useNotifications();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const navigate = useNavigate();

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleNotificationClick = (notification) => {
        if (!notification.isRead) {
            markRead(notification.id);
        }

        // Navigation logic
        if (notification.disputeId) {
            navigate(`/disputes/${notification.disputeId}`);
            setIsOpen(false);
        }
    };

    const formatTimestamp = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const GetIcon = ({ type }) => {
        const IconComponent = typeIcons[type] || Bell;
        return <IconComponent className="w-4 h-4" />;
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Icon Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`relative p-2 rounded-lg transition-all duration-200 ${isOpen
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                        : 'text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
            >
                <Bell className={`w-6 h-6 ${unreadCount > 0 ? 'animate-wiggle' : ''}`} />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[1.25rem] h-5 flex items-center justify-center px-1 border-2 border-white dark:border-gray-900 shadow-sm animate-in zoom-in duration-200">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown - Enhanced Visuals */}
            {isOpen && (
                <div
                    className="absolute right-0 mt-3 w-96 bg-white dark:bg-[#0f1e3a] rounded-xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10 z-50 transform origin-top-right transition-all duration-200 ease-out animate-in fade-in zoom-in-95"
                    style={{ backdropFilter: 'none' }} // Explicitly disable blur/transparency if any inherited
                >
                    {/* Header */}
                    <div className="p-4 border-b border-gray-100 dark:border-blue-900/50 flex items-center justify-between bg-gray-50/50 dark:bg-slate-900/50 rounded-t-xl">
                        <div className="flex items-center gap-2">
                            <Bell className="w-4 h-4 text-indigo-500" />
                            <h3 className="font-semibold text-gray-900 dark:text-blue-50">Notifications</h3>
                            {unreadCount > 0 && (
                                <span className="bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 text-xs px-2 py-0.5 rounded-full font-medium">
                                    {unreadCount} new
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllRead}
                                    className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 px-2 py-1 rounded transition-colors flex items-center gap-1"
                                    title="Mark all as read"
                                >
                                    <CheckCheck className="w-3.5 h-3.5" />
                                    Mark all read
                                </button>
                            )}
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Notifications List */}
                    <div className="overflow-y-auto max-h-[480px] overscroll-contain">
                        {loading && notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 space-y-3 text-gray-400 dark:text-blue-300/50">
                                <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent" />
                                <span className="text-sm">Loading updates...</span>
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                                <div className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-full mb-3 ring-1 ring-gray-100 dark:ring-white/5">
                                    <Bell className="w-8 h-8 text-gray-300 dark:text-blue-400/30" />
                                </div>
                                <h4 className="text-gray-900 dark:text-blue-100 font-medium mb-1">All caught up!</h4>
                                <p className="text-sm text-gray-500 dark:text-blue-400/70 max-w-[200px]">
                                    No new notifications to check right now.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100 dark:divide-blue-900/30">
                                {notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        className={`group relative p-4 transition-all duration-200 hover:bg-gray-50 dark:hover:bg-slate-800/80 cursor-pointer ${!notification.isRead
                                                ? 'bg-indigo-50/40 dark:bg-indigo-900/10'
                                                : 'bg-white dark:bg-[#0f1e3a]'
                                            }`}
                                        onClick={() => handleNotificationClick(notification)}
                                    >
                                        <div className="flex gap-3">
                                            {/* Icon */}
                                            <div className={`mt-0.5 relative shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border ${priorityStyles[notification.priority] || priorityStyles.normal}`}>
                                                <GetIcon type={notification.type} />
                                                {!notification.isRead && (
                                                    <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                                                    </span>
                                                )}
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2 mb-0.5">
                                                    <h4 className={`text-sm font-semibold truncate pr-6 ${!notification.isRead
                                                            ? 'text-gray-900 dark:text-blue-50'
                                                            : 'text-gray-700 dark:text-blue-200/70'
                                                        }`}>
                                                        {notification.title}
                                                    </h4>
                                                    <span className="text-[10px] sm:text-xs text-gray-400 dark:text-blue-400/60 whitespace-nowrap flex items-center gap-1 shrink-0">
                                                        <Clock className="w-3 h-3" />
                                                        {formatTimestamp(notification.createdAt)}
                                                    </span>
                                                </div>
                                                <p className={`text-xs sm:text-sm line-clamp-2 leading-relaxed ${!notification.isRead
                                                        ? 'text-gray-600 dark:text-blue-200'
                                                        : 'text-gray-500 dark:text-blue-300/50'
                                                    }`}>
                                                    {notification.message}
                                                </p>

                                                {/* Meta/Actions - revealed on hover for read items, always visible for unread */}
                                                <div className="flex items-center gap-2 mt-2">
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border border-gray-200 dark:border-blue-800/50 text-gray-500 dark:text-blue-400 uppercase tracking-wider font-semibold`}>
                                                        {notification.type}
                                                    </span>
                                                    {(notification.priority === 'high' || notification.priority === 'urgent') && (
                                                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 border border-red-100 dark:border-red-500/20 font-medium">
                                                            <AlertCircle className="w-3 h-3" />
                                                            {notification.priority}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Dismiss Button - Floating */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    dismissNotification(notification.id);
                                                }}
                                                className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-red-500 dark:text-blue-500/40 dark:hover:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all duration-200"
                                                title="Dismiss"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
