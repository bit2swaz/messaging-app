// client/src/components/Layout.jsx
import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import UserList from './UserList'; // Import UserList
import styles from './Layout.module.css';

const Layout = () => {
  const { user, loading, supabase, signOut } = useAuth();
  const navigate = useNavigate();

  if (!loading && !user) {
    navigate('/auth');
    return null;
  }

  if (loading) {
    return <div className={styles.loadingScreen}>Loading application layout...</div>;
  }

  const handleLogout = async () => {
    try {
      // Use the custom signOut function from AuthContext instead of direct supabase call
      // This ensures proper cleanup of realtime connections
      const { error } = await signOut();
      if (error) {
        console.error('Layout: Logout error:', error.message);
      } else {
        console.log('Layout: Logged out successfully with proper cleanup');
        // No need to navigate here, AuthContext will handle it
      }
    } catch (error) {
      console.error('Layout: Logout error:', error.message);
    }
  };

  return (
    <div className={styles.appLayout}>
      {/* Left Sidebar: Users/Channels List */}
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
          {/* UserList component goes here */}
          <UserList />
          {/* We'll add ChannelList here later in Phase 4 */}
        </nav>
      </aside>

      {/* Main Content Area: Where chat or other features will render */}
      <main className={styles.mainContent}>
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
