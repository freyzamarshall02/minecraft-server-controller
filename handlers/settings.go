package handlers

import (
	"html/template"
	"net/http"
	"os"

	"minecraft-server-controller/config"
	"minecraft-server-controller/middleware"
	"minecraft-server-controller/models"
)

// SettingsPage renders the settings page
func SettingsPage(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	user, err := models.GetUserByID(userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	session, _ := config.GetSessionStore().Get(r, "auth-session")

	tmpl, err := template.ParseFiles("templates/settings.html")
	if err != nil {
		http.Error(w, "Error loading template", http.StatusInternalServerError)
		return
	}

	data := map[string]interface{}{
		"User":        user,
		"CurrentPath": config.GetServerPath(),
		"Success":     session.Flashes("success"),
		"Error":       session.Flashes("error"),
	}
	session.Save(r, w)

	tmpl.Execute(w, data)
}

// UpdateServerPath handles server folder path update
func UpdateServerPath(w http.ResponseWriter, r *http.Request) {
	// Parse form data
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Error parsing form", http.StatusBadRequest)
		return
	}

	path := r.FormValue("path")

	// Get session for messages
	session, _ := config.GetSessionStore().Get(r, "auth-session")

	// Validate input
	if path == "" {
		session.AddFlash("Path cannot be empty", "error")
		session.Save(r, w)
		http.Redirect(w, r, "/settings", http.StatusSeeOther)
		return
	}

	// Check if path exists
	if _, err := os.Stat(path); os.IsNotExist(err) {
		session.AddFlash("Path does not exist", "error")
		session.Save(r, w)
		http.Redirect(w, r, "/settings", http.StatusSeeOther)
		return
	}

	// Check if path is a directory
	fileInfo, err := os.Stat(path)
	if err != nil {
		session.AddFlash("Error accessing path: "+err.Error(), "error")
		session.Save(r, w)
		http.Redirect(w, r, "/settings", http.StatusSeeOther)
		return
	}

	if !fileInfo.IsDir() {
		session.AddFlash("Path must be a directory", "error")
		session.Save(r, w)
		http.Redirect(w, r, "/settings", http.StatusSeeOther)
		return
	}

	// Update configuration
	if err := config.UpdateServerPath(path); err != nil {
		session.AddFlash("Error updating path: "+err.Error(), "error")
		session.Save(r, w)
		http.Redirect(w, r, "/settings", http.StatusSeeOther)
		return
	}

	session.AddFlash("Server folder path updated successfully", "success")
	session.Save(r, w)

	http.Redirect(w, r, "/settings", http.StatusSeeOther)
}