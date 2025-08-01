// DOM Elements
const splashScreen = document.getElementById('splashScreen');
const mainApp = document.getElementById('mainApp');
const loginToggle = document.getElementById('loginToggle');
const signupToggle = document.getElementById('signupToggle');
const toggleIndicator = document.querySelector('.toggle-indicator');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const messageContainer = document.getElementById('messageContainer');
const messageElement = document.getElementById('message');

// Password toggles
const loginPasswordToggle = document.getElementById('loginPasswordToggle');
const signupPasswordToggle = document.getElementById('signupPasswordToggle');
const loginPasswordInput = document.getElementById('loginPassword');
const signupPasswordInput = document.getElementById('signupPassword');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    setupFormValidation();
    setupPasswordToggles();
    setupButtonRipples();
    setupInputInteractions();
    generateParticles();
    enhanceAccessibility();
});

// App initialization
function initializeApp() {
    // Hide main app initially
    mainApp.style.display = 'block';
    
    // Show splash screen for 4 seconds
    setTimeout(() => {
        splashScreen.classList.add('fade-out');
        setTimeout(() => {
            splashScreen.style.display = 'none';
            mainApp.classList.add('show');
        }, 1000);
    }, 4000);
}

// Event listeners setup
function setupEventListeners() {
    // Form toggle buttons
    loginToggle.addEventListener('click', () => switchToForm('login'));
    signupToggle.addEventListener('click', () => switchToForm('signup'));
    
    // Form submissions
    loginForm.addEventListener('submit', handleLoginSubmit);
    signupForm.addEventListener('submit', handleSignupSubmit);
}

// Setup comprehensive input interactions for all forms
function setupInputInteractions() {
    const inputs = document.querySelectorAll('.form-input');
    
    inputs.forEach(input => {
        // Focus events
        input.addEventListener('focus', function(e) {
            handleInputFocus(e);
            animateLabel(this, true);
        });
        
        // Blur events
        input.addEventListener('blur', function(e) {
            handleInputBlur(e);
            if (!this.value) {
                animateLabel(this, false);
            }
        });
        
        // Input change events
        input.addEventListener('input', function(e) {
            handleInputChange(e);
            validateFieldRealTime(this);
        });
        
        // Initialize labels for pre-filled inputs
        if (input.value) {
            animateLabel(input, true);
        }
    });
}

// Enhanced label animation function
function animateLabel(input, isActive) {
    const label = input.nextElementSibling;
    
    if (isActive || input.value) {
        label.style.transform = 'translateY(-35px) scale(0.85)';
        label.style.color = '#00d4ff';
    } else {
        label.style.transform = 'translateY(0) scale(1)';
        label.style.color = 'rgba(255, 255, 255, 0.6)';
    }
}

// Switch between login and signup forms
function switchToForm(formType) {
    if (formType === 'login') {
        loginToggle.classList.add('active');
        signupToggle.classList.remove('active');
        toggleIndicator.classList.remove('signup');
        loginForm.classList.add('active');
        signupForm.classList.remove('active');
    } else {
        signupToggle.classList.add('active');
        loginToggle.classList.remove('active');
        toggleIndicator.classList.add('signup');
        signupForm.classList.add('active');
        loginForm.classList.remove('active');
    }

    // Hide any existing messages
    hideMessage();

    // Clear all field errors
    clearAllFieldErrors();
}

// Enhanced form submission handlers with proper validation
// Replace the handleLoginSubmit function
function handleLoginSubmit(e) {
    e.preventDefault();

    const username = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    // Clear previous errors
    clearFormErrors(loginForm);

    let hasErrors = false;

    // Validate inputs
    if (!username) {
        showFieldError(document.getElementById('loginEmail'), 'Username is required');
        hasErrors = true;
    }

    if (!password) {
        showFieldError(document.getElementById('loginPassword'), 'Password is required');
        hasErrors = true;
    }

    if (hasErrors) {
        showMessage('Please fix the errors below', 'error');
        return;
    }

    // Show loading state
    const submitBtn = loginForm.querySelector('.auth-btn');
    showLoadingState(submitBtn);

    // Send login request to Flask backend
    fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            'username': username,
            'password': password
        })
    })
    .then(response => {
        if (response.redirected) {
            window.location.href = response.url;
            return;
        }
        return response.text();
    })
    .then(html => {
        if (html && html.includes('error')) {
            // Extract error message from response
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const errorMsg = doc.querySelector('.error')?.textContent || 'Invalid credentials';
            showMessage(errorMsg, 'error');
        }
        resetLoadingState(submitBtn);
    })
    .catch(error => {
        showMessage('Connection error. Please try again.', 'error');
        resetLoadingState(submitBtn);
    });
}

