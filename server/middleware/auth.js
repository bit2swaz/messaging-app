// server/middleware/auth.js
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Middleware to verify JWT from Supabase.
 * Attaches the user object to req.user if token is valid.
 */
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Expects "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'No token provided. Authorization denied.' });
  }

  try {
    // Use Supabase's auth.getUser to verify the JWT
    // This implicitly checks the JWT's validity and expiration
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error('JWT verification error:', error.message);
      return res.status(401).json({ error: 'Token verification failed. Authorization denied.' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid token or user not found. Authorization denied.' });
    }

    req.user = user; // Attach user information to the request object
    next(); // Proceed to the next middleware/route handler
  } catch (error) {
    console.error('Verify Token Catch Error:', error.message);
    res.status(500).json({ error: 'Internal server error during token verification.' });
  }
};

module.exports = verifyToken;
