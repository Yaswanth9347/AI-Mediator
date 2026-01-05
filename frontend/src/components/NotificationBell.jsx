import { useState, useEffect, useRef } from 'react';
import { getNotifications, markAsRead, markAllAsRead } from '../api';
import { Bell, Check, CheckCheck, X, AlertCircle, MessageCircle, Scale, FileText, Shield, Building, Bot } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useSocket } from '../context/SocketContext';

const typeIcons = {
    dispute: FileText,
    message: MessageCircle,
    ai: Bot,
    resolution: CheckCheck,
    admin: Shield,
    system: AlertCircle
};

const priorityColors = {
    low: 'bg-gray-500/20 border-gray-500/30',
    normal: 'bg-blue-500/20 border-blue-500/30',
    high: 'bg-orange-500/20 border-orange-500/30',
    urgent: 'bg-red-500/20 border-red-500/30'
};

export default function NotificationBell() {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef(null);
    const { socket } = useSocket();

    useEffect(() => {
        fetchNotifications();

        // Listen for real-time notifications
        if (socket) {
            socket.on('notification', (data) => {
                // Add new notification to list
                setNotifications(prev => [data, ...prev]);
                setUnreadCount(prev => prev + 1);
                
                // Show toast for high priority
                if (data.priority === 'high' || data.priority === 'urgent') {
                    toast(data.title, {
                        icon: '🔔',
                        duration: 5000
                    });
                }
            });
        }

        return () => {
            if (socket) {
                socket.off('notification');
            }
        };
    }, [socket]);

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

    const fetchNotifications = async () => {
        try {
            setLoading(true);
            const response = await getNotifications({ limit: 20 });
            setNotifications(response.data.notifications || []);
            setUnreadCount(response.data.unreadCount || 0);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAsRead = async (id) => {
        try {
            await markAsRead(id);
            setNotifications(prev => prev.map(n => 
                n.id === id ? { ...n, isRead: true } : n
            ));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
            toast.success('All notifications marked as read');
        } catch (error) {
            console.error('Failed to mark all as read:', error);
            toast.error('Failed to update notifications');
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

    const getNotificationIcon = (type) => {
        const IconComponent = typeIcons[type] || Bell;
        return <IconComponent className="w-4 h-4" />;
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Icon Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-blue-300 hover:text-blue-100 hover:bg-slate-800/50 rounded-lg transition-colors"
            >
                <Bell className="w-6 h-6" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-96 bg-slate-900 rounded-lg shadow-xl border border-blue-800 z-50 max-h-[600px] flex flex-col">
                    {/* Header */}
                    <div className="p-4 border-b border-blue-800 flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold text-blue-100">Notifications</h3>
                            {unreadCount > 0 && (
                                <p className="text-xs text-blue-400">{unreadCount} unread</p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {unreadCount > 0 && (
                                <button
                                    onClick={handleMarkAllAsRead}
                                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                >
                                    <CheckCheck className="w-4 h-4" />
                                    Mark all read
                                </button>
                            )}
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-blue-400 hover:text-blue-300"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Notifications List */}
                    <div className="overflow-y-auto flex-1">
                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="text-center py-12 text-blue-300">
                                <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>No notifications yet</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-blue-800/50">
                                {notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        className={`p-4 hover:bg-slate-800/50 transition-colors cursor-pointer ${
                                            !notification.isRead ? 'bg-blue-950/30' : ''
                                        }`}
                                        onClick={() => {
                                            if (!notification.isRead) {
                                                handleMarkAsRead(notification.id);
                                            }
                                            if (notification.disputeId) {
                                                window.location.href = `/disputes/${notification.disputeId}`;
                                            }
                                        }}
                                    >
                                        <div className="flex items-start gap-3">
                                            {/* Icon */}
                                            <div className={`p-2 rounded-full ${priorityColors[notification.priority] || priorityColors.normal} text-blue-400`}>
                                                {getNotificationIcon(notification.type)}
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <h4 className="text-sm font-medium text-blue-100">
                                                        {notification.title}
                                                        {!notification.isRead && (
                                                            <span className="ml-2 inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                                                        )}
                                                    </h4>
                                                    <span className="text-xs text-blue-500 whitespace-nowrap">
                                                        {formatTimestamp(notification.createdAt)}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-blue-300 mt-1 line-clamp-2">
                                                    {notification.message}
                                                </p>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <span className={`text-xs px-2 py-0.5 rounded border ${priorityColors[notification.priority] || priorityColors.normal} text-blue-400`}>
                                                        {notification.type}
                                                    </span>
                                                    {notification.priority === 'high' || notification.priority === 'urgent' ? (
                                                        <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-red-400">
                                                            {notification.priority}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    {notifications.length > 0 && (
                        <div className="p-3 border-t border-blue-800 text-center">
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    // Could navigate to a dedicated notifications page
                                }}
                                className="text-sm text-blue-400 hover:text-blue-300"
                            >
                                View all notifications
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
