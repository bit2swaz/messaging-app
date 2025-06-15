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
    console.log('AuthContext: Custom signIn called. User state set to:', userData.id);
  }, []);

  useEffect(() => {
    console.log('AuthContext: useEffect triggered. Starting session check...');
    let authListenerSubscription = null; // To hold the subscription object

    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('AuthContext: getSession Error:', error.message);
          setUser(null); // Ensure user is null on error
        } else if (session) {
          setUser(session.user);
          console.log('AuthContext: Initial session found. User:', session.user.id);
        } else {
          setUser(null); // No session found
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
    supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('AuthContext: onAuthStateChange event:', event, 'Session:', session ? session.user?.id : 'None');
        if (event === 'SIGNED_IN') {
          setUser(session.user);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        } else if (event === 'INITIAL_SESSION' && session) {
          // This event is often fired immediately after getSession, can be redundant with above
          setUser(session.user);
        } else if (event === 'TOKEN_REFRESHED' && session) {
          setUser(session.user);
        }
        // Ensure loading is false after any auth change event
        setLoading(false);
        console.log('AuthContext: State updated by onAuthStateChange. User:', user ? user.id : 'None', 'Loading:', false);
      }
    );

    // No need to explicitly return authListener.subscription.unsubscribe() here
    // unless you want to cleanup a specific subscription object which is not directly returned by onAuthStateChange
    // The listener persists for the lifecycle of the client

    // Return a cleanup function for the useEffect
    return () => {
      // If you had a specific subscription reference, you'd unsubscribe here.
      // For onAuthStateChange, the listener is typically managed by Supabase client
      // for the lifetime of the client, but if we get a direct subscription object
      // (as in old versions or specific setups), we would unsubscribe.
      // For now, no explicit cleanup needed here unless issues arise.
    };

  }, [user]); // Keep user in dependency array for its own log in render function. Remove if it causes re-renders.

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
