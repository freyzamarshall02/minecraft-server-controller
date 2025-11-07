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

// Check if any user exists (for first-time setup)
async function hasUser() {
  try {
    const users = await loadUsers();
    return Object.keys(users).length > 0;
  } catch (error) {
    console.error('Error checking user existence:', error);
    return false;
  }
}

// Get current user info (username only, no password)
async function getCurrentUser() {
  try {
    const users = await loadUsers();
    const usernames = Object.keys(users);
    
    if (usernames.length === 0) {
      return null;
    }
    
    const username = usernames[0]; // Get the first (and only) user
    return {
      username: username,
      createdAt: users[username].createdAt,
      lastLogin: users[username].lastLogin
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

// Register new user (only if no user exists)
async function register(username, password) {
  try {
    const users = await loadUsers();
    
    // Check if any user already exists (single-user system)
    if (Object.keys(users).length > 0) {
      return { success: false, message: 'User already exists. Only one user allowed.' };
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

// Update username
async function updateUsername(currentUsername, newUsername) {
  try {
    const users = await loadUsers();
    
    // Check if current user exists
    if (!users[currentUsername]) {
      return { success: false, message: 'Current user not found' };
    }
    
    // If username hasn't changed, return success
    if (currentUsername === newUsername) {
      return { success: true, message: 'Username unchanged' };
    }
    
    // Copy user data to new username
    users[newUsername] = users[currentUsername];
    
    // Delete old username
    delete users[currentUsername];
    
    await saveUsers(users);
    
    // Generate new token with new username
    const token = generateToken(newUsername);
    
    return { 
      success: true, 
      message: 'Username updated successfully',
      token,
      username: newUsername
    };
  } catch (error) {
    console.error('Update username error:', error);
    return { success: false, message: 'Failed to update username' };
  }
}

// Update password
async function updatePassword(username, currentPassword, newPassword) {
  try {
    const users = await loadUsers();
    
    // Check if user exists
    if (!users[username]) {
      return { success: false, message: 'User not found' };
    }
    
    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, users[username].password);
    
    if (!isValid) {
      return { success: false, message: 'Current password is incorrect' };
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    
    // Update password
    users[username].password = hashedPassword;
    users[username].passwordUpdatedAt = new Date().toISOString();
    
    await saveUsers(users);
    
    return { success: true, message: 'Password updated successfully' };
  } catch (error) {
    console.error('Update password error:', error);
    return { success: false, message: 'Failed to update password' };
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
  verifyTokenAsync,
  hasUser,
  getCurrentUser,
  updateUsername,
  updatePassword
};
