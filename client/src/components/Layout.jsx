// client/src/components/Layout.jsx
import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom'; // Outlet for nested routes
import { useAuth } from '../context/AuthContext';
import styles from './Layout.module.css'; // For Layout specific styles

const Layout = () => {
  const { user, loading, supabase } = useAuth();
  const navigate = useNavigate();

  // Redirect if not authenticated (should be handled by App.jsx, but good as a fallback)
  if (!loading && !user) {
    navigate('/auth');
    return null; // Don't render anything if redirecting
  }

  // Show loading state if auth check is still in progress
  if (loading) {
    return <div className={styles.loadingScreen}>Loading application layout...</div>;
  }

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout Error:', error.message);
        // Optionally display an error message to the user
      } else {
        console.log('User logged out successfully.');
        // AuthContext will handle setting user to null and App.jsx will redirect
      }
    } catch (err) {
      console.error('Caught logout error:', err.message);
    }
  };

  return (
    <div className={styles.appLayout}>
      {/* Left Sidebar: Placeholder for Users/Channels List */}
      <aside className={styles.sidebar}>
        <div className={styles.userSection}>
          <img
            src={user?.user_metadata?.avatar_url || `https://placehold.co/40x40/5865F2/FFFFFF?text=${user?.email ? user.email[0].toUpperCase() : '?'}`}
            alt="User Avatar"
            className={styles.avatar}
          />
          <span className={styles.username}>{user?.user_metadata?.username || user?.email}</span>
          <button onClick={handleLogout} className={styles.logoutButton}>Logout</button>
        </div>
        <nav className={styles.navigation}>
          {/* We'll add links to DMs and Channels here later */}
          <ul className={styles.navList}>
            <li>Direct Messages</li>
            {/* Direct message users will go here */}
            <li>Channels</li>
            {/* Channel list will go here */}
          </ul>
        </nav>
      </aside>

      {/* Main Content Area: Where chat or other features will render */}
      <main className={styles.mainContent}>
        <Outlet /> {/* This is where nested routes (like specific chats) will render */}
      </main>
    </div>
  );
};

export default Layout;
