// client/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Removed verbose client init logs, assuming .env values are now verified.
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('AuthContext: ERROR! Supabase URL or Anon Key are NOT DEFINED. Realtime WILL FAIL!');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
// Removed client instance creation log, assuming it's now fine.


const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const signIn = useCallback((userData) => {
    setUser(userData);
    console.log('AuthContext: Custom signIn called. User state set:', userData ? userData.id : 'None');
  }, []);

  useEffect(() => {
    console.log('AuthContext: useEffect (auth listener setup) triggered. Runs once.');

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log(`AuthContext: onAuthStateChange event: ${event}. Session User ID: ${session ? session.user?.id : 'None'}.`);

        if (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && session)) {
          setUser(session.user);
          console.log('AuthContext: User SIGNED_IN/INITIAL_SESSION. User ID:', session.user.id);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          console.log('AuthContext: User SIGNED_OUT.');
        } else if (event === 'TOKEN_REFRESHED' && session) {
          setUser(session.user);
          console.log('AuthContext: TOKEN_REFRESHED. User ID:', session.user.id);
        } else {
          setUser(null);
          console.log('AuthContext: Other event or no session. User set to null.');
        }
        setLoading(false);
        console.log('AuthContext: Loading set to false. Current user (after event):', user ? user.id : 'None');
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
      console.log('AuthContext: Auth listener unsubscribed during cleanup.');
    };
  }, []); // Empty dependency array: ensures this effect runs ONLY ONCE on mount

  console.log('AuthContext: AuthProvider RENDER CYCLE. User State:', user ? user.id : 'None', 'Loading State:', loading);

  const value = {
    user,
    loading,
    supabase,
    signIn,
  };

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
