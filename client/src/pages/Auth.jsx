// client/src/pages/Auth.jsx
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import styles from './Auth.module.css';

const Auth = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const { user, signIn, supabase } = useAuth(); // Destructure supabase client here

  // We explicitly removed the useEffect for navigation here.
  // App.jsx is now the sole component handling redirection based on the 'user' context.

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

    console.log('Auth.jsx: Submitting form. Type:', isRegister ? 'Register' : 'Login', 'Email:', email);

    try {
      const endpoint = isRegister ? `${API_BASE_URL}/auth/register` : `${API_BASE_URL}/auth/login`;
      const body = isRegister ? { email, password, username } : { email, password };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      console.log('Auth.jsx: Fetch response received. Status:', response.status, 'OK:', response.ok);

      const data = await response.json();

      console.log('Auth.jsx: Response data:', data);

      if (!response.ok) {
        const errorMessage = data.error || 'Something went wrong on the server.';
        console.error('Auth.jsx: Backend error response:', errorMessage);
        throw new Error(errorMessage);
      }

      setMessage(data.message);
      console.log('Auth.jsx: Success message received:', data.message);

      if (!isRegister && data.session) { // CRITICAL: Check for data.session
        console.log('Auth.jsx: Login successful. Attempting to set Supabase session explicitly.');
        // Set the full session object explicitly for the Supabase client
        // This is the most reliable way to ensure the client is aware of the session.
        const { error: sessionSetError } = await supabase.auth.setSession(data.session);

        if (sessionSetError) {
          console.error('Auth.jsx: Error setting Supabase session explicitly:', sessionSetError.message);
          setError(`Login successful, but session setup failed: ${sessionSetError.message}`);
          return; // Stop here if session setup fails
        }

        // After setSession, onAuthStateChange in AuthContext will be triggered
        // and handle setting the user, which App.jsx will react to for navigation.
        // We can still call signIn here for immediate UI update in case onAuthStateChange is slightly delayed.
        signIn(data.user); // data.user is also returned for convenience
        console.log('Auth.jsx: Supabase session explicitly set. AuthContext updated.');

      } else if (isRegister) {
        console.log('Auth.jsx: Registration success. User needs to login.');
        setIsRegister(false); // Switch to login form
        setEmail(''); // Clear inputs for fresh login
        setPassword('');
        setUsername('');
      } else {
        console.warn('Auth.jsx: Login response missing session or not register flow:', data);
        setError('Login successful, but no session received. Please try again or contact support.');
      }

    } catch (err) {
      console.error('Auth.jsx: Auth error in catch block:', err.message);
      setError(err.message);
    } finally {
      setPassword('');
      if (isRegister) setUsername('');
    }
  };

  return (
    <div className={styles.authContainer}>
      <div className={styles.authBox}>
        <h1>{isRegister ? 'Register' : 'Login'}</h1>
        {error && <p className={styles.errorMessage}>{error}</p>}
        {message && <p className={styles.successMessage}>{message}</p>}
        <form onSubmit={handleSubmit} className={styles.authForm}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {isRegister && (
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          )}
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">{isRegister ? 'Register' : 'Login'}</button>
        </form>
        <p className={styles.toggleText}>
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <span onClick={() => setIsRegister(!isRegister)} className={styles.toggleLink}>
            {isRegister ? 'Login here' : 'Register here'}
          </span>
        </p>
      </div>
    </div>
  );
};

export default Auth;
