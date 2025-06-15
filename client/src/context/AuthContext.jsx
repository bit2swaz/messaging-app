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

  // Function to explicitly sign in a user within the context
  const signIn = useCallback((userData) => {
    setUser(userData);
    console.log('AuthContext: signIn function called. User set:', userData.id);
  }, []);

  useEffect(() => {
    console.log('AuthContext: Initializing session check...');
    const getSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        console.log('AuthContext: User session found:', session.user.id);
      } else if (error) {
        console.error('AuthContext: Error getting session:', error.message);
      }
      setLoading(false);
      console.log('AuthContext: Initial loading check complete. User:', session ? session.user.id : 'None');
    };

    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('AuthContext: Auth state change event:', event, 'Session:', session);
        if (event === 'SIGNED_IN') {
          // This will be triggered by Supabase internal session setting
          // We already handle it via our custom signIn function for our backend flow
          // but this ensures consistency if other Supabase methods are used.
          setUser(session.user);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
      console.log('AuthContext: Auth listener unsubscribed.');
    };
  }, []);

  const value = {
    user,
    loading,
    supabase,
    signIn, // Expose the signIn function
  };

  console.log('AuthContext: Rendering with user:', user ? user.id : 'None', 'loading:', loading);

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
