package main

import (
	"log"
	"net/http"
	"minecraft-server-controller/config"
	"minecraft-server-controller/handlers"
	"minecraft-server-controller/middleware"
	"minecraft-server-controller/models"

	"github.com/gorilla/mux"
)

func main() {
	// Initialize database
	models.InitDatabase()

	// Initialize configuration
	config.Init()

	// Create router
	r := mux.NewRouter()

	// Serve static files
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("./static"))))

	// Public routes (no authentication required)
	r.HandleFunc("/", handlers.LoginPage).Methods("GET")
	r.HandleFunc("/login", handlers.Login).Methods("POST")
	r.HandleFunc("/register", handlers.RegisterPage).Methods("GET")
	r.HandleFunc("/register", handlers.Register).Methods("POST")

	// Protected routes (authentication required)
	protected := r.PathPrefix("/").Subrouter()
	protected.Use(middleware.AuthMiddleware)

	// Dashboard
	protected.HandleFunc("/dashboard", handlers.Dashboard).Methods("GET")

	// Account management
	protected.HandleFunc("/account", handlers.AccountPage).Methods("GET")
	protected.HandleFunc("/account/update-username", handlers.UpdateUsername).Methods("POST")
	protected.HandleFunc("/account/update-password", handlers.UpdatePassword).Methods("POST")

	// Settings
	protected.HandleFunc("/settings", handlers.SettingsPage).Methods("GET")
	protected.HandleFunc("/settings/update-path", handlers.UpdateServerPath).Methods("POST")

	// Server management
	protected.HandleFunc("/server/{name}", handlers.ServerConsolePage).Methods("GET")
	protected.HandleFunc("/server/{name}/start", handlers.StartServer).Methods("POST")
	protected.HandleFunc("/server/{name}/stop", handlers.StopServer).Methods("POST")
	protected.HandleFunc("/server/{name}/restart", handlers.RestartServer).Methods("POST")
	protected.HandleFunc("/server/{name}/command", handlers.SendCommand).Methods("POST")
	protected.HandleFunc("/server/{name}/logs", handlers.GetLogs).Methods("GET")
	protected.HandleFunc("/server/{name}/ws", handlers.ConsoleWebSocket).Methods("GET")

	// Startup management
	protected.HandleFunc("/server/{name}/startup", handlers.StartupPage).Methods("GET")
	protected.HandleFunc("/server/{name}/startup/update", handlers.UpdateStartup).Methods("POST")

	// Files (Coming Soon)
	protected.HandleFunc("/server/{name}/files", handlers.FilesPage).Methods("GET")

	// Logout
	protected.HandleFunc("/logout", handlers.Logout).Methods("GET")

	// Start server
	log.Println("🚀 Minecraft Server Controller starting on http://localhost:6767")
	log.Fatal(http.ListenAndServe(":6767", r))
}