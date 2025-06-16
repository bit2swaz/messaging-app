// client/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// THESE ARE THE CRUCIAL LOGS TO VERIFY ENVIRONMENT VARIABLES.
// ENSURE THESE ARE AT THE VERY TOP OF THE FILE, OUTSIDE ANY COMPONENT.
console.log('--- AuthContext.jsx Initialization START (V2 DEBUG) ---');
console.log('V2 DEBUG: VITE_SUPABASE_URL received:', supabaseUrl);
console.log('V2 DEBUG: VITE_SUPABASE_ANON_KEY received (first 5 chars):', supabaseAnonKey ? supabaseAnonKey.substring(0, 5) + '...' : 'None');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('V2 DEBUG: ERROR! Supabase URL or Anon Key are NOT DEFINED. Realtime will likely fail!');
} else {
  console.log('V2 DEBUG: Supabase URL and Anon Key appear to be defined.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
console.log('V2 DEBUG: Supabase client instance created. Realtime services should be available.');
console.log('--- AuthContext.jsx Initialization END (V2 DEBUG) ---');


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

        if (event === 'SIGNED_IN') {
          setUser(session.user);
          console.log('AuthContext: User SIGNED_IN. User ID:', session.user.id);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          console.log('AuthContext: User SIGNED_OUT.');
        } else if (event === 'INITIAL_SESSION' && session) {
          setUser(session.user);
          console.log('AuthContext: INITIAL_SESSION found. User ID:', session.user.id);
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
