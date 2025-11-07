// Global state
let token = localStorage.getItem('token');
let username = localStorage.getItem('username');
let selectedServer = null;
let ws = null;
let servers = [];
let statusUpdateInterval = null;
let reconnectAttempts = 0;
let reconnectTimeout = null;
const MAX_RECONNECT_ATTEMPTS = 5;

// DOM Elements
const loginPage = document.getElementById('login-page');
const registerPage = document.getElementById('register-page');
const dashboardPage = document.getElementById('dashboard-page');
const consolePage = document.getElementById('console-page');

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authError = document.getElementById('auth-error');
const registerError = document.getElementById('register-error');

const logoutBtn = document.getElementById('logout-btn');
const logoutBtn2 = document.getElementById('logout-btn-2');
const usernameDisplay = document.getElementById('username-display');
const usernameDisplay2 = document.getElementById('username-display-2');

// Settings elements
const settingsBtn = document.getElementById('settings-btn');
const settingsBtn2 = document.getElementById('settings-btn-2');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const settingsMessage = document.getElementById('settings-message');
const currentUsernameDisplay = document.getElementById('current-username-display');
const changeUsernameForm = document.getElementById('change-username-form');
const changePasswordForm = document.getElementById('change-password-form');

const serversGrid = document.getElementById('servers-grid');
const refreshServersBtn = document.getElementById('refresh-servers');

const backToDashboardBtn = document.getElementById('back-to-dashboard');
const consoleServerName = document.getElementById('console-server-name');
const consoleServerStatus = document.getElementById('console-server-status');
const consoleServerUptime = document.getElementById('console-server-uptime');
const startServerBtn = document.getElementById('start-server');
const stopServerBtn = document.getElementById('stop-server');

const consoleOutput = document.getElementById('console-output');
const commandInput = document.getElementById('command-input');
const sendCommandBtn = document.getElementById('send-command');
const clearConsoleBtn = document.getElementById('clear-console');

const startupCommandInput = document.getElementById('startup-command');
const saveStartupBtn = document.getElementById('save-startup');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Check if first-time setup is needed
    await checkFirstTimeSetup();
});

// ============================================
// FIRST-TIME SETUP CHECK
// ============================================

async function checkFirstTimeSetup() {
    try {
        const response = await fetch('/api/setup/status');
        const data = await response.json();
        
        if (!data.hasUser) {
            // No user exists, show register page
            showPage('register');
        } else {
            // User exists, check if logged in
            if (token && username) {
                showDashboard();
            } else {
                showPage('login');
            }
        }
    } catch (error) {
        console.error('Failed to check setup status:', error);
        // Default to login page if check fails
        if (token && username) {
            showDashboard();
        } else {
            showPage('login');
        }
    }
    
    initializeTabs();
}

// ============================================
// PAGE NAVIGATION
// ============================================

function showPage(page) {
    // Hide all pages
    loginPage.classList.remove('active');
    registerPage.classList.remove('active');
    dashboardPage.classList.remove('active');
    consolePage.classList.remove('active');
    
    // Show selected page
    switch(page) {
        case 'login':
            loginPage.classList.add('active');
            break;
        case 'register':
            registerPage.classList.add('active');
            break;
        case 'dashboard':
            dashboardPage.classList.add('active');
            break;
        case 'console':
            consolePage.classList.add('active');
            break;
    }
}

function showDashboard() {
    // Unsubscribe from previous server if any
    if (selectedServer && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'unsubscribe', serverName: selectedServer }));
    }
    selectedServer = null;
    
    showPage('dashboard');
    usernameDisplay.textContent = `👤 ${username}`;
    loadServers();
    
    // Connect WebSocket if not connected
    if (!ws || ws.readyState === WebSocket.CLOSED) {
        connectWebSocket();
    }
    
    // Start auto-refresh
    if (statusUpdateInterval) clearInterval(statusUpdateInterval);
    statusUpdateInterval = setInterval(() => {
        loadServers();
    }, 5000);
}

