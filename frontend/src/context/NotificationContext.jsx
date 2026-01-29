import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getNotifications, markAsRead, markAllAsRead, deleteNotification } from '../api';
import { useSocket } from './SocketContext';
import toast from 'react-hot-toast';

const NotificationContext = createContext();

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within NotificationProvider');
    }
    return context;
};

export const NotificationProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const { socket, connected } = useSocket();

    // Queue for offline actions
    const offlineQueueRef = useRef([]);

    // Load initial state from local storage or API
    useEffect(() => {
        const loadNotifications = async () => {
            // Only fetch if user is authenticated
            const token = localStorage.getItem('token');
            if (!token) {
                // User not logged in, just load from cache if available
                loadFromCache();
                setLoading(false);
                return;
            }

            if (navigator.onLine) {
                try {
                    setLoading(true);
                    const response = await getNotifications({ limit: 50 });
                    // Deduplicate with existing local storage if any? 
                    // For now, trusting API as source of truth when online
                    setNotifications(response.data.notifications || response.data || []);
                    setUnreadCount(response.data.unreadCount || 0);

                    // Cache to local storage
                    localStorage.setItem('cached_notifications', JSON.stringify(response.data.notifications || response.data || []));
                    localStorage.setItem('cached_unread_count', response.data.unreadCount || 0);
                } catch (error) {
                    // If 401, user session expired - don't show error, just load cache
                    if (error.response?.status === 401) {
                        console.log('Session expired or user not authenticated');
                        loadFromCache();
                    } else {
                        console.error('Failed to fetch notifications:', error);
                        loadFromCache();
                    }
                } finally {
                    setLoading(false);
                }
            } else {
                loadFromCache();
                setLoading(false);
            }
        };

        loadNotifications();

        // Listen for online status to sync
        window.addEventListener('online', handleOnlineSync);
        return () => window.removeEventListener('online', handleOnlineSync);
    }, []);

    const loadFromCache = () => {
        const cached = localStorage.getItem('cached_notifications');
        const count = localStorage.getItem('cached_unread_count');
        if (cached) {
            setNotifications(JSON.parse(cached));
        }
        if (count) {
            setUnreadCount(parseInt(count, 10));
        }
    };

    const handleOnlineSync = async () => {
        // Process offline queue
        while (offlineQueueRef.current.length > 0) {
            const action = offlineQueueRef.current.shift();
            try {
                if (action.type === 'READ') await markAsRead(action.id);
                if (action.type === 'READ_ALL') await markAllAsRead();
                if (action.type === 'DISMISS') await deleteNotification(action.id);
            } catch (error) {
                console.error('Failed to sync offline action:', action, error);
                // Optionally re-queue if it's a transient error
            }
        }

        // Refresh from server
        try {
            const response = await getNotifications({ limit: 50 });
            setNotifications(response.data.notifications || []);
            setUnreadCount(response.data.unreadCount || 0);
        } catch (error) {
            console.error('Sync failed:', error);
        }
    };

    // Socket listener for new notifications
    useEffect(() => {
        if (!socket) return;

        const handleNewNotification = (data) => {
            setNotifications(prev => {
                // Deduplicate by ID
                if (prev.some(n => n.id === data.id)) return prev;

                const newNotifications = [data, ...prev];
                // Update cache
                localStorage.setItem('cached_notifications', JSON.stringify(newNotifications));
                return newNotifications;
            });

            setUnreadCount(prev => {
                const newCount = prev + 1;
                localStorage.setItem('cached_unread_count', newCount);
                return newCount;
            });

            // Toast for high priority
            if (data.priority === 'high' || data.priority === 'urgent') {
                toast(data.title, {
                    icon: '🔔',
                    duration: 5000
                });
            }
        };

        socket.on('notification', handleNewNotification);

        // Also listen for count updates if provided separately
        // socket.on('notification:count', ({ count }) => setUnreadCount(count));

        return () => {
            socket.off('notification', handleNewNotification);
        };
    }, [socket]);

    const markRead = useCallback(async (id) => {
        // Optimistic update
        setNotifications(prev => {
            const updated = prev.map(n => n.id === id ? { ...n, isRead: true } : n);
            localStorage.setItem('cached_notifications', JSON.stringify(updated));
            return updated;
        });
        setUnreadCount(prev => {
            const newCount = Math.max(0, prev - 1);
            localStorage.setItem('cached_unread_count', newCount);
            return newCount;
        });

        if (navigator.onLine) {
            try {
                await markAsRead(id);
            } catch (error) {
                console.error('Failed to mark read API:', error);
                // Revert optimistic update? Or just queue retry?
            }
        } else {
            offlineQueueRef.current.push({ type: 'READ', id });
        }
    }, []);

    const markAllRead = useCallback(async () => {
        // Optimistic
        setNotifications(prev => {
            const updated = prev.map(n => ({ ...n, isRead: true }));
            localStorage.setItem('cached_notifications', JSON.stringify(updated));
            return updated;
        });
        setUnreadCount(0);
        localStorage.setItem('cached_unread_count', 0);

        if (navigator.onLine) {
            try {
                await markAllAsRead();
                toast.success('All marked as read');
            } catch (error) {
                console.error('Failed to mark all read API:', error);
            }
        } else {
            offlineQueueRef.current.push({ type: 'READ_ALL' });
            toast.success('Marked as read (Offline)');
        }
    }, []);

    const dismissNotification = useCallback(async (id) => {
        // Optimistic remove
        setNotifications(prev => {
            const updated = prev.filter(n => n.id !== id);
            localStorage.setItem('cached_notifications', JSON.stringify(updated));
            return updated;
        });

        // If it was unread, decrement count
        // Note: We need to know if it was unread before filtering. 
        // Ideally we check current state.
        // For simplicity, we relies on the server or just decrement if we find it in current state as unread
        // But since we just filtered it out... let's check first.

        // Wait, 'dismiss' in this context means "Archive" / "Delete" from view.
        // The accessible closure 'notifications' might be stale in a callback if not careful, 
        // but 'setNotifications' updater function is safe.
        // However, to update unread count correctly we need to know.

        // Let's do a functional update for both to be safe, but they are separate states.
        // We can check the item before removing.

        let wasUnread = false;
        setNotifications(prev => {
            const item = prev.find(n => n.id === id);
            if (item && !item.isRead) wasUnread = true;

            const updated = prev.filter(n => n.id !== id);
            localStorage.setItem('cached_notifications', JSON.stringify(updated));
            return updated;
        });

        if (wasUnread) {
            setUnreadCount(prev => {
                const newCount = Math.max(0, prev - 1);
                localStorage.setItem('cached_unread_count', newCount);
                return newCount;
            });
        }

        if (navigator.onLine) {
            try {
                await deleteNotification(id);
            } catch (error) {
                console.error('Failed to dismiss API:', error);
            }
        } else {
            offlineQueueRef.current.push({ type: 'DISMISS', id });
        }
    }, []);

    // Helper to auto-acknowledge/dismiss notifications based on user actions
    // e.g. if user accepts a case, dismiss the "Start Case" notification
    const acknowledgeAction = useCallback((entityId, type) => {
        setNotifications(prev => {
            // Find related notifications
            // Logic: if notification.disputeId === entityId AND notification.type === type (or related)
            // This requires some knowledge of how notifications map to actions.
            // For now, we will filter generic matches.

            const toDismiss = prev.filter(n =>
                (n.disputeId === entityId || n.entityId === entityId) &&
                (!type || n.type === type)
            );

            if (toDismiss.length === 0) return prev;

            toDismiss.forEach(n => {
                // Trigger background dismissal
                if (navigator.onLine) {
                    deleteNotification(n.id).catch(console.error);
                } else {
                    offlineQueueRef.current.push({ type: 'DISMISS', id: n.id });
                }
            });

            const updated = prev.filter(n => !toDismiss.includes(n));
            localStorage.setItem('cached_notifications', JSON.stringify(updated));
            return updated;
        });
    }, []);

    const value = {
        notifications,
        unreadCount,
        loading,
        markRead,
        markAllRead,
        dismissNotification,
        acknowledgeAction
    };

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};
