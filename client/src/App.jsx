// client/src/App.jsx
import React, { useEffect } from 'react'; // Added useEffect import
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'; // Added useLocation import
import { useAuth } from './context/AuthContext';
import Auth from './pages/Auth';
import Layout from './components/Layout'; // Assuming Layout is your MainLayout
import Home from './pages/Home'; // Assuming Home is your default authenticated route
import ChatWindow from './components/ChatWindow';

import './App.module.css'; // Global CSS

function App() {
  const { user, loading } = useAuth();
  const location = useLocation(); // To use for conditional logging

  // --- CRITICAL DEBUG LOG ---
  // This will log the actual value of VITE_API_BASE_URL in your deployed app's console.
  useEffect(() => {
    console.log('App.jsx (Client-Side): VITE_API_BASE_URL (from import.meta.env):', import.meta.env.VITE_API_BASE_URL);
  }, []);
  // --- END CRITICAL DEBUG LOG ---

  console.log('App.jsx: Rendering App. User:', user ? user.id : 'None', 'Loading:', loading);

  if (loading) {
    console.log('App.jsx: Showing loading container.');
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        width: '100%',
        backgroundColor: '#36393F',
        color: '#DCDEE1',
        fontSize: '1.5em'
      }}>
        Loading application...
      </div>
    );
  }

  console.log('App.jsx: Auth check complete. User exists:', !!user);

  return (
    <div className="app-container">
      <Routes>
        <Route path="/auth" element={user ? <Navigate to="/home" replace /> : <Auth />} />

        {/* This <Layout> route and its children should be the main area for logged-in users */}
        {/* If you proceed with DM-only, 'Home' and 'channel' routes should be removed or simplified. */}
        <Route element={user ? <Layout /> : <Navigate to="/auth" replace />}>
          {/* Default home route inside the layout - could be a welcome or user profile view */}
          <Route path="/home" element={<Home />} />
          {/* Nested route for direct messages with a specific user */}
          <Route path="/home/chat/:userId" element={<ChatWindow />} />
          {/* NEW: Nested route for channel messages with a specific channel - REMOVE FOR DM-ONLY */}
          <Route path="/home/channel/:channelId" element={<ChatWindow />} />
          {/* Default redirect when logged in, if no specific sub-route is hit */}
          <Route path="/" element={<Navigate to="/home" replace />} />
        </Route>

        {/* Catch-all route for any undefined paths */}
        <Route path="*" element={<Navigate to={user ? "/home" : "/auth"} replace />} />
      </Routes>
    </div>
  );
}

export default App;
