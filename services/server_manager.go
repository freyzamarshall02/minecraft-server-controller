package services

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"log"
	"os/exec"
	"strings"
	"sync"
	"time"

	"minecraft-server-controller/models"

	"github.com/gorilla/websocket"
)

// ServerProcess holds the running server process information
type ServerProcess struct {
	Server  *models.Server
	Cmd     *exec.Cmd
	Stdin   io.WriteCloser
	Stdout  io.ReadCloser
	Stderr  io.ReadCloser
	Logs    []string
	LogMux  sync.Mutex
	Clients []*websocket.Conn
	ClientMux sync.Mutex
}

var (
	runningServers = make(map[uint]*ServerProcess)
	serverMux      sync.Mutex
)

// StartServer starts a Minecraft server
func StartServer(server *models.Server) error {
	serverMux.Lock()
	defer serverMux.Unlock()

	// Check if server is already running
	if _, exists := runningServers[server.ID]; exists {
		return errors.New("server is already running")
	}

	// Parse startup command
	parts := strings.Fields(server.StartupCommand)
	if len(parts) == 0 {
		return errors.New("invalid startup command")
	}

	// Create command
	cmd := exec.Command(parts[0], parts[1:]...)
	cmd.Dir = server.FolderPath

	// Get stdin, stdout, stderr pipes
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	// Start the process
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start server: %w", err)
	}

	// Create server process
	sp := &ServerProcess{
		Server:  server,
		Cmd:     cmd,
		Stdin:   stdin,
		Stdout:  stdout,
		Stderr:  stderr,
		Logs:    make([]string, 0),
		Clients: make([]*websocket.Conn, 0),
	}

	runningServers[server.ID] = sp

	// Update server status
	server.SetStatus("online")

	// Start reading output
	go sp.readOutput(stdout, false)
	go sp.readOutput(stderr, true)

	// Monitor process
	go sp.monitorProcess()

	log.Printf("Server '%s' started successfully", server.Name)
	return nil
}

// StopServer stops a running Minecraft server
func StopServer(server *models.Server) error {
	serverMux.Lock()
	defer serverMux.Unlock()

	sp, exists := runningServers[server.ID]
	if !exists {
		return errors.New("server is not running")
	}

	// Send stop command to server
	if sp.Stdin != nil {
		sp.Stdin.Write([]byte("stop\n"))
	}

	// Wait for graceful shutdown (with timeout)
	done := make(chan error, 1)
	go func() {
		done <- sp.Cmd.Wait()
	}()

	select {
	case <-done:
		// Process stopped gracefully
	case <-timeoutAfter(30):
		// Force kill if not stopped after 30 seconds
		if sp.Cmd.Process != nil {
			sp.Cmd.Process.Kill()
		}
	}

	// Clean up
	delete(runningServers, server.ID)
	server.SetStatus("offline")

	log.Printf("Server '%s' stopped", server.Name)
	return nil
}

// RestartServer restarts a Minecraft server
func RestartServer(server *models.Server) error {
	// Stop the server
	if err := StopServer(server); err != nil {
		// If server is not running, just start it
		if err.Error() == "server is not running" {
			return StartServer(server)
		}
		return err
	}

	// Wait a moment before restarting
	time.Sleep(2 * time.Second)

	// Start the server
	return StartServer(server)
}

// SendCommand sends a command to the server console
func SendCommand(server *models.Server, command string) error {
	serverMux.Lock()
	sp, exists := runningServers[server.ID]
	serverMux.Unlock()

	if !exists {
		return errors.New("server is not running")
	}

	if sp.Stdin == nil {
		return errors.New("server stdin is not available")
	}

	// Write command to stdin
	_, err := sp.Stdin.Write([]byte(command + "\n"))
	if err != nil {
		return fmt.Errorf("failed to send command: %w", err)
	}

	return nil
}

// GetLogs returns the server logs
func GetLogs(server *models.Server) []string {
	serverMux.Lock()
	sp, exists := runningServers[server.ID]
	serverMux.Unlock()

	if !exists {
		return []string{}
	}

	sp.LogMux.Lock()
	defer sp.LogMux.Unlock()

	// Return copy of logs
	logs := make([]string, len(sp.Logs))
	copy(logs, sp.Logs)
	return logs
}

