// client/src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Auth from './pages/Auth';
import Layout from './components/Layout';
import Home from './pages/Home';
import ChatWindow from './components/ChatWindow';

import './App.module.css';

function App() {
  const { user, loading } = useAuth();

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

        <Route element={user ? <Layout /> : <Navigate to="/auth" replace />}>
          {/* Default home route inside the layout - could be a welcome or user profile view */}
          <Route path="/home" element={<Home />} />
          {/* Nested route for direct messages with a specific user */}
          <Route path="/home/chat/:userId" element={<ChatWindow />} />
          {/* NEW: Nested route for channel messages with a specific channel */}
          <Route path="/home/channel/:channelId" element={<ChatWindow />} />
          {/* Default redirect when logged in, if no specific sub-route is hit */}
          <Route path="/" element={<Navigate to="/home" replace />} />
        </Route>

        <Route path="*" element={<Navigate to={user ? "/home" : "/auth"} replace />} />
      </Routes>
    </div>
  );
}

export default App;
