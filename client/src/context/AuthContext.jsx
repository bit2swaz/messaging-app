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

  const signIn = useCallback((userData) => {
    setUser(userData);
    console.log('AuthContext: Custom signIn called. User state set to:', userData ? userData.id : 'None');
  }, []);

  useEffect(() => {
    console.log('AuthContext: useEffect triggered (runs once).');
    let authListenerSubscription = null; // To explicitly manage the subscription

    const getInitialSession = async () => {
      console.log('AuthContext: getInitialSession starting...');
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('AuthContext: getSession Error:', error.message);
          setUser(null);
        } else if (session) {
          setUser(session.user);
          console.log('AuthContext: Initial session found. User ID:', session.user.id);
        } else {
          setUser(null);
          console.log('AuthContext: No initial session found.');
        }
      } catch (err) {
        console.error('AuthContext: getInitialSession catch error:', err.message);
        setUser(null);
      } finally {
        setLoading(false);
        console.log('AuthContext: getInitialSession finished. Final loading:', false, 'User:', user ? user.id : 'None'); // Note: 'user' here might be stale
      }
    };

    getInitialSession();

    // Setup listener for auth state changes
    authListenerSubscription = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('AuthContext: onAuthStateChange event:', event, 'Session User ID:', session ? session.user?.id : 'None', 'Timestamp:', new Date().toISOString());
        if (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && session)) {
          setUser(session.user);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        } else if (event === 'TOKEN_REFRESHED' && session) {
          setUser(session.user);
        }
        setLoading(false); // Ensure loading is false after any auth change event
        console.log('AuthContext: State updated by onAuthStateChange. Current user:', session ? session.user?.id : 'None');
      }
    ).data.subscription; // Store the subscription object

    // Return cleanup function to unsubscribe the listener when component unmounts
    return () => {
      if (authListenerSubscription) {
        authListenerSubscription.unsubscribe();
        console.log('AuthContext: Auth listener unsubscribed (cleanup).');
      }
    };

  }, []); // EMPTY DEPENDENCY ARRAY: This makes useEffect run ONLY ONCE on mount

  // Log on every render cycle of AuthProvider
  console.log('AuthContext: AuthProvider RENDERING. Current user state (from useState):', user ? user.id : 'None', 'Loading state:', loading);

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
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
