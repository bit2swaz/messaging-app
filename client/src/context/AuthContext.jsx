// client/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Anon Key are not defined in VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // This custom signIn is useful if we want to immediately update context state
  // after our *backend* API call for login, rather than waiting for Supabase's
  // internal onAuthStateChange listener to fire.
  const signIn = useCallback((userData) => {
    setUser(userData);
    console.log('AuthContext: Custom signIn called. User state set:', userData ? userData.id : 'None');
  }, []);

  useEffect(() => {
    console.log('AuthContext: useEffect (auth listener setup) triggered. Runs once.');

    // Listen for authentication state changes from Supabase
    // This is the primary mechanism for getting the session and reacting to changes.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log(`AuthContext: onAuthStateChange event: ${event}. Session: ${session ? session.user?.id : 'None'}.`);

        if (event === 'SIGNED_IN') {
          // User has signed in or session was found on initial load
          setUser(session.user);
          console.log('AuthContext: User SIGNED_IN. User ID:', session.user.id);
        } else if (event === 'SIGNED_OUT') {
          // User has signed out
          setUser(null);
          console.log('AuthContext: User SIGNED_OUT.');
        } else if (event === 'INITIAL_SESSION' && session) {
          // Initial session found when AuthProvider first loads
          setUser(session.user);
          console.log('AuthContext: INITIAL_SESSION found. User ID:', session.user.id);
        } else if (event === 'TOKEN_REFRESHED' && session) {
          // Session token refreshed
          setUser(session.user);
          console.log('AuthContext: TOKEN_REFRESHED. User ID:', session.user.id);
        } else {
          // Other events or initial session with no user
          setUser(null);
          console.log('AuthContext: Other event or no session. User set to null.');
        }
        setLoading(false); // Once an auth state is determined, loading is complete.
        console.log('AuthContext: Loading set to false. Current user (after event):', user ? user.id : 'None');
      }
    );

    // Clean up the listener when the component unmounts
    return () => {
      authListener.subscription.unsubscribe();
      console.log('AuthContext: Auth listener unsubscribed during cleanup.');
    };
  }, []); // Empty dependency array: ensures this effect runs ONLY ONCE on mount

  // This log runs on every render of AuthProvider
  console.log('AuthContext: AuthProvider RENDER CYCLE. User State:', user ? user.id : 'None', 'Loading State:', loading);

  const value = {
    user,
    loading,
    supabase,
    signIn,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children} {/* Render children only when auth state is determined */}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
