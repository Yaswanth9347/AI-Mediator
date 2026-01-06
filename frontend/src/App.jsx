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
import PaymentSuccess from './components/PaymentSuccess';
import { Toaster } from 'react-hot-toast';
import { Scale, LogOut, User, LayoutDashboard, FilePlus, ShieldCheck, Settings, Users } from 'lucide-react';
import { SocketProvider } from './context/SocketContext';
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

function Navbar() {
  const navigate = useNavigate();
  const username = localStorage.getItem('username');
  const role = localStorage.getItem('role');
  const isAdmin = role === 'Admin';

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
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
            <div className="hidden md:ml-8 md:flex md:space-x-8">
              <Link to="/dashboard" className="flex items-center gap-1 text-gray-500 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">
                <LayoutDashboard className="w-4 h-4" /> Dashboard
              </Link>
              <Link to="/new" className="flex items-center gap-1 text-gray-500 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">
                <FilePlus className="w-4 h-4" /> New Dispute
              </Link>
              {isAdmin && (
                <Link to="/admin/users" className="flex items-center gap-1 text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 px-3 py-2 rounded-md text-sm font-medium transition-colors">
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

function AppContent() {
  const location = useLocation();
  const isLoggedIn = !!localStorage.getItem('token');

  // Show Navbar only on authenticated pages (exclude root, login, forgot-password, and reset-password)
  const isPublicPage = ['/', '/login', '/forgot-password'].includes(location.pathname) || 
                       location.pathname.startsWith('/reset-password');
  const showNavbar = isLoggedIn && !isPublicPage;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans text-gray-900 dark:text-gray-100 transition-colors duration-200 flex flex-col">
      {showNavbar && <Navbar />}

      <main className={`flex-grow ${showNavbar ? 'max-w-7xl mx-auto w-full py-6 px-4 sm:px-6 lg:px-8' : ''}`}>
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
            <ProtectedRoute>
              <NewDispute />
            </ProtectedRoute>
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
