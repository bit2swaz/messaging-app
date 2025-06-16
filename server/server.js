// server/server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const verifyToken = require('./middleware/auth');

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// IMPORTANT: REMOVE OR COMMENT OUT THE GLOBAL SUPABASE CLIENT (as discussed)
// const supabaseUrl = process.env.SUPABASE_URL;
// const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
// const supabase = createClient(supabaseUrl, supabaseAnonKey); // <--- REMOVE THIS GLOBAL INSTANCE if using request-scoped

// If you need a Supabase client that operates with the Service Role Key (bypassing RLS for admin tasks),
// you would create it here using process.env.SUPABASE_SERVICE_ROLE_KEY.
// For now, we'll primarily use the request-scoped client.

// Middleware
app.use(cors());
app.use(express.json());

// --- AUTH CLIENT DEBUG LOGS ---
console.log('--- SERVER.JS AUTH CLIENT DEBUG START ---');
const authSupabaseUrl = process.env.SUPABASE_URL;
const authSupabaseAnonKey = process.env.SUPABASE_ANON_KEY;
console.log('SERVER.JS AUTH DEBUG: SUPABASE_URL from server .env:', authSupabaseUrl);
console.log('SERVER.JS AUTH DEBUG: SUPABASE_ANON_KEY from server .env (first 5 chars):', authSupabaseAnonKey ? authSupabaseAnonKey.substring(0, 5) + '...' : 'None');

if (!authSupabaseUrl || !authSupabaseAnonKey) {
    console.error('SERVER.JS AUTH DEBUG: ERROR! Backend Supabase URL or Anon Key are NOT DEFINED in server/.env!');
} else {
    console.log('SERVER.JS AUTH DEBUG: Backend Supabase URL and Anon Key appear to be defined for auth client.');
}
// Create a *basic* Supabase client for auth operations
const authSupabase = createClient(authSupabaseUrl, authSupabaseAnonKey);
console.log('SERVER.JS AUTH DEBUG: authSupabase client created.');
console.log('--- SERVER.JS AUTH CLIENT DEBUG END ---');


// Root endpoint
app.get('/', (req, res) => {
  res.send('Discord Clone Backend API is running!');
});

// Authentication Routes
app.post('/api/auth/register', async (req, res) => {
  const { email, password, username } = req.body;

  if (!email || !password || !username) {
    return res.status(400).json({ error: 'Email, password, and username are required.' });
  }

  try {
    const { data: authData, error: authError } = await authSupabase.auth.signUp({ // Use authSupabase
      email,
      password,
      options: {
        data: {
          username: username
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
    const { data: authData, error: authError } = await authSupabase.auth.signInWithPassword({ // Use authSupabase
      email,
      password,
    });

    if (authError) {
      console.error('Supabase Login Error:', authError.message);
      return res.status(401).json({ error: authError.message });
    }

    res.status(200).json({
      message: 'Logged in successfully!',
      session: authData.session,
      user: authData.user,
    });

  } catch (error) {
    console.error('Login Catch Error:', error.message);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const { error: authError } = await authSupabase.auth.signOut(); // Use authSupabase

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

// Channel Management Routes
app.post('/api/channels', verifyToken, async (req, res) => {
  const supabase = req.supabase;
  const userId = req.user.id;

  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Channel name is required.' });
  }

  console.log('Backend: Attempting to create channel for userId:', userId, 'with name:', name);

  try {
    const { data: channelData, error: channelError } = await supabase
      .from('channels')
      .insert([{ name, description, created_by: userId }])
      .select()
      .single();

    if (channelError) {
      console.error('Supabase Channel Create Error:', channelError.message);
      if (channelError.code === '23505') {
        return res.status(409).json({ error: 'Channel with this name already exists.' });
      }
      return res.status(500).json({ error: channelError.message });
    }

    const { data: memberData, error: memberError } = await supabase
      .from('channel_members')
      .insert([{ channel_id: channelData.id, user_id: userId }])
      .select();

    if (memberError) {
      console.error('Supabase Channel Member Add Error:', memberError.message);
      return res.status(500).json({ error: `Channel created, but failed to add creator as member: ${memberError.message}` });
    }

    res.status(201).json({
      message: 'Channel created and you have been added as a member!',
      channel: channelData,
    });

  } catch (error) {
    console.error('Create Channel Catch Error:', error.message);
    res.status(500).json({ error: 'Internal server error during channel creation.' });
  }
});

app.get('/api/channels', verifyToken, async (req, res) => {
  const supabase = req.supabase;
  const userId = req.user.id;

  try {
    const { data: channels, error } = await supabase
      .from('channel_members')
      .select('channel_id, channels(id, name, description)')
      .eq('user_id', userId);

    if (error) {
      console.error('Supabase Get Channels Error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    const userChannels = channels.map(cm => cm.channels);
    res.status(200).json(userChannels);

  } catch (error) {
    console.error('Get Channels Catch Error:', error.message);
    res.status(500).json({ error: 'Internal server error fetching channels.' });
  }
});


// Example of a protected route (already existing)
app.get('/api/protected-route', verifyToken, (req, res) => {
  res.status(200).json({ message: 'You accessed a protected route!', user: req.user });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
