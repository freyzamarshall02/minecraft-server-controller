const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const EventEmitter = require('events');

const SERVERS_DIR = path.join(__dirname, '../minecraft-servers');
const CONFIG_FILE = path.join(__dirname, '../data/server-configs.json');

class ServerManager extends EventEmitter {
  constructor() {
    super();
    this.servers = new Map(); // serverName -> process info
    this.configs = {};
  }

  // Initialize server manager
  async initialize() {
    try {
      await this.ensureDirectories();
      await this.loadConfigs();
      console.log('Server manager initialized');
    } catch (error) {
      console.error('Failed to initialize server manager:', error);
    }
  }

  // Ensure required directories exist
  async ensureDirectories() {
    const dataDir = path.join(__dirname, '../data');
    
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
    }

    try {
      await fs.access(SERVERS_DIR);
    } catch {
      await fs.mkdir(SERVERS_DIR, { recursive: true });
      console.log(`Created minecraft-servers directory at: ${SERVERS_DIR}`);
    }
  }

  // Load server configurations
  async loadConfigs() {
    try {
      const data = await fs.readFile(CONFIG_FILE, 'utf8');
      this.configs = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.configs = {};
        await this.saveConfigs();
      } else {
        throw error;
      }
    }
  }

  // Save server configurations
  async saveConfigs() {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(this.configs, null, 2), 'utf8');
  }

  // Get all detected servers
  async getServers() {
    try {
      const entries = await fs.readdir(SERVERS_DIR, { withFileTypes: true });
      const servers = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const serverPath = path.join(SERVERS_DIR, entry.name);
          const hasServerJar = await this.hasServerJar(serverPath);
          
          if (hasServerJar) {
            const status = this.getServerStatus(entry.name);
            const config = this.configs[entry.name] || this.getDefaultConfig();
            
            servers.push({
              name: entry.name,
              path: serverPath,
              status: status,
              config: config
            });
          }
        }
      }

      return servers;
    } catch (error) {
      console.error('Error getting servers:', error);
      return [];
    }
  }

  // Check if directory has a server jar file
  async hasServerJar(serverPath) {
    try {
      const files = await fs.readdir(serverPath);
      // Look for common Minecraft server and proxy jar names
      return files.some(file => {
        const lowerFile = file.toLowerCase();
        return file.endsWith('.jar') && (
          lowerFile.includes('server') || 
          lowerFile.includes('forge') || 
          lowerFile.includes('paper') || 
          lowerFile.includes('spigot') ||
          lowerFile.includes('bukkit') ||
          lowerFile.includes('purpur') ||
          lowerFile.includes('velocity') ||
          lowerFile.includes('bungeecord') ||
          lowerFile.includes('waterfall') ||
          lowerFile.includes('fabric') ||
          lowerFile.includes('quilt') ||
          lowerFile.includes('mohist') ||
          lowerFile.includes('arclight') ||
          // Generic minecraft jar (catches most servers)
          lowerFile.includes('minecraft')
        );
      });
    } catch {
      return false;
    }
  }

  // Get default server configuration
  getDefaultConfig() {
    return {
      startupCommand: 'java -Xmx1024M -Xms1024M -jar server.jar nogui',
      autoRestart: false,
      maxMemory: '1024M',
      minMemory: '1024M'
    };
  }

  // Get server configuration
  async getServerConfig(serverName) {
    if (!this.configs[serverName]) {
      this.configs[serverName] = this.getDefaultConfig();
      await this.saveConfigs();
    }
    return this.configs[serverName];
  }

  // Update server configuration
  async updateServerConfig(serverName, startupCommand) {
    try {
      // Check if server exists
      const servers = await this.getServers();
      const serverExists = servers.some(s => s.name === serverName);
      
      if (!serverExists) {
        return { success: false, message: 'Server not found' };
      }

      this.configs[serverName] = {
        ...(this.configs[serverName] || this.getDefaultConfig()),
        startupCommand: startupCommand
      };

      await this.saveConfigs();
      return { success: true };
    } catch (error) {
      console.error('Error updating server config:', error);
      return { success: false, message: 'Failed to update config' };
    }
  }

  // NEW: Get server console logs
  getServerLogs(serverName) {
    const serverInfo = this.servers.get(serverName);
    
    if (!serverInfo) {
      return [];
    }
    
    return serverInfo.logs || [];
  }

  // Start a Minecraft server
  async startServer(serverName) {
    try {
      // Check if already running
      if (this.servers.has(serverName)) {
        return { success: false, message: 'Server is already running' };
      }

      // Get server path and config
      const serverPath = path.join(SERVERS_DIR, serverName);
      const config = await this.getServerConfig(serverName);

      // Check if server directory exists
      try {
        await fs.access(serverPath);
      } catch {
        return { success: false, message: 'Server directory not found' };
      }

      // Parse startup command
      const commandParts = config.startupCommand.split(' ');
      const command = commandParts[0];
      const args = commandParts.slice(1);

      // Spawn server process
      const serverProcess = spawn(command, args, {
        cwd: serverPath,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Store server info
      this.servers.set(serverName, {
        process: serverProcess,
        startTime: Date.now(),
        logs: []
      });

      // Handle stdout
      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        this.emit('console', serverName, output);
        
        // Store last 1000 lines
        const serverInfo = this.servers.get(serverName);
        if (serverInfo) {
          serverInfo.logs.push(output);
          if (serverInfo.logs.length > 1000) {
            serverInfo.logs.shift();
          }
        }
      });

      // Handle stderr
      serverProcess.stderr.on('data', (data) => {
        const output = data.toString();
        this.emit('console', serverName, `[ERROR] ${output}`);
      });

      // Handle process exit
      serverProcess.on('exit', (code) => {
        console.log(`Server ${serverName} exited with code ${code}`);
        this.servers.delete(serverName);
        this.emit('console', serverName, `\n[SERVER STOPPED] Exit code: ${code}\n`);
      });

      // Handle process error
      serverProcess.on('error', (error) => {
        console.error(`Server ${serverName} error:`, error);
        this.servers.delete(serverName);
        this.emit('console', serverName, `\n[ERROR] ${error.message}\n`);
      });

      console.log(`Started server: ${serverName}`);
      return { success: true, message: 'Server started successfully' };

    } catch (error) {
      console.error(`Error starting server ${serverName}:`, error);
      return { success: false, message: error.message };
    }
  }

  // Stop a Minecraft server
  async stopServer(serverName) {
    try {
      const serverInfo = this.servers.get(serverName);
      
      if (!serverInfo) {
        return { success: false, message: 'Server is not running' };
      }

      // Send stop command to server
      this.sendCommand(serverName, 'stop');

      // Wait for graceful shutdown (max 30 seconds)
      const timeout = setTimeout(() => {
        if (this.servers.has(serverName)) {
          console.log(`Force killing server ${serverName}`);
          serverInfo.process.kill('SIGKILL');
        }
      }, 30000);

      serverInfo.process.on('exit', () => {
        clearTimeout(timeout);
      });

      return { success: true, message: 'Stop command sent' };

    } catch (error) {
      console.error(`Error stopping server ${serverName}:`, error);
      return { success: false, message: error.message };
    }
  }

  // Send command to server
  sendCommand(serverName, command) {
    try {
      const serverInfo = this.servers.get(serverName);
      
      if (!serverInfo) {
        return { success: false, message: 'Server is not running' };
      }

      serverInfo.process.stdin.write(command + '\n');
      this.emit('console', serverName, `> ${command}\n`);
      
      return { success: true };

    } catch (error) {
      console.error(`Error sending command to ${serverName}:`, error);
      return { success: false, message: error.message };
    }
  }

  // Get server status
  getServerStatus(serverName) {
    const serverInfo = this.servers.get(serverName);
    
    if (!serverInfo) {
      return {
        running: false,
        uptime: 0
      };
    }

    return {
      running: true,
      uptime: Date.now() - serverInfo.startTime,
      pid: serverInfo.process.pid
    };
  }

  // Stop all servers (for graceful shutdown)
  stopAllServers() {
    console.log('Stopping all servers...');
    
    for (const [serverName, serverInfo] of this.servers.entries()) {
      try {
        this.sendCommand(serverName, 'stop');
        
        // Force kill after 10 seconds
        setTimeout(() => {
          if (this.servers.has(serverName)) {
            serverInfo.process.kill('SIGKILL');
          }
        }, 10000);
      } catch (error) {
        console.error(`Error stopping ${serverName}:`, error);
      }
    }
  }
}

// Create singleton instance
const serverManager = new ServerManager();

module.exports = serverManager;
