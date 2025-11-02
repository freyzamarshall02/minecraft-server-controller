// Global state
let token = localStorage.getItem('token');
let username = localStorage.getItem('username');
let selectedServer = null;
let ws = null;
let servers = [];
let statusUpdateInterval = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Console history per server
let consoleHistory = {}; // { serverName: "console text..." }

// DOM Elements
const authPanel = document.getElementById('auth-panel');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authError = document.getElementById('auth-error');
const showRegisterBtn = document.getElementById('show-register');
const showLoginBtn = document.getElementById('show-login');
const logoutBtn = document.getElementById('logout-btn');
const usernameDisplay = document.getElementById('username-display');
const serversContainer = document.getElementById('servers-container');
const refreshServersBtn = document.getElementById('refresh-servers');
const noServerSelected = document.getElementById('no-server-selected');
const serverDetails = document.getElementById('server-details');
const selectedServerName = document.getElementById('selected-server-name');
const serverStatus = document.getElementById('server-status');
const startServerBtn = document.getElementById('start-server');
const stopServerBtn = document.getElementById('stop-server');
const configServerBtn = document.getElementById('config-server');
const consoleOutput = document.getElementById('console-output');
const commandInput = document.getElementById('command-input');
const sendCommandBtn = document.getElementById('send-command');
const clearConsoleBtn = document.getElementById('clear-console');
const configModal = document.getElementById('config-modal');
const startupCommandInput = document.getElementById('startup-command');
const saveConfigBtn = document.getElementById('save-config');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (token && username) {
        showDashboard();
    } else {
        showAuth();
    }
});

// ============================================
// AUTH FUNCTIONS
// ============================================

function showAuth() {
    authPanel.style.display = 'flex';
    dashboard.style.display = 'none';
    
    // Clear any intervals
    if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
        statusUpdateInterval = null;
    }
    
    // Close WebSocket
    if (ws) {
        ws.close();
        ws = null;
    }
}

function showDashboard() {
    authPanel.style.display = 'none';
    dashboard.style.display = 'flex';
    usernameDisplay.textContent = `👤 ${username}`;
    loadServers();
    connectWebSocket();
    
    // Start auto-refresh
    if (statusUpdateInterval) clearInterval(statusUpdateInterval);
    statusUpdateInterval = setInterval(() => {
        if (selectedServer) {
            updateServerStatus();
        }
        loadServers();
    }, 5000);
}

function showError(message) {
    authError.textContent = message;
    authError.classList.add('show');
    setTimeout(() => {
        authError.classList.remove('show');
    }, 5000);
}

function showNotification(message, type = 'info') {
    // Simple console notification - you can enhance this with a toast library
    console.log(`[${type.toUpperCase()}] ${message}`);
    appendToConsole(`[${type.toUpperCase()}] ${message}\n`);
}

// Switch between login and register forms
showRegisterBtn.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    authError.classList.remove('show');
});

showLoginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
    authError.classList.remove('show');
});

// Login form submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const user = document.getElementById('login-username').value.trim();
    const pass = document.getElementById('login-password').value;
    
    if (!user || !pass) {
        showError('Please fill in all fields');
        return;
    }

    // Disable submit button
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });

        const data = await response.json();

        if (data.success) {
            token = data.token;
            username = data.username;
            localStorage.setItem('token', token);
            localStorage.setItem('username', username);
            loginForm.reset();
            showDashboard();
        } else {
            showError(data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('Connection error. Please check if the server is running.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
    }
});

// Register form submission
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const user = document.getElementById('register-username').value.trim();
    const pass = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    
    if (!user || !pass || !confirm) {
        showError('Please fill in all fields');
        return;
    }

    if (pass.length < 6) {
        showError('Password must be at least 6 characters long');
        return;
    }

    if (pass !== confirm) {
        showError('Passwords do not match');
        return;
    }

    // Disable submit button
    const submitBtn = registerForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering...';

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });

        const data = await response.json();

        if (data.success) {
            showError('✅ Registration successful! Please login.');
            document.getElementById('register-form').style.display = 'none';
            document.getElementById('login-form').style.display = 'block';
            registerForm.reset();
            
            // Pre-fill username in login form
            document.getElementById('login-username').value = user;
            document.getElementById('login-password').focus();
        } else {
            showError(data.error || 'Registration failed');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showError('Connection error. Please check if the server is running.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Register';
    }
});

// Logout
logoutBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        token = null;
        username = null;
        selectedServer = null;
        servers = [];
        
        if (ws) {
            ws.close();
            ws = null;
        }
        
        showAuth();
    }
});

// ============================================
// SERVER MANAGEMENT
// ============================================

