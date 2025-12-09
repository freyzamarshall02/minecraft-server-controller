// Main JavaScript for Minecraft Server Controller

// Form validation for register page
document.addEventListener('DOMContentLoaded', function() {
    // Password match validation on register page
    const registerForm = document.querySelector('form[action="/register"]');
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            const password = document.getElementById('password');
            const confirmPassword = document.getElementById('confirm_password');
            
            if (password.value !== confirmPassword.value) {
                e.preventDefault();
                alert('Passwords do not match!');
                confirmPassword.focus();
                return false;
            }
            
            if (password.value.length < 8) {
                e.preventDefault();
                alert('Password must be at least 8 characters long!');
                password.focus();
                return false;
            }
        });
    }

    // Password match validation on account page
    const updatePasswordForm = document.querySelector('form[action*="/account/update-password"]');
    if (updatePasswordForm) {
        updatePasswordForm.addEventListener('submit', function(e) {
            const newPassword = document.getElementById('new_password');
            const confirmPassword = document.getElementById('confirm_password');
            
            if (newPassword.value !== confirmPassword.value) {
                e.preventDefault();
                alert('New passwords do not match!');
                confirmPassword.focus();
                return false;
            }
            
            if (newPassword.value.length < 8) {
                e.preventDefault();
                alert('New password must be at least 8 characters long!');
                newPassword.focus();
                return false;
            }
        });
    }

    // Auto-hide alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(function(alert) {
        setTimeout(function() {
            alert.style.opacity = '0';
            alert.style.transition = 'opacity 0.5s';
            setTimeout(function() {
                alert.remove();
            }, 500);
        }, 5000);
    });

    // Confirm logout
    const logoutLinks = document.querySelectorAll('a[href="/logout"]');
    logoutLinks.forEach(function(link) {
        link.addEventListener('click', function(e) {
            if (!confirm('Are you sure you want to logout?')) {
                e.preventDefault();
            }
        });
    });

    // Real-time server status refresh on dashboard
    const serverCards = document.querySelectorAll('.server-card');
    if (serverCards.length > 0) {
        // Refresh server status every 30 seconds
        setInterval(function() {
            location.reload();
        }, 30000);
    }

    // Console auto-scroll to bottom on new messages
    const consoleOutput = document.getElementById('console');
    if (consoleOutput) {
        // Keep console scrolled to bottom
        const observer = new MutationObserver(function() {
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        });
        
        observer.observe(consoleOutput, {
            childList: true,
            subtree: true
        });
    }

    // Command history for console
    const commandInput = document.getElementById('commandInput');
    if (commandInput) {
        let commandHistory = [];
        let historyIndex = -1;

        commandInput.addEventListener('keydown', function(e) {
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
            } else if (e.key === 'Enter' && commandInput.value.trim() !== '') {
                // Add to history
                commandHistory.push(commandInput.value.trim());
                if (commandHistory.length > 50) {
                    commandHistory.shift(); // Keep only last 50 commands
                }
                historyIndex = -1;
            }
        });
    }

    // Loading state for buttons
    const forms = document.querySelectorAll('form');
    forms.forEach(function(form) {
        form.addEventListener('submit', function() {
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                const originalText = submitBtn.textContent;
                submitBtn.textContent = 'Loading...';
                
                // Re-enable after 3 seconds in case of error
                setTimeout(function() {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                }, 3000);
            }
        });
    });

    // Server control button feedback
    const controlButtons = document.querySelectorAll('.server-controls .btn');
    controlButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
            this.disabled = true;
            const originalText = this.innerHTML;
            this.innerHTML = '<span>⏳</span>';
            
            setTimeout(function() {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }, 2000);
        });
    });

    // Textarea auto-resize for startup command
    const startupTextarea = document.querySelector('textarea[name="command"]');
    if (startupTextarea) {
        startupTextarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
        // Trigger on load
        startupTextarea.dispatchEvent(new Event('input'));
    }

    // Path validation helper
    const pathInput = document.querySelector('input[name="path"]');
    if (pathInput) {
        pathInput.addEventListener('blur', function() {
            const path = this.value.trim();
            if (path && !path.startsWith('/')) {
                // Relative paths might be intentional, but warn user
                if (!confirm('This appears to be a relative path. Are you sure this is correct?')) {
                    this.focus();
                }
            }
        });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + K to focus command input
        if ((e.ctrlKey || e.metaKey) && e.key === 'k' && commandInput) {
            e.preventDefault();
            commandInput.focus();
        }
    });

    // Responsive sidebar toggle for mobile
    if (window.innerWidth <= 768) {
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');
        
        if (sidebar && mainContent) {
            mainContent.addEventListener('click', function() {
                sidebar.style.display = 'none';
            });
        }
    }

    // Add visual feedback for server cards
    serverCards.forEach(function(card) {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-4px) scale(1.02)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });
});

// Utility function for API calls with error handling
function apiCall(url, method = 'POST', data = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    };
    
    if (data && method === 'POST') {
        options.body = data;
    }
    
    return fetch(url, options)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .catch(error => {
            console.error('API Error:', error);
            alert('An error occurred. Please try again.');
            throw error;
        });
}

// Console log styling
console.log('%c🎮 Minecraft Server Controller', 'color: #60a5fa; font-size: 20px; font-weight: bold;');
console.log('%cWelcome to the console!', 'color: #94a3b8; font-size: 14px;');