// client/src/pages/Auth.jsx
import React, { useState, useEffect } from 'react'; // Keep useEffect, but its content will change
// import { useNavigate } from 'react-router-dom'; // No longer needed for direct navigation in this component
import { useAuth } from '../context/AuthContext';
import styles from './Auth.module.css';

const Auth = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const { user, signIn } = useAuth(); // We still need 'user' for internal component logic like clearing inputs after register
  // const navigate = useNavigate(); // Removed, as App.jsx will handle navigation

  // REMOVE THIS useEffect BLOCK ENTIRELY
  // useEffect(() => {
  //   console.log('Auth.jsx: Current user state in Auth component (useEffect):', user ? user.id : 'None');
  //   if (user) {
  //     console.log('Auth.jsx: User already logged in, navigating to /home.');
  //     navigate('/home');
  //   }
  // }, [user, navigate]);


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

      if (!isRegister && data.accessToken) {
        console.log('Auth.jsx: Login successful. Setting localStorage token and calling signIn context function.');
        localStorage.setItem('supabase.auth.token', data.accessToken);
        signIn(data.user); // Update AuthContext state, which App.jsx will react to for navigation
      } else if (isRegister) {
        console.log('Auth.jsx: Registration success. User needs to login.');
        setIsRegister(false); // Switch to login form
        setEmail(''); // Clear inputs for fresh login
        setPassword('');
        setUsername('');
      } else {
        console.warn('Auth.jsx: Login response missing access token or not register flow:', data);
        setError('Login successful, but no session token received. Please try again or contact support.');
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
