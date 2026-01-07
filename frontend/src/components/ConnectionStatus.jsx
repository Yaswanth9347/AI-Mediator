import { useState, useEffect, useRef, useCallback } from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

/**
 * ConnectionStatus - Visual indicator for socket connection state
 * Shows connected/disconnected/reconnecting states with animations
 */
export default function ConnectionStatus({ connected, reconnecting = false, className = '' }) {
    const [visible, setVisible] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const prevConnectedRef = useRef(connected);
    const hideTimeoutRef = useRef(null);

    useEffect(() => {
        // Clear any pending timeout
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
        }

        if (!connected || reconnecting) {
            // Show immediately when disconnected or reconnecting
            setVisible(true);
            setShowSuccess(false);
        } else if (!prevConnectedRef.current && connected) {
            // Just reconnected - show success briefly
            setVisible(true);
            setShowSuccess(true);
            hideTimeoutRef.current = setTimeout(() => {
                setVisible(false);
                setShowSuccess(false);
            }, 3000);
        }

        prevConnectedRef.current = connected;

        return () => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        };
    }, [connected, reconnecting]);

    if (!visible) return null;

    return (
        <div 
            className={`fixed bottom-4 left-4 z-50 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg transition-all duration-300 ${
                showSuccess 
                    ? 'bg-green-600 text-white' 
                    : reconnecting 
                        ? 'bg-yellow-600 text-white' 
                        : 'bg-red-600 text-white'
            } ${className}`}
        >
            {showSuccess ? (
                <>
                    <Wifi className="w-4 h-4" />
                    <span className="text-sm font-medium">Connected</span>
                </>
            ) : reconnecting ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm font-medium">Reconnecting...</span>
                </>
            ) : (
                <>
                    <WifiOff className="w-4 h-4" />
                    <span className="text-sm font-medium">Connection lost</span>
                </>
            )}
        </div>
    );
}

/**
 * useConnectionStatus - Hook for managing connection status state
 */
export function useConnectionStatus(socket) {
    const [status, setStatus] = useState({
        connected: false,
        reconnecting: false,
        reconnectAttempt: 0,
    });

    useEffect(() => {
        if (!socket) {
            setStatus({ connected: false, reconnecting: false, reconnectAttempt: 0 });
            return;
        }

        const handleConnect = () => {
            setStatus({ connected: true, reconnecting: false, reconnectAttempt: 0 });
        };

        const handleDisconnect = () => {
            setStatus(prev => ({ ...prev, connected: false }));
        };

        const handleReconnectAttempt = (attempt) => {
            setStatus({ connected: false, reconnecting: true, reconnectAttempt: attempt });
        };

        const handleReconnect = () => {
            setStatus({ connected: true, reconnecting: false, reconnectAttempt: 0 });
        };

        const handleReconnectFailed = () => {
            setStatus({ connected: false, reconnecting: false, reconnectAttempt: 0 });
        };

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('reconnect_attempt', handleReconnectAttempt);
        socket.on('reconnect', handleReconnect);
        socket.on('reconnect_failed', handleReconnectFailed);

        // Set initial state
        setStatus({
            connected: socket.connected,
            reconnecting: false,
            reconnectAttempt: 0,
        });

        return () => {
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('reconnect_attempt', handleReconnectAttempt);
            socket.off('reconnect', handleReconnect);
            socket.off('reconnect_failed', handleReconnectFailed);
        };
    }, [socket]);

    return status;
}