// Replace the handleSignupSubmit function
function handleSignupSubmit(e) {
    e.preventDefault();

    const username = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const agreeTerms = signupForm.querySelector('.form-checkbox').checked;

    // Clear previous errors
    clearFormErrors(signupForm);

    let hasErrors = false;

    if (!username) {
        showFieldError(document.getElementById('signupEmail'), 'Username is required');
        hasErrors = true;
    }

    if (!password) {
        showFieldError(document.getElementById('signupPassword'), 'Password is required');
        hasErrors = true;
    } else if (password.length < 6) {
        showFieldError(document.getElementById('signupPassword'), 'Password must be at least 6 characters');
        hasErrors = true;
    }

    if (!confirmPassword) {
        showFieldError(document.getElementById('confirmPassword'), 'Please confirm your password');
        hasErrors = true;
    } else if (password !== confirmPassword) {
        showFieldError(document.getElementById('confirmPassword'), 'Passwords do not match');
        hasErrors = true;
    }

    if (!agreeTerms) {
        showMessage('Please agree to the Terms & Conditions', 'error');
        hasErrors = true;
    }

    if (hasErrors) {
        showMessage('Please fix the errors below', 'error');
        return;
    }

    // Show loading state
    const submitBtn = signupForm.querySelector('.auth-btn');
    showLoadingState(submitBtn);

    // Send signup request to Flask backend
    fetch('/signup', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            'username': username,
            'password': password
        })
    })
    .then(response => {
        if (response.redirected) {
            window.location.href = response.url;
            return;
        }
        return response.text();
    })
    .then(html => {
        if (html && html.includes('error')) {
            // Extract error message from response
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const errorMsg = doc.querySelector('.error')?.textContent || 'Username already exists';
            showMessage(errorMsg, 'error');
        }
        resetLoadingState(submitBtn);
    })
    .catch(error => {
        showMessage('Connection error. Please try again.', 'error');
        resetLoadingState(submitBtn);
    });
}

// Email validation
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Enhanced field error handling
function showFieldError(input, message) {
    const inputGroup = input.closest('.input-group');
    
    // Remove existing error
    hideFieldError(inputGroup);
    
    // Add error styling to input
    input.style.borderColor = '#ff6347';
    input.style.boxShadow = '0 0 15px rgba(255, 99, 71, 0.3)';
    
    // Create error message element
    const errorElement = document.createElement('div');
    errorElement.className = 'field-error';
    errorElement.style.cssText = `
        color: #ff6347;
        font-size: 0.8rem;
        margin-top: 0.5rem;
        opacity: 0;
        transform: translateY(-10px);
        transition: all 0.3s ease;
        font-weight: 500;
    `;
    errorElement.textContent = message;
    
    inputGroup.appendChild(errorElement);
    
    // Animate in
    setTimeout(() => {
        errorElement.style.opacity = '1';
        errorElement.style.transform = 'translateY(0)';
    }, 50);
}

function hideFieldError(inputGroup) {
    const input = inputGroup.querySelector('.form-input');
    const errorElement = inputGroup.querySelector('.field-error');
    
    // Reset input styling
    input.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    input.style.boxShadow = 'none';
    
    // Remove error message
    if (errorElement) {
        errorElement.style.opacity = '0';
        errorElement.style.transform = 'translateY(-10px)';
        setTimeout(() => {
            errorElement.remove();
        }, 300);
    }
}

function clearFormErrors(form) {
    const inputGroups = form.querySelectorAll('.input-group');
    inputGroups.forEach(hideFieldError);
}

function clearAllFieldErrors() {
    const inputGroups = document.querySelectorAll('.input-group');
    inputGroups.forEach(hideFieldError);
}

