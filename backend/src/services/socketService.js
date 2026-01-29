
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io;
const connectedUsers = new Map(); // userId -> { socketId, username, email }

const JWT_SECRET = process.env.JWT_SECRET;

export const initializeSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.NODE_ENV === 'production'
                ? process.env.FRONTEND_URL
                : ['http://localhost:5173', 'http://localhost:3000'],
            credentials: true
        }
    });

    // Make io globally accessible (optional, but keeping for backward compatibility if needed)
    global.io = io;

    // Socket.io Authentication Middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication error'));
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            socket.userId = decoded.id;
            socket.userRole = decoded.role;
            next();
        } catch (err) {
            next(new Error('Authentication error'));
        }
    });

    // Socket.io Event Handlers
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.userId} (${socket.id})`);

        // Handle user joining
        socket.on('user:join', async (userData) => {
            connectedUsers.set(socket.userId, {
                socketId: socket.id,
                username: userData.username,
                email: userData.email,
                userId: socket.userId
            });

            // Join user to their own room for direct messages
            socket.join(`user:${socket.userId}`);
            console.log(`User ${userData.username} joined (Socket: ${socket.id})`);
        });

        // Join dispute room
        socket.on('dispute:join', (disputeId) => {
            if (disputeId) {
                socket.join(`dispute:${disputeId}`);
                console.log(`User ${socket.userId} joined dispute room: ${disputeId}`);
            }
        });

        // Leave dispute room
        socket.on('dispute:leave', (disputeId) => {
            if (disputeId) {
                socket.leave(`dispute:${disputeId}`);
                console.log(`User ${socket.userId} left dispute room: ${disputeId}`);
            }
        });

        // Typing indicators
        socket.on('typing', ({ disputeId, username }) => {
            socket.to(`dispute:${disputeId}`).emit('user:typing', { username });
        });

        socket.on('stop_typing', ({ disputeId, username }) => {
            socket.to(`dispute:${disputeId}`).emit('user:stop_typing', { username });
        });

        // Disconnect
        socket.on('disconnect', () => {
            connectedUsers.delete(socket.userId);
            console.log(`User disconnected: ${socket.userId}`);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};

export const emitToDispute = (disputeId, event, data) => {
    if (!io) return;
    io.to(`dispute:${disputeId}`).emit(event, data);
};

export const emitToUser = (userId, event, data) => {
    if (!io) return;
    const user = connectedUsers.get(userId);
    if (user) {
        io.to(user.socketId).emit(event, data);
    } else {
        // Fallback: emit to user room if they are joined but not in map (shouldn't happen with correct logic)
        io.to(`user:${userId}`).emit(event, data);
    }
};

export const getConnectedUsers = () => connectedUsers;
