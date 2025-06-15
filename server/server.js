// server/server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const verifyToken = require('./middleware/auth'); // Import the middleware

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Middleware
app.use(cors()); // Enables CORS for all routes
app.use(express.json()); // Parses incoming JSON requests

// Root endpoint
app.get('/', (req, res) => {
  res.send('Discord Clone Backend API is running!');
});

// Authentication Routes
app.post('/api/auth/register', async (req, res) => {
  const { email, password, username } = req.body; // Username is for initial profile creation via trigger

  if (!email || !password || !username) {
    return res.status(400).json({ error: 'Email, password, and username are required.' });
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username // Pass username to options data for potential use in trigger or for client-side reference
        }
      }
    });

    if (authError) {
      console.error('Supabase Auth Error:', authError.message);
      if (authError.message.includes('already registered')) {
        return res.status(409).json({ error: 'User with this email already exists.' });
      }
      return res.status(500).json({ error: authError.message });
    }

    // The handle_new_user trigger should handle creating the profile entry
    // However, if email confirmation is required, the user might not be fully
    // registered until they confirm their email. The client should handle this.

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
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      console.error('Supabase Login Error:', authError.message);
      return res.status(401).json({ error: authError.message });
    }

    res.status(200).json({
      message: 'Logged in successfully!',
      accessToken: authData.session.access_token,
      user: {
        id: authData.user.id,
        email: authData.user.email,
      },
    });

  } catch (error) {
    console.error('Login Catch Error:', error.message);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const { error: authError } = await supabase.auth.signOut();

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

// Example of a protected route
// Only accessible if a valid JWT is provided in the Authorization header
app.get('/api/protected-route', verifyToken, (req, res) => {
  // req.user will contain the user data from the JWT
  res.status(200).json({ message: 'You accessed a protected route!', user: req.user });
});


// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
