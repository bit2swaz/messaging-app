// client/src/pages/Home.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Home.module.css';

const Home = () => {
  const { user, loading, supabase, signOut } = useAuth();
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
          .single();

        if (error) {
          console.error('Error fetching profile:', error.message);
          setFetchError('Failed to load profile.');
        } else if (data) {
          setProfile(data);
        }
      }
    };

    fetchProfile();
  }, [user, loading, navigate, supabase]);

  const handleLogout = async () => {
    setFetchError(null); // Clear any previous error messages
    try {
      // Use the custom signOut function from AuthContext instead of direct supabase call
      // This ensures proper cleanup of realtime connections
      const { error } = await signOut();

      if (error) {
        console.error('Home: Logout Error:', error.message);
        setFetchError(`Logout failed: ${error.message}`);
      } else {
        // Supabase's onAuthStateChange listener in AuthContext will now detect
        // the SIGNED_OUT event, set user to null, and trigger navigation.
        console.log('Home: Logged out successfully with proper cleanup.');
        // No need to manually removeItem from localStorage as signOut() does this
        // No need to navigate here either, as AuthContext handles it via onAuthStateChange
      }
    } catch (error) {
      console.error('Home: Logout Catch Error:', error.message);
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
