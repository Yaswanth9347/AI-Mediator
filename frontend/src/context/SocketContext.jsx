import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import SOCKET_EVENTS from '../constants/socketEvents';

const SocketContext = createContext();

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocket must be used within SocketProvider');
    }
    return context;
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    const [reconnecting, setReconnecting] = useState(false);
    const [reconnectAttempt, setReconnectAttempt] = useState(0);
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const [unreadNotifications, setUnreadNotifications] = useState(0);
    
    // Track current dispute room for reconnection sync
    const currentDisputeIdRef = useRef(null);
    // Callbacks for sync after reconnection
    const syncCallbacksRef = useRef(new Map());

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            return;
        }

        const newSocket = io('http://localhost:5000', {
            auth: { token },
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 10,
            timeout: 10000,
        });

        newSocket.on('connect', () => {
            console.log('Socket connected:', newSocket.id);
            setConnected(true);
            setReconnecting(false);
            setReconnectAttempt(0);
            
            const username = localStorage.getItem('username');
            const email = localStorage.getItem('userEmail');
            newSocket.emit(SOCKET_EVENTS.USER_JOIN, { username, email });
            
            // Rejoin dispute room if we were in one
            if (currentDisputeIdRef.current) {
                console.log('Rejoining dispute room after reconnect:', currentDisputeIdRef.current);
                newSocket.emit(SOCKET_EVENTS.DISPUTE_JOIN, currentDisputeIdRef.current);
                
                // Trigger sync callback if registered
                const syncCallback = syncCallbacksRef.current.get(currentDisputeIdRef.current);
                if (syncCallback) {
                    console.log('Triggering sync callback for dispute:', currentDisputeIdRef.current);
                    syncCallback();
                }
            }
        });

        newSocket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            setConnected(false);
            // If server disconnected us, we'll try to reconnect
            if (reason === 'io server disconnect') {
                newSocket.connect();
            }
        });

        newSocket.on('reconnect_attempt', (attempt) => {
            console.log('Socket reconnection attempt:', attempt);
            setReconnecting(true);
            setReconnectAttempt(attempt);
        });

        newSocket.on('reconnect', (attemptNumber) => {
            console.log('Socket reconnected after', attemptNumber, 'attempts');
            setConnected(true);
            setReconnecting(false);
            setReconnectAttempt(0);
        });

        newSocket.on('reconnect_failed', () => {
            console.error('Socket reconnection failed');
            setReconnecting(false);
            setReconnectAttempt(0);
        });

        newSocket.on('connect_error', (error) => {
            console.error('Socket connection error:', error.message);
            setConnected(false);
        });

        newSocket.on(SOCKET_EVENTS.USER_ONLINE, ({ userId, username }) => {
            setOnlineUsers(prev => new Set([...prev, userId]));
        });

        newSocket.on(SOCKET_EVENTS.USER_OFFLINE, ({ userId }) => {
            setOnlineUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(userId);
                return newSet;
            });
        });

        // Listen for notification count updates
        newSocket.on(SOCKET_EVENTS.NOTIFICATION_NEW, (notification) => {
            setUnreadNotifications(prev => prev + 1);
        });

        newSocket.on(SOCKET_EVENTS.NOTIFICATION_COUNT, ({ count }) => {
            setUnreadNotifications(count);
        });

        setSocket(newSocket);

        return () => {
            newSocket.close();
        };
    }, []);

    const joinDisputeRoom = useCallback((disputeId, onSyncCallback) => {
        if (socket && connected) {
            socket.emit(SOCKET_EVENTS.DISPUTE_JOIN, disputeId);
            currentDisputeIdRef.current = disputeId;
            
            // Register sync callback for reconnection
            if (onSyncCallback) {
                syncCallbacksRef.current.set(disputeId, onSyncCallback);
            }
        }
    }, [socket, connected]);

    const leaveDisputeRoom = useCallback((disputeId) => {
        if (socket && connected) {
            socket.emit(SOCKET_EVENTS.DISPUTE_LEAVE, disputeId);
        }
        if (currentDisputeIdRef.current === disputeId) {
            currentDisputeIdRef.current = null;
            syncCallbacksRef.current.delete(disputeId);
        }
    }, [socket, connected]);

    const startTyping = useCallback((disputeId, username) => {
        if (socket && connected) {
            socket.emit(SOCKET_EVENTS.TYPING_START, { disputeId, username });
        }
    }, [socket, connected]);

    const stopTyping = useCallback((disputeId) => {
        if (socket && connected) {
            socket.emit(SOCKET_EVENTS.TYPING_STOP, { disputeId });
        }
    }, [socket, connected]);

    // Helper to emit with optimistic callback
    const emitWithAck = useCallback((event, data, timeout = 5000) => {
        return new Promise((resolve, reject) => {
            if (!socket || !connected) {
                reject(new Error('Socket not connected'));
                return;
            }
            
            const timeoutId = setTimeout(() => {
                reject(new Error('Socket acknowledgment timeout'));
            }, timeout);
            
            socket.emit(event, data, (response) => {
                clearTimeout(timeoutId);
                if (response?.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            });
        });
    }, [socket, connected]);

    const value = {
        socket,
        connected,
        reconnecting,
        reconnectAttempt,
        onlineUsers,
        unreadNotifications,
        setUnreadNotifications,
        joinDisputeRoom,
        leaveDisputeRoom,
        startTyping,
        stopTyping,
        emitWithAck,
        SOCKET_EVENTS,
    };

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
};