// Real-time validation
function validateFieldRealTime(input) {
    const inputGroup = input.closest('.input-group');
    let isValid = true;
    let errorMessage = '';
    
    // Clear existing error styling
    const value = input.value.trim();
    
    // Only validate if field has content (to avoid annoying users while typing)
    if (value) {
        // Email validation
        if (input.type === 'email' && !isValidEmail(value)) {
            isValid = false;
            errorMessage = 'Please enter a valid email address';
        }
        
        // Password validation
        if (input.type === 'password' && input.id !== 'confirmPassword' && value.length < 6) {
            isValid = false;
            errorMessage = 'Password must be at least 6 characters';
        }
        
        // Confirm password validation
        if (input.id === 'confirmPassword') {
            const password = document.getElementById('signupPassword').value;
            if (value && value !== password) {
                isValid = false;
                errorMessage = 'Passwords do not match';
            }
        }
        
        // Apply validation styling
        if (!isValid) {
            input.style.borderColor = '#ff6347';
            input.style.boxShadow = '0 0 10px rgba(255, 99, 71, 0.3)';
        } else {
            input.style.borderColor = '#00d4ff';
            input.style.boxShadow = '0 0 15px rgba(0, 212, 255, 0.2)';
        }
    } else {
        // Reset styling for empty fields
        input.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        input.style.boxShadow = 'none';
    }
}

// Message display functions
function showMessage(text, type) {
    messageElement.textContent = text;
    messageElement.className = `message ${type}`;
    messageContainer.classList.add('show');
    
    // Auto-hide after 5 seconds
    setTimeout(hideMessage, 5000);
}

function hideMessage() {
    messageContainer.classList.remove('show');
}

// Loading state for buttons
function showLoadingState(button) {
    const btnText = button.querySelector('.btn-text');
    btnText.textContent = 'Processing...';
    button.disabled = true;
    button.style.opacity = '0.7';
}

function resetLoadingState(button) {
    const btnText = button.querySelector('.btn-text');
    const isLogin = button.closest('.login-form');
    btnText.textContent = isLogin ? 'Sign In' : 'Create Account';
    button.disabled = false;
    button.style.opacity = '1';
}

// Input handling for floating labels and glow effects
function handleInputFocus(e) {
    const inputGroup = e.target.closest('.input-group');
    const glowElement = inputGroup.querySelector('.input-glow');
    
    inputGroup.classList.add('focused');
    
    // Activate glow effect
    if (glowElement) {
        glowElement.style.opacity = '0.15';
    }
    
    // Add focus border glow
    e.target.style.borderColor = '#00d4ff';
    e.target.style.boxShadow = '0 0 20px rgba(0, 212, 255, 0.3)';
}

function handleInputBlur(e) {
    const inputGroup = e.target.closest('.input-group');
    const glowElement = inputGroup.querySelector('.input-glow');
    
    if (!e.target.value) {
        inputGroup.classList.remove('focused');
    }
    
    // Deactivate glow effect
    if (glowElement) {
        glowElement.style.opacity = '0';
    }
    
    // Reset border unless there's an error
    if (!inputGroup.querySelector('.field-error')) {
        e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        e.target.style.boxShadow = 'none';
    }
}

function handleInputChange(e) {
    const input = e.target;
    animateLabel(input, input.value.length > 0);
}

// Password visibility toggles
function setupPasswordToggles() {
    if (loginPasswordToggle) {
        loginPasswordToggle.addEventListener('click', () => {
            togglePasswordVisibility(loginPasswordInput, loginPasswordToggle);
        });
    }
    
    if (signupPasswordToggle) {
        signupPasswordToggle.addEventListener('click', () => {
            togglePasswordVisibility(signupPasswordInput, signupPasswordToggle);
        });
    }
}

function togglePasswordVisibility(input, toggle) {
    const eyeIcon = toggle.querySelector('.eye-icon');
    
    if (input.type === 'password') {
        input.type = 'text';
        eyeIcon.textContent = '🙈';
        toggle.style.color = '#00d4ff';
    } else {
        input.type = 'password';
        eyeIcon.textContent = '👁';
        toggle.style.color = 'rgba(255, 255, 255, 0.6)';
    }
}

// Button ripple effects
function setupButtonRipples() {
    const buttons = document.querySelectorAll('.auth-btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = this.querySelector('.btn-ripple');
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            ripple.style.transform = 'translate(-50%, -50%)';
            
            // Reset ripple after animation
            setTimeout(() => {
                ripple.style.width = '0';
                ripple.style.height = '0';
            }, 300);
        });
    });
}

// Generate floating particles
function generateParticles() {
    const particleContainer = document.querySelector('.particles-bg');
    const particleCount = 15;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'floating-particle';
        particle.style.cssText = `
            position: absolute;
            width: ${Math.random() * 6 + 2}px;
            height: ${Math.random() * 6 + 2}px;
            background: rgba(0, 212, 255, ${Math.random() * 0.8 + 0.2});
            border-radius: 50%;
            left: ${Math.random() * 100}%;
            animation: floatParticles ${Math.random() * 10 + 8}s linear infinite;
            animation-delay: ${Math.random() * 5}s;
            box-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
        `;
        
        particleContainer.appendChild(particle);
    }
}

