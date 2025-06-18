// client/src/pages/Auth.jsx
import React, { useState } => {
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
    console.log('Auth.jsx: API_BASE_URL:', API_BASE_URL); // Debugging: Check the base URL

    try {
      // --- CRITICAL FIX: Added /api prefix to the endpoints ---
      const endpoint = isRegister ? `${API_BASE_URL}/api/auth/register` : `${API_BASE_URL}/api/auth/login`;
      const body = isRegister ? { email, password, username } : { email, password };

      console.log('Auth.jsx: Constructed endpoint:', endpoint); // Debugging: Check the full URL

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      console.log('Auth.jsx: Fetch response received. Status:', response.status, 'OK:', response.ok);

      // Check if response is JSON before trying to parse
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textError = await response.text();
        console.error('Auth.jsx: Received non-JSON response:', textError);
        throw new Error(`Expected JSON response, but received: ${textError.substring(0, 100)}... (Status: ${response.status})`);
      }


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
        const { error: sessionSetError } = await supabase.auth.setSession(data.session);

        if (sessionSetError) {
          console.error('Auth.jsx: Error setting Supabase session explicitly:', sessionSetError.message);
          setError(`Login successful, but session setup failed: ${sessionSetError.message}`);
          return;
        }

        signIn(data.user);
        console.log('Auth.jsx: Supabase session explicitly set. AuthContext updated.');

      } else if (isRegister) {
        console.log('Auth.jsx: Registration success. User needs to login.');
        setIsRegister(false); // Switch to login form
        setEmail('');
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
}

