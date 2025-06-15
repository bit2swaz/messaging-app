// client/src/pages/Auth.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Auth.module.css';

const Auth = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Debug log for user state in Auth component
    console.log('Auth.jsx: Current user state in Auth component:', user ? user.id : 'None');
    if (user) {
      navigate('/home');
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

    // Debug log before fetch call
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

      // Debug log after fetch but before parsing JSON
      console.log('Auth.jsx: Fetch response received. Status:', response.status, 'OK:', response.ok);

      const data = await response.json();

      // Debug log for parsed data
      console.log('Auth.jsx: Response data:', data);

      if (!response.ok) {
        // This block handles 4xx or 5xx responses from your Express backend
        const errorMessage = data.error || 'Something went wrong on the server.';
        console.error('Auth.jsx: Backend error response:', errorMessage);
        throw new Error(errorMessage); // Propagate the error to the catch block
      }

      setMessage(data.message);
      console.log('Auth.jsx: Success message received:', data.message);

      if (!isRegister && data.accessToken) {
        // This block executes on successful login
        console.log('Auth.jsx: Login successful. Storing accessToken and navigating.');
        localStorage.setItem('supabase.auth.token', data.accessToken);
        // AuthContext's onAuthStateChange listener will pick this up.
        // The navigate will happen once AuthContext confirms user is signed in.
        navigate('/home');
      } else if (isRegister) {
        console.log('Auth.jsx: Registration success.');
        // For registration, we don't automatically log in; user needs to confirm email and then login.
      } else {
        // This else block would catch a successful HTTP response (200) for login
        // but without an accessToken in the data. This shouldn't happen with our backend.
        console.warn('Auth.jsx: Login response missing access token or not register flow:', data);
        setError('Login successful, but no session token received. Please try again or contact support.');
      }

    } catch (err) {
      console.error('Auth.jsx: Auth error in catch block:', err.message);
      setError(err.message); // Display error on the UI
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
