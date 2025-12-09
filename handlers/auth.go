package handlers

import (
	"html/template"
	"net/http"

	"minecraft-server-controller/config"
	"minecraft-server-controller/models"
)

// LoginPage renders the login page
func LoginPage(w http.ResponseWriter, r *http.Request) {
	// Check if user is already logged in
	session, _ := config.GetSessionStore().Get(r, "auth-session")
	if userID, ok := session.Values["user_id"].(uint); ok && userID != 0 {
		http.Redirect(w, r, "/dashboard", http.StatusSeeOther)
		return
	}

	// Check if any user exists in the database
	var count int64
	models.DB.Model(&models.User{}).Count(&count)
	
	// If no users exist, redirect to register page
	if count == 0 {
		http.Redirect(w, r, "/register", http.StatusSeeOther)
		return
	}

	tmpl, err := template.ParseFiles("templates/login.html")
	if err != nil {
		http.Error(w, "Error loading template", http.StatusInternalServerError)
		return
	}

	data := map[string]interface{}{
		"Error":   session.Flashes("error"),
		"Success": session.Flashes("success"),
	}
	session.Save(r, w)

	tmpl.Execute(w, data)
}

// Login handles user login
func Login(w http.ResponseWriter, r *http.Request) {
	// Parse form data
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Error parsing form", http.StatusBadRequest)
		return
	}

	username := r.FormValue("username")
	password := r.FormValue("password")

	// Validate credentials
	user, err := models.ValidateCredentials(username, password)
	if err != nil {
		session, _ := config.GetSessionStore().Get(r, "auth-session")
		session.AddFlash("Invalid username or password", "error")
		session.Save(r, w)
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}

	// Create session
	session, _ := config.GetSessionStore().Get(r, "auth-session")
	session.Values["user_id"] = user.ID
	session.Values["username"] = user.Username
	session.Save(r, w)

	// Redirect to dashboard
	http.Redirect(w, r, "/dashboard", http.StatusSeeOther)
}

// RegisterPage renders the register page
func RegisterPage(w http.ResponseWriter, r *http.Request) {
	// Check if user is already logged in
	session, _ := config.GetSessionStore().Get(r, "auth-session")
	if userID, ok := session.Values["user_id"].(uint); ok && userID != 0 {
		http.Redirect(w, r, "/dashboard", http.StatusSeeOther)
		return
	}

	// Check if any user already exists
	var count int64
	models.DB.Model(&models.User{}).Count(&count)
	
	// If user already exists, redirect to login (single user system)
	if count > 0 {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}

	tmpl, err := template.ParseFiles("templates/register.html")
	if err != nil {
		http.Error(w, "Error loading template", http.StatusInternalServerError)
		return
	}

	data := map[string]interface{}{
		"Error": session.Flashes("error"),
	}
	session.Save(r, w)

	tmpl.Execute(w, data)
}

// Register handles user registration
func Register(w http.ResponseWriter, r *http.Request) {
	// Check if any user already exists (single user system)
	var count int64
	models.DB.Model(&models.User{}).Count(&count)
	
	if count > 0 {
		session, _ := config.GetSessionStore().Get(r, "auth-session")
		session.AddFlash("Registration is disabled. An account already exists.", "error")
		session.Save(r, w)
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}

	// Parse form data
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Error parsing form", http.StatusBadRequest)
		return
	}

	username := r.FormValue("username")
	password := r.FormValue("password")
	confirmPassword := r.FormValue("confirm_password")

	// Get session for error messages
	session, _ := config.GetSessionStore().Get(r, "auth-session")

	// Validate inputs
	if username == "" || password == "" || confirmPassword == "" {
		session.AddFlash("All fields are required", "error")
		session.Save(r, w)
		http.Redirect(w, r, "/register", http.StatusSeeOther)
		return
	}

	if len(password) < 8 {
		session.AddFlash("Password must be at least 8 characters", "error")
		session.Save(r, w)
		http.Redirect(w, r, "/register", http.StatusSeeOther)
		return
	}

	if password != confirmPassword {
		session.AddFlash("Passwords do not match", "error")
		session.Save(r, w)
		http.Redirect(w, r, "/register", http.StatusSeeOther)
		return
	}

	// Create user
	_, err := models.CreateUser(username, password)
	if err != nil {
		session.AddFlash(err.Error(), "error")
		session.Save(r, w)
		http.Redirect(w, r, "/register", http.StatusSeeOther)
		return
	}

	// Add success message
	session.AddFlash("Account created successfully! Please login.", "success")
	session.Save(r, w)

	// Redirect to login page
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

// Logout handles user logout
func Logout(w http.ResponseWriter, r *http.Request) {
	// Clear session
	session, _ := config.GetSessionStore().Get(r, "auth-session")
	session.Values["user_id"] = uint(0)
	session.Values["username"] = ""
	session.Options.MaxAge = -1
	session.Save(r, w)

	// Redirect to login
	http.Redirect(w, r, "/", http.StatusSeeOther)
}