// client/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js'; // <-- FIX IS HERE

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
    console.log('AuthContext: Custom signIn called. User state set to:', userData.id);
  }, []);

  useEffect(() => {
    console.log('AuthContext: useEffect triggered. (Runs only once on mount).');
    // We explicitly call getInitialSession only once
    // And set up the auth state change listener once.

    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('AuthContext: getSession Error:', error.message);
          setUser(null);
        } else if (session) {
          setUser(session.user);
          console.log('AuthContext: Initial session found. User:', session.user.id);
        } else {
          setUser(null);
          console.log('AuthContext: No initial session found.');
        }
      } catch (err) {
        console.error('AuthContext: getInitialSession catch error:', err.message);
        setUser(null);
      } finally {
        setLoading(false);
        console.log('AuthContext: Initial loading state resolved. User:', user ? user.id : 'None', 'Loading:', false);
      }
    };

    getInitialSession();

    // Setup listener for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('AuthContext: onAuthStateChange event:', event, 'Session:', session ? session.user?.id : 'None');
        if (event === 'SIGNED_IN') {
          setUser(session.user);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
        setLoading(false); // Ensure loading is false after any auth change event
        console.log('AuthContext: State updated by onAuthStateChange. Current user:', session ? session.user?.id : 'None');
      }
    );

    // Return cleanup function to unsubscribe the listener when component unmounts
    return () => {
      authListener.subscription.unsubscribe();
      console.log('AuthContext: Auth listener unsubscribed (cleanup).');
    };

  }, []); // <-- EMPTY DEPENDENCY ARRAY: This makes useEffect run ONLY ONCE on mount

  const value = {
    user,
    loading,
    supabase,
    signIn,
  };

  console.log('AuthContext: Component render cycle. Current user in state:', user ? user.id : 'None', 'Loading state:', loading);

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
