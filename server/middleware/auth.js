// server/middleware/auth.js
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

console.log('--- AUTH.JS DEBUG START ---');
console.log('AUTH.JS DEBUG: process.env.SUPABASE_URL:', supabaseUrl);
console.log('AUTH.JS DEBUG: process.env.SUPABASE_ANON_KEY (first 5 chars):', supabaseAnonKey ? supabaseAnonKey.substring(0, 5) + '...' : 'None');
console.log('AUTH.JS DEBUG: JWT_SECRET variable (first 5 chars):', JWT_SECRET ? JWT_SECRET.substring(0, 5) + '...' : 'None');
console.log('AUTH.JS DEBUG: JWT_SECRET length:', JWT_SECRET ? JWT_SECRET.length : 'N/A');
console.log('AUTH.JS DEBUG: typeof JWT_SECRET:', typeof JWT_SECRET);
console.log('--- AUTH.JS DEBUG END ---');


const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  console.log('VERIFYTOKEN DEBUG: Request received.');
  console.log('VERIFYTOKEN DEBUG: Authorization Header:', authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('VERIFYTOKEN DEBUG: No Authorization header or not Bearer token.');
    return res.status(401).json({ error: 'Authorization token required.' });
  }

  const token = authHeader.split(' ')[1];

  console.log('VERIFYTOKEN DEBUG: Extracted Token (first 10 chars):', token ? token.substring(0, 10) + '...' : 'None');
  console.log('VERIFYTOKEN DEBUG: Extracted Token length:', token ? token.length : 'N/A');
  console.log('VERIFYTOKEN DEBUG: JWT_SECRET for verification (first 5 chars):', JWT_SECRET ? JWT_SECRET.substring(0, 5) + '...' : 'None');
  console.log('VERIFYTOKEN DEBUG: JWT_SECRET length for verification:', JWT_SECRET ? JWT_SECRET.length : 'N/A');

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = {
      id: decoded.sub,
    };
    console.log('VERIFYTOKEN DEBUG: JWT Decoded successfully. req.user set to:', req.user);

    // --- CRITICAL NEW PART: Create basic client and THEN explicitly set session/auth ---
    // First, create a basic Supabase client (without global headers for auth)
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey);

    // Then, explicitly set the session/auth token.
    // This often performs a local storage/cookie sync, but more importantly,
    // it registers the token with this specific client instance for subsequent API calls.
    const { data: { user, session }, error: setAuthError } = await userSupabase.auth.setSession({ access_token: token });

    if (setAuthError) {
      console.error('VERIFYTOKEN DEBUG: Error setting Supabase client session/auth:', setAuthError.message);
      // If setting auth fails here, it indicates a very deep problem with the token itself or client setup
      return res.status(401).json({ error: 'Failed to establish user session for Supabase client.' });
    }

    console.log('VERIFYTOKEN DEBUG: Supabase client session/auth successfully set for user:', user ? user.id : 'None');

    req.supabase = userSupabase; // Attach the user-scoped supabase client to the request object
    // --- END CRITICAL NEW PART ---

    next();
  } catch (error) {
    console.error('VERIFYTOKEN DEBUG: Token verification error:', error.message);
    if (error.message.includes('secret or public key must be provided')) {
      console.error('VERIFYTOKEN DEBUG: JWT_SECRET was likely invalid or undefined during jwt.verify!');
      console.error('VERIFYTOKEN DEBUG: Current JWT_SECRET value:', JWT_SECRET);
    }
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

module.exports = verifyToken;
