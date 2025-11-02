const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const auth = require('./auth');
const serverManager = require('./serverManager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Store active WebSocket connections
const connections = new Map();

// Auth Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const result = await auth.register(username, password);
    
    if (result.success) {
      res.json({ success: true, message: 'User registered successfully' });
    } else {
      res.status(400).json({ error: result.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error during registration' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const result = await auth.login(username, password);
    
    if (result.success) {
      res.json({ success: true, token: result.token, username: result.username });
    } else {
      res.status(401).json({ error: result.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Server Management Routes
app.get('/api/servers', auth.verifyToken, async (req, res) => {
  try {
    const servers = await serverManager.getServers();
    res.json({ servers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get servers' });
  }
});

app.post('/api/servers/:serverName/start', auth.verifyToken, async (req, res) => {
  try {
    const { serverName } = req.params;
    const result = await serverManager.startServer(serverName);
    
    if (result.success) {
      res.json({ success: true, message: 'Server started' });
    } else {
      res.status(400).json({ error: result.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to start server' });
  }
});

app.post('/api/servers/:serverName/stop', auth.verifyToken, async (req, res) => {
  try {
    const { serverName } = req.params;
    const result = await serverManager.stopServer(serverName);
    
    if (result.success) {
      res.json({ success: true, message: 'Server stopped' });
    } else {
      res.status(400).json({ error: result.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to stop server' });
  }
});

app.get('/api/servers/:serverName/status', auth.verifyToken, async (req, res) => {
  try {
    const { serverName } = req.params;
    const status = serverManager.getServerStatus(serverName);
    res.json({ status });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get server status' });
  }
});

app.post('/api/servers/:serverName/command', auth.verifyToken, async (req, res) => {
  try {
    const { serverName } = req.params;
    const { command } = req.body;
    
    if (!command) {
      return res.status(400).json({ error: 'Command required' });
    }

    const result = serverManager.sendCommand(serverName, command);
    
    if (result.success) {
      res.json({ success: true, message: 'Command sent' });
    } else {
      res.status(400).json({ error: result.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to send command' });
  }
});

app.get('/api/servers/:serverName/config', auth.verifyToken, async (req, res) => {
  try {
    const { serverName } = req.params;
    const config = await serverManager.getServerConfig(serverName);
    res.json({ config });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get server config' });
  }
});

app.post('/api/servers/:serverName/config', auth.verifyToken, async (req, res) => {
  try {
    const { serverName } = req.params;
    const { startupCommand } = req.body;
    
    if (!startupCommand) {
      return res.status(400).json({ error: 'Startup command required' });
    }

    const result = await serverManager.updateServerConfig(serverName, startupCommand);
    
    if (result.success) {
      res.json({ success: true, message: 'Config updated' });
    } else {
      res.status(400).json({ error: result.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// WebSocket for console output
wss.on('connection', (ws, req) => {
  console.log('WebSocket client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Verify token
      if (data.type === 'auth') {
        const verified = auth.verifyTokenSync(data.token);
        if (verified) {
          ws.authenticated = true;
          ws.send(JSON.stringify({ type: 'auth', success: true }));
        } else {
          ws.send(JSON.stringify({ type: 'auth', success: false }));
          ws.close();
        }
      }
      
      // Subscribe to server console
      if (data.type === 'subscribe' && ws.authenticated) {
        ws.serverName = data.serverName;
        connections.set(ws, data.serverName);
        console.log(`Client subscribed to ${data.serverName}`);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    connections.delete(ws);
    console.log('WebSocket client disconnected');
  });
});

// Broadcast console output to connected clients
serverManager.on('console', (serverName, data) => {
  connections.forEach((subscribedServer, ws) => {
    if (subscribedServer === serverName && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'console',
        serverName,
        data: data.toString()
      }));
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Minecraft Server Controller running on http://localhost:${PORT}`);
  console.log('Initializing server manager...');
  serverManager.initialize();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  serverManager.stopAllServers();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});