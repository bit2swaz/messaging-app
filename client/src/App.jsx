// client/src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Auth from './pages/Auth';
import Layout from './components/Layout'; // Import the new Layout component
import Home from './pages/Home'; // We'll keep Home for now, but it will be wrapped by Layout

import './App.module.css'; // App.module.css styles are still relevant for overall container

function App() {
  const { user, loading } = useAuth();

  console.log('App.jsx: Rendering App. User:', user ? user.id : 'None', 'Loading:', loading);

  if (loading) {
    console.log('App.jsx: Showing loading container.');
    // Using a simple div for loading as it's global to the app
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        width: '100%',
        backgroundColor: '#36393F', // Discord dark background
        color: '#DCDEE1',
        fontSize: '1.5em'
      }}>
        Loading application...
      </div>
    );
  }

  console.log('App.jsx: Auth check complete. User exists:', !!user);

  return (
    // The main app container from App.module.css is still useful here
    <div className="app-container"> {/* Using a generic class name */}
      <Routes>
        {/* Auth Route: If logged in, redirect to home; otherwise, show Auth component */}
        <Route path="/auth" element={user ? <Navigate to="/home" replace /> : <Auth />} />

        {/* Protected routes wrapped by Layout */}
        <Route element={user ? <Layout /> : <Navigate to="/auth" replace />}>
          {/* Default home route inside the layout */}
          <Route path="/home" element={<Home />} />
          {/* Other nested routes for chat rooms, user profiles, etc. will go here later */}
          <Route path="/" element={<Navigate to="/home" replace />} />
        </Route>

        {/* Fallback for any other undefined routes */}
        <Route path="*" element={<Navigate to={user ? "/home" : "/auth"} replace />} />
      </Routes>
    </div>
  );
}

export default App;
