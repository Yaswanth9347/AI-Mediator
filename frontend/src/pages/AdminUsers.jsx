import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllUsers, updateUserRole, suspendUser, activateUser, getUserActivity, deleteUserAdmin } from '../api';
import toast from 'react-hot-toast';
import {
    Users, Search, Filter, ChevronLeft, ChevronRight, MoreVertical,
    Shield, ShieldCheck, ShieldOff, UserCog, Eye, Ban, CheckCircle,
    XCircle, Clock, Mail, Calendar, Activity, Trash2, ArrowLeft,
    AlertTriangle, X, Loader2, RefreshCw, Download, UserPlus
} from 'lucide-react';

export default function AdminUsers() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [verificationFilter, setVerificationFilter] = useState('all');
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const usersPerPage = 10;
    
    // Modals
    const [selectedUser, setSelectedUser] = useState(null);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showActivityModal, setShowActivityModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [userActivity, setUserActivity] = useState([]);
    const [loadingActivity, setLoadingActivity] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Stats
    const [stats, setStats] = useState({
        total: 0,
        admins: 0,
        verified: 0,
        suspended: 0
    });

    useEffect(() => {
        fetchUsers();
    }, []);

    useEffect(() => {
        filterUsers();
    }, [users, searchQuery, roleFilter, statusFilter, verificationFilter]);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const res = await getAllUsers();
            const userList = res.data?.users || [];
            setUsers(userList);
            
            // Calculate stats
            setStats({
                total: userList.length,
                admins: userList.filter(u => u.role === 'Admin').length,
                verified: userList.filter(u => u.isVerified).length,
                suspended: userList.filter(u => u.isSuspended).length
            });
        } catch (error) {
            toast.error('Failed to load users');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const filterUsers = () => {
        let filtered = [...users];

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(user => 
                user.username?.toLowerCase().includes(query) ||
                user.email?.toLowerCase().includes(query)
            );
        }

        // Role filter
        if (roleFilter !== 'all') {
            filtered = filtered.filter(user => user.role === roleFilter);
        }

        // Status filter
        if (statusFilter !== 'all') {
            if (statusFilter === 'active') {
                filtered = filtered.filter(user => !user.isSuspended);
            } else if (statusFilter === 'suspended') {
                filtered = filtered.filter(user => user.isSuspended);
            }
        }

        // Verification filter
        if (verificationFilter !== 'all') {
            if (verificationFilter === 'verified') {
                filtered = filtered.filter(user => user.isVerified);
            } else if (verificationFilter === 'unverified') {
                filtered = filtered.filter(user => !user.isVerified);
            } else if (verificationFilter === 'pending') {
                filtered = filtered.filter(user => user.verificationStatus === 'Pending');
            }
        }

        setFilteredUsers(filtered);
        setCurrentPage(1);
    };

    const handleRoleChange = async (userId, newRole) => {
        try {
            setActionLoading(true);
            await updateUserRole(userId, newRole);
            toast.success(`User role updated to ${newRole}`);
            fetchUsers();
            setShowUserModal(false);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to update role');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSuspendUser = async (userId) => {
        try {
            setActionLoading(true);
            await suspendUser(userId);
            toast.success('User suspended successfully');
            fetchUsers();
            setShowUserModal(false);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to suspend user');
        } finally {
            setActionLoading(false);
        }
    };

    const handleActivateUser = async (userId) => {
        try {
            setActionLoading(true);
            await activateUser(userId);
            toast.success('User activated successfully');
            fetchUsers();
            setShowUserModal(false);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to activate user');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteUser = async () => {
        if (!selectedUser) return;
        
        try {
            setActionLoading(true);
            await deleteUserAdmin(selectedUser.id);
            toast.success('User deleted successfully');
            fetchUsers();
            setShowDeleteModal(false);
            setShowUserModal(false);
            setSelectedUser(null);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to delete user');
        } finally {
            setActionLoading(false);
        }
    };

    const handleViewActivity = async (user) => {
        try {
            setSelectedUser(user);
            setLoadingActivity(true);
            setShowActivityModal(true);
            
            const res = await getUserActivity(user.id);
            setUserActivity(res.data?.activities || []);
        } catch (error) {
            toast.error('Failed to load user activity');
            setUserActivity([]);
        } finally {
            setLoadingActivity(false);
        }
    };

    const openUserModal = (user) => {
        setSelectedUser(user);
        setShowUserModal(true);
    };

    // Pagination
    const indexOfLastUser = currentPage * usersPerPage;
    const indexOfFirstUser = indexOfLastUser - usersPerPage;
    const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);
    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);

    const getVerificationBadge = (user) => {
        if (user.isVerified) {
            return (
                <span className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs">
                    <CheckCircle className="w-3 h-3" />
                    Verified
                </span>
            );
        }
        if (user.verificationStatus === 'Pending') {
            return (
                <span className="flex items-center gap-1 px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs">
                    <Clock className="w-3 h-3" />
                    Pending
                </span>
            );
        }
        return (
            <span className="flex items-center gap-1 px-2 py-1 bg-gray-500/20 text-gray-400 rounded-full text-xs">
                <XCircle className="w-3 h-3" />
                Unverified
            </span>
        );
    };

    const getRoleBadge = (role) => {
        if (role === 'Admin') {
            return (
                <span className="flex items-center gap-1 px-2 py-1 bg-purple-500/20 text-purple-400 rounded-full text-xs">
                    <ShieldCheck className="w-3 h-3" />
                    Admin
                </span>
            );
        }
        return (
            <span className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs">
                <Shield className="w-3 h-3" />
                User
            </span>
        );
    };

    const getStatusBadge = (user) => {
        if (user.isSuspended) {
            return (
                <span className="flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-400 rounded-full text-xs">
                    <Ban className="w-3 h-3" />
                    Suspended
                </span>
            );
        }
        return (
            <span className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs">
                <CheckCircle className="w-3 h-3" />
                Active
            </span>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
                    <p className="text-gray-400">Loading users...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            {/* Header */}
            <div className="bg-gray-800/50 border-b border-gray-700/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate('/dashboard')}
                                className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5 text-gray-400" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                                    <Users className="w-7 h-7 text-indigo-400" />
                                    User Management
                                </h1>
                                <p className="text-gray-400 text-sm mt-1">Manage users, roles, and permissions</p>
                            </div>
                        </div>
                        <button
                            onClick={fetchUsers}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-700/50 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-500/20 rounded-lg">
                                <Users className="w-6 h-6 text-blue-400" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-white">{stats.total}</div>
                                <div className="text-sm text-gray-400">Total Users</div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-purple-500/20 rounded-lg">
                                <ShieldCheck className="w-6 h-6 text-purple-400" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-white">{stats.admins}</div>
                                <div className="text-sm text-gray-400">Admins</div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-green-500/20 rounded-lg">
                                <CheckCircle className="w-6 h-6 text-green-400" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-white">{stats.verified}</div>
                                <div className="text-sm text-gray-400">Verified</div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-red-500/20 rounded-lg">
                                <Ban className="w-6 h-6 text-red-400" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-white">{stats.suspended}</div>
                                <div className="text-sm text-gray-400">Suspended</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 mb-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        {/* Search */}
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search by username or email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            />
                        </div>

                        {/* Role Filter */}
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            className="px-4 py-2.5 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="all">All Roles</option>
                            <option value="User">Users</option>
                            <option value="Admin">Admins</option>
                        </select>

                        {/* Status Filter */}
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-4 py-2.5 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="all">All Status</option>
                            <option value="active">Active</option>
                            <option value="suspended">Suspended</option>
                        </select>

                        {/* Verification Filter */}
                        <select
                            value={verificationFilter}
                            onChange={(e) => setVerificationFilter(e.target.value)}
                            className="px-4 py-2.5 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="all">All Verification</option>
                            <option value="verified">Verified</option>
                            <option value="pending">Pending</option>
                            <option value="unverified">Unverified</option>
                        </select>
                    </div>
                </div>

                {/* Users Table */}
                <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-700/50">
                                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-300">User</th>
                                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-300">Role</th>
                                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-300">Status</th>
                                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-300">Verification</th>
                                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-300">Joined</th>
                                    <th className="text-right px-6 py-4 text-sm font-semibold text-gray-300">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-gray-400">
                                            No users found matching your filters
                                        </td>
                                    </tr>
                                ) : (
                                    currentUsers.map((user) => (
                                        <tr key={user.id} className="border-b border-gray-700/30 hover:bg-gray-700/20 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
                                                        {user.username?.charAt(0).toUpperCase() || 'U'}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-white">{user.username}</div>
                                                        <div className="text-sm text-gray-400">{user.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {getRoleBadge(user.role)}
                                            </td>
                                            <td className="px-6 py-4">
                                                {getStatusBadge(user)}
                                            </td>
                                            <td className="px-6 py-4">
                                                {getVerificationBadge(user)}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-400">
                                                {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleViewActivity(user)}
                                                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
                                                        title="View Activity"
                                                    >
                                                        <Activity className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => openUserModal(user)}
                                                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
                                                        title="Manage User"
                                                    >
                                                        <UserCog className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700/50">
                            <div className="text-sm text-gray-400">
                                Showing {indexOfFirstUser + 1} to {Math.min(indexOfLastUser, filteredUsers.length)} of {filteredUsers.length} users
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let pageNum;
                                    if (totalPages <= 5) {
                                        pageNum = i + 1;
                                    } else if (currentPage <= 3) {
                                        pageNum = i + 1;
                                    } else if (currentPage >= totalPages - 2) {
                                        pageNum = totalPages - 4 + i;
                                    } else {
                                        pageNum = currentPage - 2 + i;
                                    }
                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setCurrentPage(pageNum)}
                                            className={`px-3 py-1 rounded-lg transition-colors ${
                                                currentPage === pageNum
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'text-gray-400 hover:bg-gray-700/50'
                                            }`}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* User Management Modal */}
            {showUserModal && selectedUser && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-xl max-w-lg w-full border border-gray-700 shadow-2xl">
                        <div className="p-6 border-b border-gray-700">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-semibold text-white">Manage User</h3>
                                <button
                                    onClick={() => setShowUserModal(false)}
                                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            {/* User Info */}
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                                    {selectedUser.username?.charAt(0).toUpperCase() || 'U'}
                                </div>
                                <div>
                                    <h4 className="text-lg font-semibold text-white">{selectedUser.username}</h4>
                                    <p className="text-gray-400">{selectedUser.email}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        {getRoleBadge(selectedUser.role)}
                                        {getStatusBadge(selectedUser)}
                                        {getVerificationBadge(selectedUser)}
                                    </div>
                                </div>
                            </div>

                            {/* User Details */}
                            <div className="bg-gray-700/30 rounded-lg p-4 space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">User ID</span>
                                    <span className="text-white font-mono">{selectedUser.id}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Joined</span>
                                    <span className="text-white">{selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleString() : 'N/A'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Last Updated</span>
                                    <span className="text-white">{selectedUser.updatedAt ? new Date(selectedUser.updatedAt).toLocaleString() : 'N/A'}</span>
                                </div>
                            </div>

                            {/* Role Management */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Change Role
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleRoleChange(selectedUser.id, 'User')}
                                        disabled={actionLoading || selectedUser.role === 'User'}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-colors ${
                                            selectedUser.role === 'User'
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                                        } disabled:opacity-50`}
                                    >
                                        <Shield className="w-4 h-4" />
                                        User
                                    </button>
                                    <button
                                        onClick={() => handleRoleChange(selectedUser.id, 'Admin')}
                                        disabled={actionLoading || selectedUser.role === 'Admin'}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-colors ${
                                            selectedUser.role === 'Admin'
                                                ? 'bg-purple-600 text-white'
                                                : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                                        } disabled:opacity-50`}
                                    >
                                        <ShieldCheck className="w-4 h-4" />
                                        Admin
                                    </button>
                                </div>
                            </div>

                            {/* Account Actions */}
                            <div className="flex gap-3">
                                {selectedUser.isSuspended ? (
                                    <button
                                        onClick={() => handleActivateUser(selectedUser.id)}
                                        disabled={actionLoading}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-500 disabled:opacity-50 transition-colors"
                                    >
                                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                        Activate Account
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleSuspendUser(selectedUser.id)}
                                        disabled={actionLoading}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors"
                                    >
                                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                                        Suspend Account
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowDeleteModal(true)}
                                    disabled={actionLoading}
                                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Activity Modal */}
            {showActivityModal && selectedUser && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col border border-gray-700 shadow-2xl">
                        <div className="p-6 border-b border-gray-700 flex-shrink-0">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                                        <Activity className="w-5 h-5 text-indigo-400" />
                                        User Activity
                                    </h3>
                                    <p className="text-gray-400 text-sm mt-1">{selectedUser.username}</p>
                                </div>
                                <button
                                    onClick={() => setShowActivityModal(false)}
                                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1">
                            {loadingActivity ? (
                                <div className="text-center py-8">
                                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-2" />
                                    <p className="text-gray-400">Loading activity...</p>
                                </div>
                            ) : userActivity.length === 0 ? (
                                <div className="text-center py-8 text-gray-400">
                                    No activity recorded for this user
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {userActivity.map((activity, index) => (
                                        <div key={index} className="bg-gray-700/30 rounded-lg p-4">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <span className="text-sm font-medium text-white">{activity.action}</span>
                                                    <p className="text-xs text-gray-400 mt-1">
                                                        {activity.entityType && `${activity.entityType} #${activity.entityId}`}
                                                    </p>
                                                </div>
                                                <span className="text-xs text-gray-500">
                                                    {new Date(activity.createdAt).toLocaleString()}
                                                </span>
                                            </div>
                                            {activity.details && (
                                                <pre className="mt-2 text-xs text-gray-400 bg-gray-900/50 p-2 rounded overflow-x-auto">
                                                    {typeof activity.details === 'string' 
                                                        ? activity.details 
                                                        : JSON.stringify(activity.details, null, 2)}
                                                </pre>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && selectedUser && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
                    <div className="bg-gray-800 rounded-xl max-w-md w-full border border-gray-700 shadow-2xl">
                        <div className="p-6 border-b border-gray-700">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-red-500/20 rounded-full">
                                    <AlertTriangle className="w-6 h-6 text-red-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-semibold text-white">Delete User</h3>
                                    <p className="text-sm text-gray-400">This action cannot be undone</p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-6">
                            <p className="text-gray-300 mb-4">
                                Are you sure you want to permanently delete the user <strong className="text-white">{selectedUser.username}</strong>?
                            </p>
                            <p className="text-sm text-gray-400 mb-6">
                                All user data including profile, disputes, and activity logs will be removed.
                            </p>
                            
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowDeleteModal(false)}
                                    className="flex-1 px-4 py-2.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteUser}
                                    disabled={actionLoading}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 transition-colors"
                                >
                                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    Delete User
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