function showConsolePage(serverName) {
    // Unsubscribe from previous server if different
    if (selectedServer && selectedServer !== serverName && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'unsubscribe', serverName: selectedServer }));
    }
    
    selectedServer = serverName;
    showPage('console');
    usernameDisplay2.textContent = `👤 ${username}`;
    consoleServerName.textContent = `🎮 ${serverName}`;
    
    // Switch to console tab
    switchTab('console-tab');
    
    // Load server data
    updateServerStatus();
    loadConsoleHistory();
    loadStartupConfig();
    
    // Subscribe to WebSocket if connected
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'subscribe', serverName }));
    } else if (!ws || ws.readyState === WebSocket.CLOSED) {
        // Reconnect if WebSocket is closed
        connectWebSocket();
    }
    
    // Start status updates for console page
    if (statusUpdateInterval) clearInterval(statusUpdateInterval);
    statusUpdateInterval = setInterval(() => {
        updateServerStatus();
    }, 5000);
}

// ============================================
// AUTH FUNCTIONS
// ============================================

function showError(message, isRegister = false) {
    const errorEl = isRegister ? registerError : authError;
    errorEl.textContent = message;
    errorEl.classList.add('show');
    setTimeout(() => {
        errorEl.classList.remove('show');
    }, 5000);
}

// Login form submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const user = document.getElementById('login-username').value.trim();
    const pass = document.getElementById('login-password').value;
    
    if (!user || !pass) {
        showError('Please fill in all fields');
        return;
    }

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'LOGGING IN...';

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
            
            // Reset reconnect attempts on new login
            reconnectAttempts = 0;
            
            showDashboard();
        } else {
            showError(data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('Connection error. Please check if the server is running.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'LOGIN';
    }
});

// Register form submission
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const user = document.getElementById('register-username').value.trim();
    const pass = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    
    if (!user || !pass || !confirm) {
        showError('Please fill in all fields', true);
        return;
    }

    if (pass.length < 6) {
        showError('Password must be at least 6 characters long', true);
        return;
    }

    if (pass !== confirm) {
        showError('Passwords do not match', true);
        return;
    }

    const submitBtn = registerForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'CREATING...';

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });

        const data = await response.json();

        if (data.success) {
            registerForm.reset();
            showPage('login');
            document.getElementById('login-username').value = user;
            showError('✅ Account created successfully! Please login.');
        } else {
            showError(data.error || 'Registration failed', true);
        }
    } catch (error) {
        console.error('Registration error:', error);
        showError('Connection error. Please check if the server is running.', true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'CREATE ACCOUNT';
    }
});

// Logout
function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        // Cleanup intervals
        if (statusUpdateInterval) {
            clearInterval(statusUpdateInterval);
            statusUpdateInterval = null;
        }
        
        // Cleanup reconnect timeout
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        
        // Cleanup WebSocket
        if (ws) {
            // Unsubscribe before closing
            if (selectedServer && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'unsubscribe', serverName: selectedServer }));
            }
            ws.close();
            ws = null;
        }
        
        // Clear local storage and state
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        token = null;
        username = null;
        selectedServer = null;
        servers = [];
        reconnectAttempts = 0;
        
        showPage('login');
    }
}

logoutBtn.addEventListener('click', handleLogout);
logoutBtn2.addEventListener('click', handleLogout);

// ============================================
// SETTINGS MODAL
// ============================================

// Open settings modal
function openSettings() {
    settingsModal.classList.add('show');
    loadUserSettings();
}

// Close settings modal
function closeSettings() {
    settingsModal.classList.remove('show');
    // Reset forms
    changeUsernameForm.reset();
    changePasswordForm.reset();
}

settingsBtn.addEventListener('click', openSettings);
settingsBtn2.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettings);

// Close modal when clicking outside
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        closeSettings();
    }
});

// Show settings message (toast)
function showSettingsMessage(message, isError = false) {
    settingsMessage.textContent = message;
    settingsMessage.className = 'settings-toast show';
    if (isError) {
        settingsMessage.classList.add('error');
    }
    
    setTimeout(() => {
        settingsMessage.classList.remove('show');
        setTimeout(() => {
            settingsMessage.classList.remove('error');
        }, 300);
    }, 3000);
}

