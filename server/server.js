// server/server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const verifyToken = require('./middleware/auth'); // Keep auth middleware for protected routes

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Create the Supabase client for authentication operations (login/register/logout)
// This client uses the anon (public) key and is used for user auth.
const authSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

console.log('--- SERVER.JS AUTH CLIENT DEBUG START ---');
console.log('SERVER.JS AUTH DEBUG: SUPABASE_URL from server .env:', process.env.SUPABASE_URL);
console.log('SERVER.JS AUTH DEBUG: SUPABASE_ANON_KEY from server .env (first 5 chars):', process.env.SUPABASE_ANON_KEY ? process.env.SUPABASE_ANON_KEY.substring(0, 5) + '...' : 'None');
console.log('SERVER.JS AUTH DEBUG: Backend Supabase URL and Anon Key appear to be defined for auth client.');
console.log('SERVER.JS AUTH DEBUG: authSupabase client created.');
// The service role client is removed as it's only for bypassing RLS on channel operations.
console.log('--- SERVER.JS AUTH CLIENT DEBUG END ---');

// Middleware
// IMPORTANT: In production, REPLACE 'https://your-netlify-app-url.netlify.app'
// with your actual deployed Netlify frontend URL.
// For now, during initial deployment, you can use '*' to allow all origins,
// but CHANGE THIS IMMEDIATELY AFTER YOU GET YOUR NETLIFY URL FOR SECURITY.
const corsOptions = {
    origin: process.env.FRONTEND_URL || '*', // Use an environment variable, fallback to '*' for initial test
    optionsSuccessStatus: 200 // For legacy browser support
};
app.use(cors(corsOptions));
app.use(express.json()); // For parsing JSON request bodies

// Root endpoint for health checks
app.get('/', (req, res) => {
  res.send('DM-Only Messaging Backend API is running!');
});

// --- AUTHENTICATION ROUTES ---
// These routes handle user registration, login, and logout.
// They use the 'authSupabase' client, which does not bypass RLS.
app.post('/api/auth/register', async (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password || !username) {
    return res.status(400).json({ error: 'Email, password, and username are required.' });
  }
  try {
    const { data: authData, error: authError } = await authSupabase.auth.signUp({
      email, password, options: { data: { username: username } }
    });
    if (authError) {
      console.error('Supabase Auth Error (Register):', authError.message);
      if (authError.message.includes('already registered')) {
        return res.status(409).json({ error: 'User with this email already exists.' });
      }
      return res.status(500).json({ error: authError.message });
    }
    res.status(201).json({ message: 'User registered successfully. Please check your email for confirmation if email confirmation is enabled.', user: { id: authData.user.id, email: authData.user.email } });
  } catch (error) {
    console.error('Registration Catch Error:', error.message);
    res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  try {
    const { data: authData, error: authError } = await authSupabase.auth.signInWithPassword({
      email, password,
    });
    if (authError) {
      console.error('Supabase Login Error:', authError.message);
      return res.status(401).json({ error: authError.message });
    }
    res.status(200).json({ message: 'Logged in successfully!', session: authData.session, user: authData.user });
  } catch (error) {
    console.error('Login Catch Error:', error.message);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const { error: authError } = await authSupabase.auth.signOut();
    if (authError) {
      console.error('Supabase Logout Error:', authError.message);
      return res.status(500).json({ error: authError.message });
    }
    res.status(200).json({ message: 'Logged out successfully.' });
  } catch (error) {
    console.error('Logout Catch Error:', error.message);
    res.status(500).json({ error: 'Internal server error during logout.' });
  }
});

// --- PROTECTED ROUTES (DM-Only focused) ---
// The verifyToken middleware ensures only authenticated users can access these.
// Message handling will be done directly via Supabase from the frontend,
// or you could add a simple '/api/messages' route here if complex backend logic was needed,
// but for simple inserts/selects, frontend-to-Supabase is common for DMs.

// Example of a protected route (can keep or remove, not directly related to DMs)
app.get('/api/protected-route', verifyToken, (req, res) => {
  res.status(200).json({ message: 'You accessed a protected route!', user: req.user });
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
