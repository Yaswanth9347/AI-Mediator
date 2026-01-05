import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

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
    const [onlineUsers, setOnlineUsers] = useState(new Set());

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            return;
        }

        // Initialize socket connection
        const newSocket = io('http://localhost:5000', {
            auth: {
                token
            },
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5
        });

        newSocket.on('connect', () => {
            console.log('Socket connected:', newSocket.id);
            setConnected(true);
            
            // Join with user data
            const username = localStorage.getItem('username');
            const email = localStorage.getItem('userEmail');
            newSocket.emit('user:join', { username, email });
        });

        newSocket.on('disconnect', () => {
            console.log('Socket disconnected');
            setConnected(false);
        });

        newSocket.on('connect_error', (error) => {
            console.error('Socket connection error:', error.message);
            setConnected(false);
        });

        // Handle online/offline status
        newSocket.on('user:online', ({ userId, username }) => {
            setOnlineUsers(prev => new Set([...prev, userId]));
        });

        newSocket.on('user:offline', ({ userId }) => {
            setOnlineUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(userId);
                return newSet;
            });
        });

        setSocket(newSocket);

        // Cleanup on unmount
        return () => {
            newSocket.close();
        };
    }, []);

    const joinDisputeRoom = (disputeId) => {
        if (socket && connected) {
            socket.emit('dispute:join', disputeId);
        }
    };

    const leaveDisputeRoom = (disputeId) => {
        if (socket && connected) {
            socket.emit('dispute:leave', disputeId);
        }
    };

    const startTyping = (disputeId, username) => {
        if (socket && connected) {
            socket.emit('typing:start', { disputeId, username });
        }
    };

    const stopTyping = (disputeId) => {
        if (socket && connected) {
            socket.emit('typing:stop', { disputeId });
        }
    };

    const value = {
        socket,
        connected,
        onlineUsers,
        joinDisputeRoom,
        leaveDisputeRoom,
        startTyping,
        stopTyping
    };

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
};