// AddConsoleListener adds a WebSocket client to receive console updates
func AddConsoleListener(server *models.Server, conn *websocket.Conn) {
	serverMux.Lock()
	sp, exists := runningServers[server.ID]
	serverMux.Unlock()

	if !exists {
		return
	}

	sp.ClientMux.Lock()
	defer sp.ClientMux.Unlock()

	sp.Clients = append(sp.Clients, conn)

	// Send existing logs to new client
	sp.LogMux.Lock()
	for _, log := range sp.Logs {
		conn.WriteMessage(websocket.TextMessage, []byte(log))
	}
	sp.LogMux.Unlock()
}

// RemoveConsoleListener removes a WebSocket client
func RemoveConsoleListener(server *models.Server, conn *websocket.Conn) {
	serverMux.Lock()
	sp, exists := runningServers[server.ID]
	serverMux.Unlock()

	if !exists {
		return
	}

	sp.ClientMux.Lock()
	defer sp.ClientMux.Unlock()

	for i, client := range sp.Clients {
		if client == conn {
			sp.Clients = append(sp.Clients[:i], sp.Clients[i+1:]...)
			break
		}
	}
}

// readOutput reads from stdout/stderr and broadcasts to clients
func (sp *ServerProcess) readOutput(reader io.ReadCloser, isError bool) {
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		line := scanner.Text()
		
		// Strip ANSI color codes
		line = stripAnsiCodes(line)

		// Add to logs
		sp.LogMux.Lock()
		sp.Logs = append(sp.Logs, line)
		// Keep only last 1000 lines
		if len(sp.Logs) > 1000 {
			sp.Logs = sp.Logs[len(sp.Logs)-1000:]
		}
		sp.LogMux.Unlock()

		// Broadcast to WebSocket clients
		sp.ClientMux.Lock()
		for _, client := range sp.Clients {
			err := client.WriteMessage(websocket.TextMessage, []byte(line))
			if err != nil {
				// Client disconnected, will be removed later
			}
		}
		sp.ClientMux.Unlock()
	}
}

// stripAnsiCodes removes ANSI escape sequences from text
func stripAnsiCodes(text string) string {
	// Remove ANSI color codes like [38;2;255;170;0m and [0m
	result := ""
	inEscape := false
	
	for i := 0; i < len(text); i++ {
		if text[i] == 0x1B && i+1 < len(text) && text[i+1] == '[' {
			// Start of ANSI sequence
			inEscape = true
			i++ // Skip the '['
			continue
		}
		
		if inEscape {
			// Skip until we find 'm' (end of color code)
			if text[i] == 'm' {
				inEscape = false
			}
			continue
		}
		
		result += string(text[i])
	}
	
	return result
}

// monitorProcess monitors the server process and updates status
func (sp *ServerProcess) monitorProcess() {
	sp.Cmd.Wait()

	// Process has stopped
	serverMux.Lock()
	delete(runningServers, sp.Server.ID)
	serverMux.Unlock()

	sp.Server.SetStatus("offline")

	// Notify all WebSocket clients that server is offline
	sp.ClientMux.Lock()
	for _, client := range sp.Clients {
		client.WriteMessage(websocket.TextMessage, []byte("\n=== Server stopped ===\n"))
		client.Close()
	}
	sp.Clients = []*websocket.Conn{}
	sp.ClientMux.Unlock()

	log.Printf("Server '%s' process ended", sp.Server.Name)
}

// timeoutAfter creates a timeout channel
func timeoutAfter(seconds int) <-chan struct{} {
	timeout := make(chan struct{})
	go func() {
		time.Sleep(time.Duration(seconds) * time.Second)
		close(timeout)
	}()
	return timeout
}

// IsServerRunning checks if a server is currently running
func IsServerRunning(server *models.Server) bool {
	serverMux.Lock()
	defer serverMux.Unlock()

	_, exists := runningServers[server.ID]
	return exists
}