async function loadServers() {
    try {
        const response = await fetch('/api/servers', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) {
            // Token expired
            showError('Session expired. Please login again.');
            setTimeout(() => {
                localStorage.clear();
                window.location.reload();
            }, 2000);
            return;
        }

        const data = await response.json();
        servers = data.servers || [];
        renderServers();
    } catch (error) {
        console.error('Failed to load servers:', error);
        serversContainer.innerHTML = '<p class="loading">❌ Failed to load servers. Check connection.</p>';
    }
}

function renderServers() {
    if (servers.length === 0) {
        serversContainer.innerHTML = '<p class="loading">📁 No servers found<br><small>Add server folders to minecraft-servers/</small></p>';
        return;
    }

    serversContainer.innerHTML = '';
    
    servers.forEach(server => {
        const serverItem = document.createElement('div');
        serverItem.className = 'server-item';
        if (selectedServer === server.name) {
            serverItem.classList.add('active');
        }

        const statusClass = server.status.running ? 'online' : 'offline';
        const statusText = server.status.running ? 'Online' : 'Offline';
        
        // Calculate uptime if running
        let uptimeText = '';
        if (server.status.running && server.status.uptime) {
            const seconds = Math.floor(server.status.uptime / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            
            if (hours > 0) {
                uptimeText = `<small style="color: #10b981;">⏱ ${hours}h ${minutes % 60}m uptime</small>`;
            } else if (minutes > 0) {
                uptimeText = `<small style="color: #10b981;">⏱ ${minutes}m uptime</small>`;
            } else {
                uptimeText = `<small style="color: #10b981;">⏱ ${seconds}s uptime</small>`;
            }
        }

        serverItem.innerHTML = `
            <div class="server-item-name">🎮 ${server.name}</div>
            <div class="server-item-status">
                <span class="status-indicator ${statusClass}"></span>
                ${statusText}
            </div>
            ${uptimeText}
        `;

        serverItem.addEventListener('click', () => selectServer(server.name));
        serversContainer.appendChild(serverItem);
    });
}

function selectServer(serverName) {
    selectedServer = serverName;
    renderServers();
    showServerDetails();
    updateServerStatus();
    
    // Clear console and subscribe to new server
    consoleOutput.textContent = '';
    appendToConsole(`[INFO] Connected to ${serverName}\n`);
    appendToConsole(`[INFO] Console output will appear here...\n\n`);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'subscribe', serverName }));
    }
}

function showServerDetails() {
    noServerSelected.style.display = 'none';
    serverDetails.style.display = 'flex';
    selectedServerName.textContent = `🎮 ${selectedServer}`;
}

async function updateServerStatus() {
    if (!selectedServer) return;

    try {
        const response = await fetch(`/api/servers/${selectedServer}/status`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) return;

        const data = await response.json();
        
        if (data.status.running) {
            serverStatus.textContent = '● Online';
            serverStatus.className = 'status-badge online';
            startServerBtn.disabled = true;
            stopServerBtn.disabled = false;
            commandInput.disabled = false;
            sendCommandBtn.disabled = false;
        } else {
            serverStatus.textContent = '● Offline';
            serverStatus.className = 'status-badge offline';
            startServerBtn.disabled = false;
            stopServerBtn.disabled = true;
            commandInput.disabled = true;
            sendCommandBtn.disabled = true;
        }
    } catch (error) {
        console.error('Failed to get server status:', error);
    }
}

// Refresh servers button
refreshServersBtn.addEventListener('click', async () => {
    refreshServersBtn.disabled = true;
    refreshServersBtn.textContent = '🔄 Refreshing...';
    
    await loadServers();
    
    setTimeout(() => {
        refreshServersBtn.disabled = false;
        refreshServersBtn.textContent = '🔄 Refresh';
    }, 1000);
});

// Start server
startServerBtn.addEventListener('click', async () => {
    if (!selectedServer) return;

    startServerBtn.disabled = true;
    startServerBtn.textContent = '⏳ Starting...';

    try {
        const response = await fetch(`/api/servers/${selectedServer}/start`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        
        if (data.success) {
            appendToConsole('[INFO] ▶ Server starting...\n');
            showNotification('Server starting...', 'success');
            
            // Update status after delay
            setTimeout(() => {
                updateServerStatus();
                loadServers();
            }, 2000);
        } else {
            appendToConsole(`[ERROR] ❌ ${data.error}\n`);
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Start server error:', error);
        appendToConsole('[ERROR] ❌ Failed to start server\n');
    } finally {
        setTimeout(() => {
            startServerBtn.disabled = false;
            startServerBtn.textContent = '▶ Start';
        }, 2000);
    }
});

// Stop server
stopServerBtn.addEventListener('click', async () => {
    if (!selectedServer) return;
    
    if (!confirm(`Stop server "${selectedServer}"?`)) return;

    stopServerBtn.disabled = true;
    stopServerBtn.textContent = '⏳ Stopping...';

    try {
        const response = await fetch(`/api/servers/${selectedServer}/stop`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        
        if (data.success) {
            appendToConsole('[INFO] ⏹ Stopping server...\n');
            showNotification('Server stopping...', 'info');
            
            // Update status after delay
            setTimeout(() => {
                updateServerStatus();
                loadServers();
            }, 2000);
        } else {
            appendToConsole(`[ERROR] ❌ ${data.error}\n`);
            showNotification(data.error, 'error');
        }
    } catch (error) {
        console.error('Stop server error:', error);
        appendToConsole('[ERROR] ❌ Failed to stop server\n');
    } finally {
        setTimeout(() => {
            stopServerBtn.disabled = false;
            stopServerBtn.textContent = '⏹ Stop';
        }, 2000);
    }
});

// Send command
sendCommandBtn.addEventListener('click', sendCommand);

commandInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendCommand();
    }
});

