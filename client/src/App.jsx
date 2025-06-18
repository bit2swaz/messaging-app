    // client/src/App.jsx
    import React, { useEffect } from 'react';
    import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
    import { AuthProvider, useAuth } from './context/AuthContext';
    import Auth from './pages/Auth';
    import MainLayout from './components/MainLayout';
    import './App.css'; // Global CSS

    const AppContent = () => {
      const { user, loading } = useAuth();
      const navigate = useNavigate();
      const location = useLocation();

      // --- CRITICAL DEBUG LOG ---
      useEffect(() => {
        console.log('App.jsx: VITE_API_BASE_URL (from import.meta.env):', import.meta.env.VITE_API_BASE_URL);
      }, []);
      // --- END CRITICAL DEBUG LOG ---


      useEffect(() => {
        console.log('App.jsx: Auth state changed. User:', user ? user.id : 'null', 'Loading:', loading, 'Path:', location.pathname);

        if (loading) {
          // Still loading auth state, do nothing yet
          return;
        }

        if (user) {
          // User is logged in
          if (location.pathname === '/' || location.pathname === '/auth') {
            console.log('App.jsx: User logged in, redirecting to /home');
            navigate('/home');
          }
        } else {
          // User is NOT logged in
          if (location.pathname !== '/' && location.pathname !== '/auth') {
            console.log('App.jsx: User not logged in, redirecting to /');
            navigate('/');
          }
        }
      }, [user, loading, navigate, location.pathname]);

      return (
        <Routes>
          <Route path="/" element={<Auth />} />
          <Route path="/auth" element={<Auth />} />
          {user ? (
            <Route path="/home/*" element={<MainLayout />} />
          ) : (
            // Redirect any /home access when not logged in to Auth page
            <Route path="/home/*" element={<Auth />} />
          )}
        </Routes>
      );
    };

    function App() {
      return (
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      );
    }

    export default App;
    