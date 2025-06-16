// server/middleware/auth.js
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.JWT_SECRET; // Ensure this is loaded from .env

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET); // Verify your custom JWT
    req.user = decoded.user; // Set req.user from your JWT payload

    // --- CRITICAL NEW PART: Create a Supabase client for this request with the user's JWT ---
    // This client will have the correct authentication context for RLS policies
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}` // Pass the user's JWT for RLS context
        }
      }
    });
    req.supabase = userSupabase; // Attach the user-scoped supabase client to the request object
    // --- END CRITICAL NEW PART ---

    next(); // Proceed to the next middleware/route handler
  } catch (error) {
    console.error('Token verification error:', error.message);
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

module.exports = verifyToken;
