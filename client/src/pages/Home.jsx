// client/src/pages/Home.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; // Import useAuth hook
import styles from './Home.module.css'; // Import CSS Module

const Home = () => {
  const { user, loading, supabase } = useAuth(); // Get user, loading, and supabase client from AuthContext
  const [profile, setProfile] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect if not authenticated and not loading
    if (!loading && !user) {
      navigate('/auth');
    }

    // Fetch user profile when user object is available
    const fetchProfile = async () => {
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('username, avatar_url, status')
          .eq('id', user.id)
          .single(); // Use .single() to get a single row

        if (error) {
          console.error('Error fetching profile:', error.message);
          setFetchError('Failed to load profile.');
        } else if (data) {
          setProfile(data);
        }
      }
    };

    fetchProfile();
  }, [user, loading, navigate, supabase]); // Add supabase to dependencies

  const handleLogout = async () => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No need to send token for Supabase's client-side logout
          // as it clears it internally. Our backend /logout also clears it.
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Logout failed');
      }

      // Supabase's onAuthStateChange listener in AuthContext will handle setting user to null
      // and redirecting to /auth automatically after signOut from the backend.
      localStorage.removeItem('supabase.auth.token'); // Clear token explicitly from localStorage

    } catch (error) {
      console.error('Logout error:', error.message);
      setFetchError(`Logout failed: ${error.message}`);
    }
  };

  if (loading) {
    return <div className={styles.homeContainer}>Loading...</div>;
  }

  return (
    <div className={styles.homeContainer}>
      <h1 className={styles.welcomeHeader}>Welcome, {profile ? profile.username : user?.email}!</h1>
      {fetchError && <p className={styles.errorMessage}>{fetchError}</p>}
      {profile ? (
        <div className={styles.profileInfo}>
          <p>Email: {user.email}</p>
          <p>Username: {profile.username}</p>
          <p>Status: {profile.status}</p>
          {profile.avatar_url && (
            <img src={profile.avatar_url} alt="Profile Avatar" className={styles.avatar} />
          )}
        </div>
      ) : (
        <p>Loading profile details...</p>
      )}
      <button onClick={handleLogout} className={styles.logoutButton}>Logout</button>
    </div>
  );
};

export default Home;
