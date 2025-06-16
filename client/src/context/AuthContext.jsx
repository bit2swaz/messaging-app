// client/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// THESE ARE THE CRUCIAL LOGS TO VERIFY ENVIRONMENT VARIABLES
console.log('--- AuthContext.jsx Initialization START ---');
console.log('VITE_SUPABASE_URL received:', supabaseUrl);
console.log('VITE_SUPABASE_ANON_KEY received (first 5 chars):', supabaseAnonKey ? supabaseAnonKey.substring(0, 5) + '...' : 'None');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('ERROR: Supabase URL or Anon Key are NOT DEFINED. Realtime will likely fail!');
} else {
  console.log('Supabase URL and Anon Key appear to be defined.');
}

// Create the Supabase client with realtime options
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

console.log('Supabase client instance created with enhanced realtime options.');
console.log('--- AuthContext.jsx Initialization END ---');


const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const signIn = useCallback((userData) => {
    setUser(userData);
    console.log('AuthContext: Custom signIn called. User state set:', userData ? userData.id : 'None');
  }, []);
  
  // Custom signOut function that ensures proper cleanup
  const signOut = useCallback(async () => {
    console.log('AuthContext: Custom signOut called. Cleaning up before logout.');
    
    try {
      // Pause all realtime subscriptions before signing out
      // This helps ensure clean disconnection
      supabase.realtime.setAuth(null);
      
      // Perform the actual sign out
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('AuthContext: Error during signOut:', error.message);
        throw error;
      }
      
      console.log('AuthContext: User signed out successfully with cleanup.');
      return { error: null };
    } catch (err) {
      console.error('AuthContext: Caught error during signOut:', err.message);
      return { error: err };
    }
  }, []);

  useEffect(() => {
    console.log('AuthContext: useEffect (auth listener setup) triggered. Runs once.');

    // Function to handle realtime cleanup when user signs out
    const cleanupRealtimeOnSignOut = () => {
      console.log('AuthContext: Cleaning up realtime connections on sign out');
      try {
        // Pause all realtime subscriptions
        supabase.realtime.setAuth(null);
        
        // Disconnect all channels
        supabase.removeAllChannels();
        
        console.log('AuthContext: Realtime connections cleaned up successfully');
      } catch (err) {
        console.error('AuthContext: Error cleaning up realtime connections:', err.message);
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log(`AuthContext: onAuthStateChange event: ${event}. Session User ID: ${session ? session.user?.id : 'None'}.`);

        if (event === 'SIGNED_IN') {
          // Ensure realtime auth is set with the new session
          supabase.realtime.setAuth(session.access_token);
          setUser(session.user);
          console.log('AuthContext: User SIGNED_IN. User ID:', session.user.id);
        } else if (event === 'SIGNED_OUT') {
          // Clean up realtime connections before setting user to null
          cleanupRealtimeOnSignOut();
          setUser(null);
          console.log('AuthContext: User SIGNED_OUT with realtime cleanup.');
        } else if (event === 'INITIAL_SESSION' && session) {
          // Ensure realtime auth is set with the initial session
          supabase.realtime.setAuth(session.access_token);
          setUser(session.user);
          console.log('AuthContext: INITIAL_SESSION found. User ID:', session.user.id);
        } else if (event === 'TOKEN_REFRESHED' && session) {
          // Update realtime auth with the refreshed token
          supabase.realtime.setAuth(session.access_token);
          setUser(session.user);
          console.log('AuthContext: TOKEN_REFRESHED. User ID:', session.user.id);
        } else {
          // For any other event without a session, clean up and set user to null
          cleanupRealtimeOnSignOut();
          setUser(null);
          console.log('AuthContext: Other event or no session. User set to null with cleanup.');
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
    signOut, // Add the custom signOut function to the context
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