// Load user settings
async function loadUserSettings() {
    try {
        const response = await fetch('/api/settings/user', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            currentUsernameDisplay.textContent = data.user.username;
            document.getElementById('new-username').value = data.user.username;
        } else {
            currentUsernameDisplay.textContent = username;
            document.getElementById('new-username').value = username;
        }
    } catch (error) {
        console.error('Failed to load user settings:', error);
        currentUsernameDisplay.textContent = username;
        document.getElementById('new-username').value = username;
    }
}

// Change username
changeUsernameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newUsername = document.getElementById('new-username').value.trim();
    
    if (!newUsername) {
        showSettingsMessage('Username cannot be empty', true);
        return;
    }

    if (newUsername.length < 3) {
        showSettingsMessage('Username must be at least 3 characters', true);
        return;
    }

    if (newUsername === username) {
        showSettingsMessage('This is already your username', true);
        return;
    }

    const submitBtn = changeUsernameForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating...';

    try {
        const response = await fetch('/api/settings/username', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newUsername })
        });

        const data = await response.json();

        if (data.success) {
            // Update token and username
            token = data.token;
            username = data.username;
            localStorage.setItem('token', token);
            localStorage.setItem('username', username);
            
            // Update displays
            usernameDisplay.textContent = `👤 ${username}`;
            usernameDisplay2.textContent = `👤 ${username}`;
            currentUsernameDisplay.textContent = username;
            
            showSettingsMessage('✅ Username updated successfully!');
            
            // Reconnect WebSocket with new token
            if (ws) {
                ws.close();
                ws = null;
            }
            connectWebSocket();
        } else {
            showSettingsMessage(data.error || 'Failed to update username', true);
        }
    } catch (error) {
        console.error('Update username error:', error);
        showSettingsMessage('Connection error', true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update Username';
    }
});

// Change password
changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmNewPassword = document.getElementById('confirm-new-password').value;
    
    if (!currentPassword || !newPassword || !confirmNewPassword) {
        showSettingsMessage('Please fill in all fields', true);
        return;
    }

    if (newPassword.length < 6) {
        showSettingsMessage('New password must be at least 6 characters', true);
        return;
    }

    if (newPassword !== confirmNewPassword) {
        showSettingsMessage('New passwords do not match', true);
        return;
    }

    if (currentPassword === newPassword) {
        showSettingsMessage('New password must be different from current password', true);
        return;
    }

    const submitBtn = changePasswordForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating...';

    try {
        const response = await fetch('/api/settings/password', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await response.json();

        if (data.success) {
            showSettingsMessage('✅ Password updated successfully!');
            changePasswordForm.reset();
        } else {
            showSettingsMessage(data.error || 'Failed to update password', true);
        }
    } catch (error) {
        console.error('Update password error:', error);
        showSettingsMessage('Connection error', true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update Password';
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
            showError('Session expired. Please login again.');
            setTimeout(() => {
                handleLogout();
            }, 2000);
            return;
        }

        const data = await response.json();
        servers = data.servers || [];
        renderServers();
    } catch (error) {
        console.error('Failed to load servers:', error);
        serversGrid.innerHTML = '<p class="loading">❌ Failed to load servers. Check connection.</p>';
    }
}