// Form validation enhancement
function setupFormValidation() {
    // This is now handled in setupInputInteractions for better organization
}

// Keyboard navigation enhancement
document.addEventListener('keydown', function(e) {
    // Enter key to switch forms or submit
    if (e.key === 'Enter') {
        const activeElement = document.activeElement;
        
        if (activeElement === loginToggle) {
            switchToForm('login');
        } else if (activeElement === signupToggle) {
            switchToForm('signup');
        }
    }
    
    // Escape key to clear messages
    if (e.key === 'Escape') {
        hideMessage();
    }
});

// Add smooth scroll behavior and focus management
function enhanceAccessibility() {
    // Add focus indicators
    const focusableElements = document.querySelectorAll('input, button, a, [tabindex]');
    
    focusableElements.forEach(element => {
        element.addEventListener('focus', function() {
            if (!this.closest('.input-group')) {
                this.style.outline = '2px solid #00d4ff';
                this.style.outlineOffset = '2px';
            }
        });
        
        element.addEventListener('blur', function() {
            if (!this.closest('.input-group')) {
                this.style.outline = 'none';
            }
        });
    });
}

// Add dynamic background effects based on user interaction
let interactionCount = 0;

document.addEventListener('click', function(e) {
    interactionCount++;
    
    if (interactionCount % 5 === 0) {
        createClickEffect(e.clientX, e.clientY);
    }
});

function createClickEffect(x, y) {
    const effect = document.createElement('div');
    effect.className = 'click-effect';
    effect.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: 20px;
        height: 20px;
        background: radial-gradient(circle, #00d4ff 0%, transparent 70%);
        border-radius: 50%;
        transform: translate(-50%, -50%);
        animation: clickEffectAnim 1s ease-out forwards;
        pointer-events: none;
        z-index: 1000;
    `;
    
    document.body.appendChild(effect);
    
    setTimeout(() => {
        effect.remove();
    }, 1000);
}

// Add click effect animation to CSS dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes clickEffectAnim {
        0% {
            opacity: 0.8;
            transform: translate(-50%, -50%) scale(0);
        }
        50% {
            opacity: 0.4;
            transform: translate(-50%, -50%) scale(1);
        }
        100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(2);
        }
    }
`;
document.head.appendChild(style);

// Fix button clickability
function fixButtonClickability() {
  const buttons = document.querySelectorAll('.auth-btn');

  buttons.forEach(button => {
    // Ensure ripple doesn't interfere with clicks
    const ripple = button.querySelector('.btn-ripple');
    if (ripple) {
      ripple.style.pointerEvents = 'none';
    }

    // Replace ripple effect handler with improved version
    button.addEventListener('click', function(e) {
      const ripple = this.querySelector('.btn-ripple');
      if (!ripple) return;

      const rect = this.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      ripple.style.width = '300px';
      ripple.style.height = '300px';
      ripple.style.transform = 'translate(-50%, -50%)';

      // Reset ripple after animation
      setTimeout(() => {
        ripple.style.width = '0';
        ripple.style.height = '0';
      }, 700);
    });

  });
}

// Fix input field clickability
function fixInputFieldClickability() {
  const inputs = document.querySelectorAll('.form-input');

  inputs.forEach(input => {
    // Ensure glow elements don't block clicks
    const inputGroup = input.closest('.input-group');
    const glowElement = inputGroup?.querySelector('.input-glow');
    if (glowElement) {
      glowElement.style.pointerEvents = 'none';
    }

    // Make sure labels don't interfere with clicks
    const label = inputGroup?.querySelector('.form-label');
    if (label) {
      label.style.pointerEvents = 'none';
    }

    // Fix z-index for proper interaction
    input.style.position = 'relative';
    input.style.zIndex = '2';
  });
}

// Initialize fixes
document.addEventListener('DOMContentLoaded', function() {
  fixButtonClickability();
  fixInputFieldClickability();

  // Re-apply fixes after form toggle to ensure it works on both forms
  document.querySelectorAll('.toggle-btn').forEach(button => {
    button.addEventListener('click', function() {
      setTimeout(() => {
        fixButtonClickability();
        fixInputFieldClickability();
      }, 400); // Apply after form animation completes
    });
  });
});