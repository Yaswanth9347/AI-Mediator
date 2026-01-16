import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import Dashboard from './pages/Dashboard';
import NewDispute from './pages/NewDispute';
import DisputeDetail from './pages/DisputeDetail';
import Login from './pages/Login';
import LandingPage from './pages/LandingPage';
import Profile from './pages/Profile';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import EmailVerification from './pages/EmailVerification';
import AdminUsers from './pages/AdminUsers';
import AdminDashboard from './pages/AdminDashboard';
import PaymentSuccess from './components/PaymentSuccess';
import ConnectionStatus from './components/ConnectionStatus';
import { Toaster } from 'react-hot-toast';
import { Scale, LogOut, User, LayoutDashboard, FilePlus, ShieldCheck, Settings, Users, BarChart3 } from 'lucide-react';
import { SocketProvider, useSocket } from './context/SocketContext';
import ErrorBoundary from './components/ErrorBoundary';
import NotificationBell from './components/NotificationBell';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token) {
    return <Navigate to="/login" />;
  }

  if (role !== 'Admin') {
    return <Navigate to="/dashboard" />;
  }

  return children;
}

// Route guard to prevent admins from filing disputes
function UserOnlyRoute({ children }) {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token) {
    return <Navigate to="/login" />;
  }

  // Admins cannot file disputes, redirect them to dashboard
  if (role === 'Admin') {
    return <Navigate to="/dashboard" />;
  }

  return children;
}

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const username = localStorage.getItem('username');
  const role = localStorage.getItem('role');
  const isAdmin = role === 'Admin';

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  // Helper to check if link is active
  const isActive = (path) => location.pathname === path;

  // Active and inactive link classes
  const getLinkClass = (path) => {
    const baseClass = "flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors";
    if (isActive(path)) {
      return `${baseClass} text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30`;
    }
    return `${baseClass} text-gray-500 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-white`;
  };

  return (
    <nav className="bg-white dark:bg-gray-800 shadow-md transform transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/dashboard" className="flex-shrink-0 flex items-center gap-2 font-bold text-xl text-indigo-600 dark:text-indigo-400">
              <Scale className="w-8 h-8" />
              <span>AI Mediator</span>
            </Link>
            <div className="hidden md:ml-8 md:flex md:space-x-4">
              <Link to="/dashboard" className={getLinkClass('/dashboard')}>
                <LayoutDashboard className="w-4 h-4" /> Dashboard
              </Link>
              {!isAdmin && (
                <Link to="/new" className={getLinkClass('/new')}>
                  <FilePlus className="w-4 h-4" /> New Dispute
                </Link>
              )}
              {isAdmin && (
                <Link to="/admin" className={getLinkClass('/admin')}>
                  <BarChart3 className="w-4 h-4" /> Admin Panel
                </Link>
              )}
              {isAdmin && (
                <Link to="/admin/users" className={getLinkClass('/admin/users')}>
                  <Users className="w-4 h-4" /> Manage Users
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
            <Link
              to="/profile"
              className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-3 py-1.5 rounded-full transition-colors"
            >
              <User className="w-4 h-4" />
              <span>{username}</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

// Connection status wrapper component
function ConnectionStatusWrapper() {
  const { connected, reconnecting } = useSocket();
  return <ConnectionStatus connected={connected} reconnecting={reconnecting} />;
}

function AppContent() {
  const location = useLocation();
  const isLoggedIn = !!localStorage.getItem('token');

  // Show Navbar only on authenticated pages (exclude root, login, forgot-password, and reset-password)
  const isPublicPage = ['/', '/login', '/forgot-password'].includes(location.pathname) ||
    location.pathname.startsWith('/reset-password');
  const showNavbar = isLoggedIn && !isPublicPage;

  // Determine background class based on page type
  const getBackgroundClass = () => {
    if (isPublicPage) {
      return 'bg-gray-50 dark:bg-gray-900'; // Public pages keep their own backgrounds
    }
    // Authenticated pages use unified dark gradient
    return 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900';
  };

  return (
    <div className={`min-h-screen ${getBackgroundClass()} font-sans text-gray-900 dark:text-gray-100 transition-colors duration-200 flex flex-col`}>
      {showNavbar && <Navbar />}
      {showNavbar && <ConnectionStatusWrapper />}

      <main className={`flex-grow flex flex-col ${showNavbar ? '' : ''}`}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/verify-email/:token" element={<EmailVerification />} />

          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/new" element={
            <UserOnlyRoute>
              <NewDispute />
            </UserOnlyRoute>
          } />
          <Route path="/disputes/:id" element={
            <ProtectedRoute>
              <DisputeDetail />
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } />

          {/* Payment Success Route */}
          <Route path="/payment/success" element={
            <ProtectedRoute>
              <PaymentSuccess />
            </ProtectedRoute>
          } />

          {/* Admin Routes */}
          <Route path="/admin" element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          } />
          <Route path="/admin/users" element={
            <AdminRoute>
              <AdminUsers />
            </AdminRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      <Toaster position="top-right" />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Sentry.ErrorBoundary fallback={<div>An error has occurred</div>} showDialog>
        <BrowserRouter>
          <SocketProvider>
            <AppContent />
          </SocketProvider>
        </BrowserRouter>
      </Sentry.ErrorBoundary>
    </ErrorBoundary>
  );
}

export default App;
