const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const USERS_FILE = path.join(__dirname, '../data/users.json');
const SALT_ROUNDS = 10;

// Ensure data directory exists
async function ensureDataDir() {
  const dataDir = path.join(__dirname, '../data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Load users from JSON file
async function loadUsers() {
  try {
    await ensureDataDir();
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return empty object
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

// Save users to JSON file
async function saveUsers(users) {
  await ensureDataDir();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

// Generate simple token (you can use JWT for production)
function generateToken(username) {
  return crypto.randomBytes(32).toString('hex') + '.' + Buffer.from(username).toString('base64');
}

// Parse token to get username
function parseToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    return Buffer.from(parts[1], 'base64').toString('utf8');
  } catch {
    return null;
  }
}

// Register new user
async function register(username, password) {
  try {
    const users = await loadUsers();
    
    // Check if user already exists
    if (users[username]) {
      return { success: false, message: 'Username already exists' };
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    
    // Save user
    users[username] = {
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };
    
    await saveUsers(users);
    
    return { success: true, message: 'User registered successfully' };
  } catch (error) {
    console.error('Registration error:', error);
    return { success: false, message: 'Registration failed' };
  }
}

// Login user
async function login(username, password) {
  try {
    const users = await loadUsers();
    
    // Check if user exists
    if (!users[username]) {
      return { success: false, message: 'Invalid username or password' };
    }
    
    // Verify password
    const isValid = await bcrypt.compare(password, users[username].password);
    
    if (!isValid) {
      return { success: false, message: 'Invalid username or password' };
    }
    
    // Generate token
    const token = generateToken(username);
    
    // Update last login
    users[username].lastLogin = new Date().toISOString();
    await saveUsers(users);
    
    return { 
      success: true, 
      token,
      username 
    };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, message: 'Login failed' };
  }
}

// Verify token (async)
async function verifyTokenAsync(token) {
  if (!token) return null;
  
  const username = parseToken(token);
  if (!username) return null;
  
  const users = await loadUsers();
  if (!users[username]) return null;
  
  return username;
}

// Verify token (sync for WebSocket)
function verifyTokenSync(token) {
  if (!token) return null;
  return parseToken(token);
}

// Middleware to verify token
async function verifyToken(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const username = await verifyTokenAsync(token);
    
    if (!username) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    req.user = { username };
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Token verification failed' });
  }
}

module.exports = {
  register,
  login,
  verifyToken,
  verifyTokenSync,
  verifyTokenAsync
};