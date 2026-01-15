import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
**Status**: Production Ready ✅**Version**: 1.0  **Last Updated**: January 2025  ---- React DevTools for Context inspection- Chrome DevTools WebSocket Inspector- Socket.io Admin UI: https://socket.io/docs/v4/admin-ui/### Debugging Tools- React Context API: https://react.dev/reference/react/useContext- Socket.io Client Docs: https://socket.io/docs/v4/client-api/- Socket.io Docs: https://socket.io/docs/v4/### Official Documentation## Support & Resources```}    proxy_cache_bypass $http_upgrade;    proxy_set_header Host $host;    proxy_set_header Connection "upgrade";    proxy_set_header Upgrade $http_upgrade;    proxy_http_version 1.1;    proxy_pass http://localhost:5000;location /socket.io/ {```nginx### Nginx Configuration (if using reverse proxy)- [ ] Set up alerts for connection failures- [ ] Load test with expected concurrent users- [ ] Verify token refresh mechanism- [ ] Test reconnection behavior on network issues- [ ] Configure proper error logging- [ ] Set up monitoring for socket connections- [ ] Add socket event rate limiting- [ ] Implement Redis adapter for multi-server setup- [ ] Use WSS (WebSocket Secure) instead of WS- [ ] Update CORS origin to production frontend URL### Production Checklist```PORT=5000FRONTEND_URL=https://your-frontend-domain.com# Backend .env```env### Environment Variables## Deployment Considerations```};    }        }, 2000);            stopTyping(id);        typingTimeoutRef.current = setTimeout(() => {                }            clearTimeout(typingTimeoutRef.current);        if (typingTimeoutRef.current) {                startTyping(id);    if (socket && connected && e.target.value.trim()) {        setNewMessage(e.target.value);const handleMessageChange = (e) => {```javascript### Typing Indicator Implementation```}, [socket, connected, id]);    }        return () => leaveDisputeRoom(id);        joinDisputeRoom(id);    if (socket && connected && id) {useEffect(() => {// In DisputeDetail component```javascript### Joining a Dispute Room```}, [socket]);    };        socket.off('message:new', handleNewMessage);    return () => {    socket.on('message:new', handleNewMessage);    };        setMessages(prev => [...prev, message]);    const handleNewMessage = (message) => {    if (!socket) return;useEffect(() => {```javascript### Listening for Messages (Frontend)```});    createdAt: newMessage.createdAt    senderRole: senderRole,    senderName: req.user.username,    content: newMessage.content,    id: newMessage.id,emitToDispute(disputeId, 'message:new', {// Emit to all users in the dispute roomconst newMessage = await Message.create({ ... });// In message creation endpoint```javascript### Sending a Real-Time Message (Backend)## Code Examples8. **Socket Clustering**: Distribute load across workers7. **Event Replay**: Resume events after reconnection6. **Metrics**: Track socket performance and errors5. **Heartbeat Mechanism**: Detect stale connections4. **Offline Support**: Queue events when disconnected3. **Binary Transfers**: Use binary encoding for attachments2. **Event Compression**: Reduce bandwidth for high-frequency events1. **Redis Integration**: Scale across multiple servers### Technical Improvements10. **Reconnection Logic**: Better handling of temporary disconnections9. **Presence Timeout**: Show "Away" status after inactivity8. **Message Search**: Real-time search as you type7. **Admin Dashboard**: Real-time stats and monitoring6. **Notification Center**: Real-time notification bell with count badge5. **Screen Sharing**: For document review during disputes4. **Voice/Video Calls**: WebRTC integration for live mediation3. **File Upload Progress**: Real-time progress bars for attachments2. **Message Reactions**: Allow emoji reactions to messages1. **Read Receipts**: Show when messages are read by recipients### Potential Features## Future Enhancements4. Look for multiple `socket.on()` calls without cleanup3. Ensure unique message IDs in state management2. Check for multiple socket connections (multiple SocketProvider instances)1. Verify event listeners are cleaned up in useEffect return**Solutions**:**Symptoms**: Same message appears multiple times### Issue: Duplicate messages4. Check if socket disconnect event is handled properly3. Ensure email comparison matches exactly (case-sensitive)2. Verify `user:join` and `user:leave` events are emitted1. Check `onlineUsers` Set is being updated in SocketContext**Solutions**:**Symptoms**: Users show as offline when they're online### Issue: Online status not updating4. Verify username comparison logic (shouldn't show own typing)3. Ensure `user:stop-typing` event is emitted on message send2. Check `typingTimeoutRef.current` is being cleared properly1. Verify `stopTyping` is called after 2-second timeout**Solutions**:**Symptoms**: "X is typing..." doesn't disappear or never appears### Issue: Typing indicator stuck or not showing5. Check for JavaScript errors in console4. Verify backend is emitting to correct room: `emitToDispute(disputeId, ...)`3. Inspect Network tab for `message:new` event being emitted2. Check if user joined dispute room: Look for `joinDisputeRoom(id)` call1. Verify socket is connected: Check `connected` state**Solutions**:**Symptoms**: Message sent but doesn't appear for other users### Issue: Messages not appearing in real-time5. Verify WebSocket isn't blocked by firewall/proxy4. Inspect browser console for connection errors3. Check CORS settings in server.js match frontend URL2. Verify backend is running: `curl http://localhost:5000/health`1. Check JWT token exists in localStorage: `localStorage.getItem('token')`**Solutions**:**Symptoms**: No real-time updates, "connected: false" in console### Issue: Socket not connecting## Common Issues & Troubleshooting- Typical usage: <10KB/minute per active user- Status updates: ~200 bytes per event- Messages: ~500-2000 bytes depending on content- Typing indicators: ~100 bytes per event### Network Bandwidth- Room data structures: Minimal overhead (<1MB for typical usage)- 1000 concurrent users: ~30MB for sockets- Each socket connection: ~30KB memory### Memory Usage  - Consider horizontal scaling with load balancer  - Implement sticky sessions or use socket.io-redis  - Use Redis adapter for socket.io to share state across servers- **Production Recommendations**:  - Room state not shared across multiple servers  - Max ~10,000 concurrent connections per server- **Limitations**: - **Current Setup**: Single Node.js server, all sockets in-memory### Scalability## Performance Considerations```Received message:new eventJoined dispute room: 42Socket connected// Frontend logs (browser console - if debug enabled)✅ User user@example.com joined dispute room: dispute:42✅ User authenticated via socket: user@example.com// Backend logs (server.js console)```javascript**Console Logs**:5. Verify events: `message:new`, `user:typing`, etc.4. Click the WebSocket connection to see frames (messages)3. Look for connection to `ws://localhost:5000`2. Filter: WS (WebSocket)1. Open DevTools → Network Tab**Chrome DevTools**:### Network Diagnostics   ```   - Solutions section updates automatically   - When AI completes (usually 10-20 seconds), toast notification appears   - Keep dispute detail page open   - Trigger AI analysis in a dispute   ```4. **AI Solutions Test**:   ```   - Send message → indicator disappears immediately   - Stop typing for 2 seconds → indicator disappears   - Other window should show "{username} is typing..."   - Start typing in one window (don't send)   - Open dispute detail in two windows (different users)   ```3. **Typing Indicator Test**:   ```   - Close Window 2 → "Online" indicator disappears in Window 1   - If User B is in any disputes with User A, green "Online" indicator should show   - Navigate to Dashboard in Window 1      Window 2: Login as User B   Window 1: Login as User A   ```2. **Online Status Test**:   ```   - Accept case in Window 2 → Status updates in both windows + toast   - Type in Window 1 → "User A is typing..." should appear in Window 2   - Send messages from Window 1 → Should appear instantly in Window 2   - Open same dispute in both windows      Window 2: Login as User B (Defendant)   Window 1: Login as User A (Plaintiff)   ```1. **Two Browser Windows Test**:### Manual Testing Steps## Testing Real-Time Features- Consider implementing socket event rate limiting if abuse detected- Socket.io events are naturally rate-limited by user interaction- Existing express-rate-limit applies to REST API endpoints### Rate Limiting- **No Cross-Dispute Leakage**: Room-based architecture prevents message leakage- **User Validation**: Backend validates user permissions before emitting events- **Room Isolation**: Messages only sent to users in the same dispute room### Authorization- **User Context**: Authenticated user info available in socket.data- **Token Validation**: JWT_SECRET verified on connection- **JWT Required**: Every socket connection must authenticate### Authentication## Security Features   - Receives real-time dispute updates   - Displays online status indicators3. **Dashboard.jsx**:   - Receives status updates   - Handles typing indicators   - Listens for new messages   - Joins dispute room on mount2. **DisputeDetail.jsx**: 1. **App.jsx**: Wraps entire application with SocketProvider#### Integration Points```} = useSocket();    stopTyping        // Function to emit typing stop    startTyping,      // Function to emit typing start    leaveDisputeRoom, // Function to leave a dispute room    joinDisputeRoom,  // Function to join a dispute room    onlineUsers,      // Set<string> of online user emails    connected,        // Boolean connection status    socket,           // Socket.io client instanceconst {```javascript**Exported API**:- Helper functions for common operations- Online users tracking with Set data structure- Connection state tracking (connected/disconnected)- Automatic connection with JWT token from localStorage- Single socket instance managed via React Context**Features**:**File**: `frontend/src/context/SocketContext.jsx`#### Context Provider### Frontend (React + Socket.io Client)```function emitToUser(userEmail, event, data)// Emit to a specific user across all their socketsfunction emitToDispute(disputeId, event, data)// Emit to all users in a dispute room```javascript#### Helper Functions   - `dispute:ai-ready`: AI analysis completed with new solutions   - `dispute:accepted`: Defendant accepted the case3. **Status Events**   - `typing:stop`: User stopped typing in a dispute   - `typing:start`: User started typing in a dispute   - `message:new`: Broadcast new message to all users in dispute room2. **Messaging Events**   - `user:join`: Broadcasts when user connects successfully   - `disconnect`: Socket disconnects (broadcasts user:leave)   - `connection`: New socket connects1. **Connection Events**#### Event Handlers- **Auto Cleanup**: Rooms are automatically cleaned up when last user leaves- **Leave Event**: `dispute:leave` - User leaves a dispute room- **Join Event**: `dispute:join` - User joins a specific dispute room- **Dispute Rooms**: Format `dispute:{id}` (e.g., `dispute:42`)#### Room Management- **Security**: Unauthorized connections are rejected with error message- **User Identification**: Decoded token provides `userId` and `email` for user tracking- **Token Location**: `socket.handshake.auth.token`- **JWT Verification**: All socket connections must provide a valid JWT token#### Authentication Middleware```});    }        credentials: true        origin: 'http://localhost:5173',    cors: {const io = new Server(httpServer, {const httpServer = createServer(app);// server.js - Socket.io setup```javascript#### Configuration### Backend (Socket.io Server)## Technical Architecture- **Toast Notifications**: User-friendly notifications for important status changes- **Events**: `dispute:accepted`, `dispute:ai-ready`- **AI Solutions Ready**: Notification when AI analysis completes and solutions are available- **Instant Case Acceptance**: When a defendant accepts a case, all parties see the update immediately### ✅ 4. Dispute Status Updates- **Global Tracking**: Maintains a Set of online user emails accessible across components  - Shows online status for the opposing party in each dispute  - Green pulsing dot with "Online" text in Dashboard dispute cards- **Visual Indicators**: - **Events**: `user:join`, `user:leave`, `disconnect`- **User Presence Tracking**: Real-time tracking of which users are currently online### ✅ 3. Online/Offline Status- **Smart Detection**: Only shows typing status for other users (not yourself)- **UI**: Displays "{username} is typing..." below messages- **Debouncing**: 2-second inactivity timeout before stopping typing indicator- **Events**: `user:typing`, `user:stop-typing`- **Live Typing Status**: Shows when other users are typing in the chat### ✅ 2. Typing Indicators- **Implementation**: Messages sent via REST API trigger Socket.io broadcast to all users in the dispute room- **Scope**: Dispute room-based (only participants receive messages)- **Event**: `message:new`- **Instant Message Delivery**: Messages appear instantly for all parties in a dispute without page refresh### ✅ 1. Real-Time Messaging## Features ImplementedThe MediaAI platform now includes comprehensive real-time communication using **Socket.io** for WebSocket connections. This eliminates the need for manual page refreshes and provides instant updates across all connected clients.## Overviewimport { getDisputes, getStats } from '../api';
import { Scale, Clock, CheckCircle, AlertCircle, Plus, Building, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSocket } from '../context/SocketContext';

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
    
    // Socket.io for online status
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

        if (dispute.forwardedToCourt || dispute.status === 'ForwardedToCourt') {
            return { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300', text: 'Forwarded to Court', icon: Building };
        }
        if (dispute.status === 'Resolved') {
            return { color: 'bg-blue-100 text-blue-800', text: 'Resolved', icon: CheckCircle };
        }
        if (dispute.status === 'Active') {
            return { color: 'bg-green-100 text-green-800', text: 'Active', icon: CheckCircle };
        }
        if (dispute.status === 'Pending' && isDefendant && !dispute.respondentAccepted) {
            return { color: 'bg-red-100 text-red-800', text: 'Action Required', icon: AlertCircle };
        }
        if (dispute.status === 'Pending') {
            return { color: 'bg-yellow-100 text-yellow-800', text: 'Awaiting Response', icon: Clock };
        }
        return { color: 'bg-gray-100 text-gray-800', text: dispute.status, icon: Clock };
    };

    if (loading) return <div className="p-4 text-center">Loading disputes...</div>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Disputes</h1>
                <Link
                    to="/new"
                    className="inline-flex items-center bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 font-medium shadow-sm transition-colors"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    File New Case
                </Link>
            </div>

            {/* Search & Filter Bar */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                    {/* Search Input */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by title, description, case ID, or party names..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        />
                    </div>
                    
                    {/* Status Filter */}
                    <div className="flex items-center gap-2">
                        <Filter className="w-5 h-5 text-gray-400" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        >
                            <option value="All">All Status</option>
                            <option value="Pending">Pending</option>
                            <option value="Active">Active</option>
                            <option value="Resolved">Resolved</option>
                            <option value="ForwardedToCourt">Forwarded to Court</option>
                        </select>
                    </div>
                </div>
                
                {/* Results Summary */}
                {(debouncedSearch || statusFilter !== 'All') && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        Found {totalItems} result{totalItems !== 1 ? 's' : ''}
                        {debouncedSearch && ` for "${debouncedSearch}"`}
                        {statusFilter !== 'All' && ` with status "${statusFilter}"`}
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg w-fit">
                <button
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'all' ? 'bg-white dark:bg-gray-600 shadow text-indigo-600 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white'
                        }`}
                    onClick={() => setViewMode('all')}
                >
                    All Cases
                </button>
                <button
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'my_cases' ? 'bg-white dark:bg-gray-600 shadow text-indigo-600 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white'
                        }`}
                    onClick={() => setViewMode('my_cases')}
                >
                    Filed by Me
                </button>
                <button
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'against_me' ? 'bg-white dark:bg-gray-600 shadow text-indigo-600 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white'
                        }`}
                    onClick={() => setViewMode('against_me')}
                >
                    Against Me
                </button>
            </div>

            {/* Admin Stats */}
            {stats && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Total Disputes</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalDisputes}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Pending</p>
                        <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Active</p>
                        <p className="text-2xl font-bold text-green-600">{stats.active || 0}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Resolved</p>
                        <p className="text-2xl font-bold text-blue-600">{stats.resolved || 0}</p>
                    </div>
                </div>
            )}

            {/* Disputes Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredDisputes.map((dispute, index) => {
                    const statusBadge = getStatusBadge(dispute);
                    const StatusIcon = statusBadge.icon;
                    const isPlaintiff = dispute.plaintiffEmail === currentUserEmail;

                    return (
                        <Link key={dispute.id} to={`/disputes/${dispute.id}`} className="block">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-all p-4 border-l-4"
                                style={{ borderColor: isPlaintiff ? '#6366f1' : '#ef4444' }}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <h3 className="font-semibold text-gray-900 dark:text-white truncate flex-1">{dispute.title}</h3>
                                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium flex items-center ${statusBadge.color}`}>
                                        <StatusIcon className="w-3 h-3 mr-1" />
                                        {statusBadge.text}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 truncate mb-3">{dispute.description}</p>
                                <div className="flex items-center justify-between text-xs text-gray-400">
                                    <span>Case #{dispute.id}</span>
                                    <div className="flex items-center gap-2">
                                        <span>{isPlaintiff ? `vs ${dispute.respondentName}` : `by ${dispute.plaintiffName}`}</span>
                                        {/* Online status indicator */}
                                        {(isPlaintiff ? onlineUsers.has(dispute.respondentEmail) : onlineUsers.has(dispute.plaintiffEmail)) && (
                                            <div className="flex items-center gap-1 text-green-500">
                                                <span className="relative flex h-2 w-2">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                                </span>
                                                <span className="text-xs">Online</span>
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
            {filteredDisputes.length === 0 && (
                <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-600">
                    <Scale className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-4">
                        {debouncedSearch || statusFilter !== 'All' 
                            ? 'No disputes match your search criteria' 
                            : 'No disputes found'}
                    </p>
                    {!debouncedSearch && statusFilter === 'All' && (
                        <Link
                            to="/new"
                            className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                        >
                            <Plus className="w-4 h-4 mr-1" />
                            File your first case
                        </Link>
                    )}
                </div>
            )}
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} disputes
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 text-gray-700 dark:text-gray-300"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Previous
                        </button>
                        
                        <div className="flex items-center gap-1">
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
                                            onClick={() => setCurrentPage(pageNum)}
                                            className={`px-3 py-2 rounded-lg ${
                                                currentPage === pageNum
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                                            }`}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                } else if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                                    return <span key={pageNum} className="px-2 text-gray-500">...</span>;
                                }
                                return null;
                            })}
                        </div>
                        
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 text-gray-700 dark:text-gray-300"
                        >
                            Next
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
