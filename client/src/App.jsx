// client/src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext'; // Import useAuth hook
import Auth from './pages/Auth';
import Home from './pages/Home';
import styles from './App.module.css'; // Import CSS Module

function App() {
  const { user, loading } = useAuth(); // Get user and loading state from AuthContext

  // Show a loading indicator while auth state is being determined
  if (loading) {
    return <div className={styles.loadingContainer}>Loading application...</div>;
  }

  return (
    <div className={styles.appContainer}>
      <Routes>
        {/* Auth Route: If logged in, redirect to home; otherwise, show Auth component */}
        <Route path="/auth" element={user ? <Navigate to="/home" replace /> : <Auth />} />

        {/* Home Route: If logged out, redirect to auth; otherwise, show Home component */}
        <Route path="/home" element={user ? <Home /> : <Navigate to="/auth" replace />} />

        {/* Root Route: Default redirect based on auth status */}
        <Route path="/" element={user ? <Navigate to="/home" replace /> : <Navigate to="/auth" replace />} />

        {/* Fallback for undefined routes */}
        <Route path="*" element={<Navigate to={user ? "/home" : "/auth"} replace />} />
      </Routes>
    </div>
  );
}

export default App;