// Command history
let commandHistory = [];
let historyIndex = -1;

commandInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
            historyIndex++;
            commandInput.value = commandHistory[commandHistory.length - 1 - historyIndex];
        }
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex > 0) {
            historyIndex--;
            commandInput.value = commandHistory[commandHistory.length - 1 - historyIndex];
        } else if (historyIndex === 0) {
            historyIndex = -1;
            commandInput.value = '';
        }
    }
});

async function sendCommand() {
    if (!selectedServer || !commandInput.value.trim()) return;

    const command = commandInput.value.trim();
    
    // Add to history
    commandHistory.push(command);
    if (commandHistory.length > 50) commandHistory.shift(); // Keep last 50 commands
    historyIndex = -1;

    try {
        const response = await fetch(`/api/servers/${selectedServer}/command`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ command })
        });

        const data = await response.json();
        
        if (!data.success) {
            appendToConsole(`[ERROR] ❌ ${data.error}\n`);
        }
    } catch (error) {
        console.error('Send command error:', error);
        appendToConsole('[ERROR] ❌ Failed to send command\n');
    }

    commandInput.value = '';
}

// Clear console
clearConsoleBtn.addEventListener('click', () => {
    if (confirm('Clear console output?')) {
        consoleOutput.textContent = '';
        appendToConsole('[INFO] Console cleared\n');
    }
});

function appendToConsole(text) {
    consoleOutput.textContent += text;
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// ============================================
// CONFIG MODAL
// ============================================

configServerBtn.addEventListener('click', async () => {
    if (!selectedServer) return;

    try {
        const response = await fetch(`/api/servers/${selectedServer}/config`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        startupCommandInput.value = data.config.startupCommand;
        configModal.classList.add('show');
    } catch (error) {
        console.error('Failed to load config:', error);
        alert('Failed to load configuration');
    }
});

saveConfigBtn.addEventListener('click', async () => {
    if (!selectedServer) return;

    const command = startupCommandInput.value.trim();
    
    if (!command) {
        alert('Startup command cannot be empty');
        return;
    }

    saveConfigBtn.disabled = true;
    saveConfigBtn.textContent = 'Saving...';

    try {
        const response = await fetch(`/api/servers/${selectedServer}/config`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ startupCommand: command })
        });

        const data = await response.json();
        
        if (data.success) {
            configModal.classList.remove('show');
            appendToConsole('[INFO] ⚙️ Configuration updated successfully\n');
            showNotification('Configuration saved', 'success');
        } else {
            alert('Failed to update config: ' + data.error);
        }
    } catch (error) {
        console.error('Save config error:', error);
        alert('Failed to save configuration');
    } finally {
        saveConfigBtn.disabled = false;
        saveConfigBtn.textContent = 'Save';
    }
});

// Close modal
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        configModal.classList.remove('show');
    });
});

// Close modal on outside click
configModal.addEventListener('click', (e) => {
    if (e.target === configModal) {
        configModal.classList.remove('show');
    }
});

// ============================================
// WEBSOCKET CONNECTION
// ============================================

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('✅ WebSocket connected');
        reconnectAttempts = 0;
        
        // Authenticate
        ws.send(JSON.stringify({ type: 'auth', token }));
        
        // Subscribe to selected server
        if (selectedServer) {
            ws.send(JSON.stringify({ type: 'subscribe', serverName: selectedServer }));
            appendToConsole('[INFO] 🔌 Connected to console stream\n');
        }
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'auth') {
                if (!data.success) {
                    console.error('WebSocket authentication failed');
                    ws.close();
                }
            } else if (data.type === 'console' && data.serverName === selectedServer) {
                appendToConsole(data.data);
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    };

    ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        
        // Attempt to reconnect
        if (token && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            console.log(`Reconnecting... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
            
            setTimeout(() => {
                if (token) connectWebSocket();
            }, 3000 * reconnectAttempts);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            appendToConsole('\n[ERROR] ❌ Connection lost. Please refresh the page.\n');
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Format file size
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Format uptime
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
    }
    
    if (ws) {
        ws.close();
    }
});