function renderServers() {
    if (servers.length === 0) {
        serversGrid.innerHTML = '<p class="loading">📁 No servers found<br><small>Add server folders to minecraft-servers/</small></p>';
        return;
    }

    serversGrid.innerHTML = '';
    
    servers.forEach(server => {
        const serverCard = document.createElement('div');
        serverCard.className = 'server-card';

        const statusClass = server.status.running ? 'online' : 'offline';
        const statusText = server.status.running ? 'Online' : 'Offline';
        
        let uptimeText = '';
        if (server.status.running && server.status.uptime) {
            const seconds = Math.floor(server.status.uptime / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            
            if (hours > 0) {
                uptimeText = `⏱ ${hours}h ${minutes % 60}m uptime`;
            } else if (minutes > 0) {
                uptimeText = `⏱ ${minutes}m uptime`;
            } else {
                uptimeText = `⏱ ${seconds}s uptime`;
            }
        }

        serverCard.innerHTML = `
            <div class="server-card-header">
                <div class="server-card-name">🎮 ${server.name}</div>
            </div>
            <div class="server-card-status">
                <span class="status-badge ${statusClass}">● ${statusText}</span>
            </div>
            ${uptimeText ? `<div class="server-card-uptime">${uptimeText}</div>` : ''}
        `;

        serverCard.addEventListener('click', () => showConsolePage(server.name));
        serversGrid.appendChild(serverCard);
    });
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

// Back to dashboard
backToDashboardBtn.addEventListener('click', () => {
    showDashboard();
});

// ============================================
// SERVER CONSOLE
// ============================================

async function updateServerStatus() {
    if (!selectedServer) return;

    try {
        const response = await fetch(`/api/servers/${selectedServer}/status`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) return;

        const data = await response.json();
        
        if (data.status.running) {
            consoleServerStatus.textContent = '● Online';
            consoleServerStatus.className = 'status-badge online';
            startServerBtn.disabled = true;
            stopServerBtn.disabled = false;
            commandInput.disabled = false;
            sendCommandBtn.disabled = false;
            
            // Update uptime
            const seconds = Math.floor(data.status.uptime / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            
            if (hours > 0) {
                consoleServerUptime.textContent = `Uptime: ${hours}h ${minutes % 60}m`;
            } else if (minutes > 0) {
                consoleServerUptime.textContent = `Uptime: ${minutes}m ${seconds % 60}s`;
            } else {
                consoleServerUptime.textContent = `Uptime: ${seconds}s`;
            }
        } else {
            consoleServerStatus.textContent = '● Offline';
            consoleServerStatus.className = 'status-badge offline';
            consoleServerUptime.textContent = 'Uptime: 0s';
            startServerBtn.disabled = false;
            stopServerBtn.disabled = true;
            commandInput.disabled = true;
            sendCommandBtn.disabled = true;
        }
    } catch (error) {
        console.error('Failed to get server status:', error);
    }
}

async function loadConsoleHistory() {
    consoleOutput.textContent = '';
    appendToConsole(`[INFO] Connected to ${selectedServer}\n`);
    
    try {
        const response = await fetch(`/api/servers/${selectedServer}/logs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.logs && data.logs.length > 0) {
                data.logs.forEach(log => {
                    consoleOutput.textContent += log;
                });
                consoleOutput.scrollTop = consoleOutput.scrollHeight;
            } else {
                appendToConsole(`[INFO] Console output will appear here...\n\n`);
            }
        } else {
            appendToConsole(`[INFO] Console output will appear here...\n\n`);
        }
    } catch (error) {
        console.error('Failed to load console logs:', error);
        appendToConsole(`[INFO] Console output will appear here...\n\n`);
    }
}

// Start server
startServerBtn.addEventListener('click', async () => {
    if (!selectedServer) return;

    startServerBtn.disabled = true;
    startServerBtn.textContent = 'Starting...';

    try {
        const response = await fetch(`/api/servers/${selectedServer}/start`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        
        if (data.success) {
            appendToConsole('[INFO] ▶ Server starting...\n');
            setTimeout(() => {
                updateServerStatus();
                loadServers();
            }, 2000);
        } else {
            appendToConsole(`[ERROR] ❌ ${data.error}\n`);
        }
    } catch (error) {
        console.error('Start server error:', error);
        appendToConsole('[ERROR] ❌ Failed to start server\n');
    } finally {
        setTimeout(() => {
            startServerBtn.disabled = false;
            startServerBtn.textContent = 'Start';
        }, 2000);
    }
});

// Stop server
stopServerBtn.addEventListener('click', async () => {
    if (!selectedServer) return;
    
    if (!confirm(`Stop server "${selectedServer}"?`)) return;

    stopServerBtn.disabled = true;
    stopServerBtn.textContent = 'Stopping...';

    try {
        const response = await fetch(`/api/servers/${selectedServer}/stop`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        
        if (data.success) {
            appendToConsole('[INFO] ⏹ Stopping server...\n');
            setTimeout(() => {
                updateServerStatus();
                loadServers();
            }, 2000);
        } else {
            appendToConsole(`[ERROR] ❌ ${data.error}\n`);
        }
    } catch (error) {
        console.error('Stop server error:', error);
        appendToConsole('[ERROR] ❌ Failed to stop server\n');
    } finally {
        setTimeout(() => {
            stopServerBtn.disabled = false;
            stopServerBtn.textContent = 'Stop';
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
    
    commandHistory.push(command);
    if (commandHistory.length > 50) commandHistory.shift();
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
    // Strip ANSI color codes and special characters
    const cleanText = stripAnsiCodes(text);
    consoleOutput.textContent += cleanText;
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// Strip ANSI escape codes for clean console output
function stripAnsiCodes(text) {
    // Remove ANSI color codes (e.g., \u001b[0m, \u001b[31m, etc.)
    return text
        .replace(/\u001b\[[0-9;]*m/g, '')  // Remove color codes
        .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '') // Remove other ANSI sequences
        .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ''); // Remove other control characters except \n and \t
}

// ============================================
// STARTUP CONFIG
// ============================================

async function loadStartupConfig() {
    if (!selectedServer) return;

    try {
        const response = await fetch(`/api/servers/${selectedServer}/config`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        startupCommandInput.value = data.config.startupCommand;
    } catch (error) {
        console.error('Failed to load config:', error);
    }
}

saveStartupBtn.addEventListener('click', async () => {
    if (!selectedServer) return;

    const command = startupCommandInput.value.trim();
    
    if (!command) {
        alert('Startup command cannot be empty');
        return;
    }

    saveStartupBtn.disabled = true;
    saveStartupBtn.textContent = 'Saving...';

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
            appendToConsole('[INFO] ⚙️ Configuration updated successfully\n');
            alert('Configuration saved successfully!');
        } else {
            alert('Failed to update config: ' + data.error);
        }
    } catch (error) {
        console.error('Save config error:', error);
        alert('Failed to save configuration');
    } finally {
        saveStartupBtn.disabled = false;
        saveStartupBtn.textContent = 'Save Changes';
    }
});

// ============================================
// TABS
// ============================================

function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
}

function switchTab(tabId) {
    // Remove active class from all tabs and buttons
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    
    // Add active class to selected tab and button
    const selectedButton = document.querySelector(`[data-tab="${tabId}"]`);
    const selectedPane = document.getElementById(tabId);
    
    if (selectedButton) selectedButton.classList.add('active');
    if (selectedPane) selectedPane.classList.add('active');
}

// ============================================
// WEBSOCKET CONNECTION
// ============================================

function connectWebSocket() {
    // Don't create duplicate connections
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        console.log('⚠️ WebSocket already connected or connecting');
        return;
    }
    
    console.log('🔌 Connecting to WebSocket...');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('✅ WebSocket connected');
        reconnectAttempts = 0;
        
        // Authenticate
        ws.send(JSON.stringify({ type: 'auth', token }));
        
        // Subscribe to current server if on console page
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
                    console.error('❌ WebSocket authentication failed');
                    ws.close();
                } else {
                    console.log('✅ WebSocket authenticated');
                }
            } else if (data.type === 'console' && data.serverName === selectedServer) {
                appendToConsole(data.data);
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    };

    ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected', event.code, event.reason);
        ws = null;
        
        // Only attempt reconnect if user is still logged in and not at max attempts
        if (token && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            const delay = Math.min(3000 * reconnectAttempts, 15000); // Max 15 seconds
            console.log(`🔄 Reconnecting in ${delay/1000}s... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
            
            // Clear any existing reconnect timeout
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
            }
            
            reconnectTimeout = setTimeout(() => {
                if (token) {
                    connectWebSocket();
                }
            }, delay);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.error('❌ Max reconnection attempts reached');
            if (selectedServer) {
                appendToConsole('\n[ERROR] ❌ Connection lost. Please refresh the page.\n');
            }
        }
    };

    ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
    };
}

// ============================================
// CLEANUP
// ============================================

window.addEventListener('beforeunload', () => {
    // Clear interval
    if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
    }
    
    // Clear reconnect timeout
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
    }
    
    // Close WebSocket cleanly
    if (ws) {
        // Unsubscribe before closing
        if (selectedServer && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'unsubscribe', serverName: selectedServer }));
        }
        ws.close();
    }
});
