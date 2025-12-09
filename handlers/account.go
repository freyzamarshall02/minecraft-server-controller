package handlers

import (
	"html/template"
	"net/http"

	"minecraft-server-controller/config"
	"minecraft-server-controller/middleware"
	"minecraft-server-controller/models"
)

// AccountPage renders the account management page
func AccountPage(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	user, err := models.GetUserByID(userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	session, _ := config.GetSessionStore().Get(r, "auth-session")

	tmpl, err := template.ParseFiles("templates/account.html")
	if err != nil {
		http.Error(w, "Error loading template", http.StatusInternalServerError)
		return
	}

	data := map[string]interface{}{
		"User":    user,
		"Success": session.Flashes("success"),
		"Error":   session.Flashes("error"),
	}
	session.Save(r, w)

	tmpl.Execute(w, data)
}

// UpdateUsername handles username update
func UpdateUsername(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	user, err := models.GetUserByID(userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	// Parse form data
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Error parsing form", http.StatusBadRequest)
		return
	}

	newUsername := r.FormValue("username")

	// Get session for messages
	session, _ := config.GetSessionStore().Get(r, "auth-session")

	// Validate input
	if newUsername == "" {
		session.AddFlash("Username cannot be empty", "error")
		session.Save(r, w)
		http.Redirect(w, r, "/account", http.StatusSeeOther)
		return
	}

	if newUsername == user.Username {
		session.AddFlash("New username is the same as current username", "error")
		session.Save(r, w)
		http.Redirect(w, r, "/account", http.StatusSeeOther)
		return
	}

	// Update username
	if err := user.UpdateUsername(newUsername); err != nil {
		session.AddFlash(err.Error(), "error")
		session.Save(r, w)
		http.Redirect(w, r, "/account", http.StatusSeeOther)
		return
	}

	// Update session with new username
	session.Values["username"] = newUsername
	session.AddFlash("Username updated successfully", "success")
	session.Save(r, w)

	http.Redirect(w, r, "/account", http.StatusSeeOther)
}

// UpdatePassword handles password update
func UpdatePassword(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	user, err := models.GetUserByID(userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	// Parse form data
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Error parsing form", http.StatusBadRequest)
		return
	}

	currentPassword := r.FormValue("current_password")
	newPassword := r.FormValue("new_password")
	confirmPassword := r.FormValue("confirm_password")

	// Get session for messages
	session, _ := config.GetSessionStore().Get(r, "auth-session")

	// Validate inputs
	if currentPassword == "" || newPassword == "" || confirmPassword == "" {
		session.AddFlash("All password fields are required", "error")
		session.Save(r, w)
		http.Redirect(w, r, "/account", http.StatusSeeOther)
		return
	}

	if len(newPassword) < 8 {
		session.AddFlash("New password must be at least 8 characters", "error")
		session.Save(r, w)
		http.Redirect(w, r, "/account", http.StatusSeeOther)
		return
	}

	if newPassword != confirmPassword {
		session.AddFlash("New passwords do not match", "error")
		session.Save(r, w)
		http.Redirect(w, r, "/account", http.StatusSeeOther)
		return
	}

	if currentPassword == newPassword {
		session.AddFlash("New password must be different from current password", "error")
		session.Save(r, w)
		http.Redirect(w, r, "/account", http.StatusSeeOther)
		return
	}

	// Update password
	if err := user.UpdatePassword(currentPassword, newPassword); err != nil {
		session.AddFlash(err.Error(), "error")
		session.Save(r, w)
		http.Redirect(w, r, "/account", http.StatusSeeOther)
		return
	}

	session.AddFlash("Password updated successfully", "success")
	session.Save(r, w)

	http.Redirect(w, r, "/account", http.StatusSeeOther)
}