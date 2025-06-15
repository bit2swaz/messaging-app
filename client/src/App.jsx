// client/src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Auth from './pages/Auth';
import Home from './pages/Home';
import styles from './App.module.css';

function App() {
  const { user, loading } = useAuth();

  console.log('App.jsx: Rendering App. User:', user ? user.id : 'None', 'Loading:', loading);

  if (loading) {
    console.log('App.jsx: Showing loading container.');
    return <div className={styles.loadingContainer}>Loading application...</div>;
  }

  console.log('App.jsx: Auth check complete. User exists:', !!user);

  return (
    <div className={styles.appContainer}>
      <Routes>
        <Route path="/auth" element={user ? <Navigate to="/home" replace /> : <Auth />} />
        <Route path="/home" element={user ? <Home /> : <Navigate to="/auth" replace />} />
        <Route path="/" element={user ? <Navigate to="/home" replace /> : <Navigate to="/auth" replace />} />
        <Route path="*" element={<Navigate to={user ? "/home" : "/auth"} replace />} />
      </Routes>
    </div>
  );
}

export default App;
