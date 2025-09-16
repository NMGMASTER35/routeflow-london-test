// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDuedLuagA4IXc9ZMG9wvoak-sRrhtFZfo",
  authDomain: "routeflow-london.firebaseapp.com",
  projectId: "routeflow-london",
  storageBucket: "routeflow-london.firebasestorage.app",
  messagingSenderId: "368346241440",
  appId: "1:368346241440:web:7cc87d551420459251ecc5"
};

let auth = null;
if (typeof firebase !== 'undefined') {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  auth = firebase.auth();
} else {
  console.error('Firebase SDK not loaded; authentication is unavailable.');
}

// Newsletter form
document.getElementById('newsletter-form')?.addEventListener('submit', function (e) {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const message = document.getElementById('response-message');
  // For demo, just show message
  message.textContent = 'You have been subscribed!';
  this.reset();
  setTimeout(() => message.textContent = '', 4000);
});

// --- Auth Dropdown ---
function renderDropdown(user) {
  window.__lastAuthUser = user ?? null;

  const signedOutSections = document.querySelectorAll('[data-auth-state="signed-out"]');
  const signedInSections = document.querySelectorAll('[data-auth-state="signed-in"]');

  if (!signedOutSections.length && !signedInSections.length) {
    return;
  }

  signedOutSections.forEach(section => {
    if (user) {
      section.setAttribute('hidden', '');
    } else {
      section.removeAttribute('hidden');
    }
  });

  signedInSections.forEach(section => {
    if (user) {
      section.removeAttribute('hidden');
    } else {
      section.setAttribute('hidden', '');
    }
  });

  document.querySelectorAll('[data-profile-toggle]').forEach(toggle => {
    toggle.setAttribute('aria-expanded', 'false');
  });
  document.querySelectorAll('[data-profile-menu]').forEach(menu => {
    menu.setAttribute('data-open', 'false');
    menu.setAttribute('aria-hidden', 'true');
    menu.setAttribute('hidden', '');
  });

  const displayName = user?.displayName || user?.email || 'Account';
  document.querySelectorAll('[data-profile-label]').forEach(label => {
    label.textContent = user ? displayName : 'Account';
  });
}

window.renderDropdown = renderDropdown;

// Modal logic
function closeModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.removeAttribute('data-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.removeAttribute('data-auth-modal-open');
  clearFormMessages();
  document.getElementById('loginForm')?.reset();
  document.getElementById('signupForm')?.reset();
  document.getElementById('resetForm')?.reset();
}
function clearFormMessages() {
  const clear = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = '';
    el.setAttribute('hidden', '');
  };
  clear('loginError');
  clear('signupError');
  clear('resetError');
  clear('resetSuccess');
}
// Initial auth state
auth?.onAuthStateChanged(function(user) {
  renderDropdown(user);
});
document.addEventListener('DOMContentLoaded', function () {
  renderDropdown(auth?.currentUser ?? null);

  const modal = document.getElementById('authModal');
  const closeModalEl = document.getElementById('closeModal');
  const loginContainer = document.getElementById('loginFormContainer');
  const signupContainer = document.getElementById('signupFormContainer');
  const resetContainer = document.getElementById('resetFormContainer');

  const toggleHidden = (element, hidden) => {
    element?.toggleAttribute('hidden', hidden);
  };

  const focusFirstField = (container) => {
    if (!container) return;
    const focusTarget = container.querySelector('input, button, [tabindex]');
    if (focusTarget) {
      requestAnimationFrame(() => focusTarget.focus());
    }
  };

  const showAuthModal = (mode) => {
    if (!modal) return;
    toggleHidden(loginContainer, mode !== 'login');
    toggleHidden(signupContainer, mode !== 'signup');
    toggleHidden(resetContainer, mode !== 'reset');
    modal.setAttribute('data-open', 'true');
    modal.setAttribute('aria-hidden', 'false');
    document.body.dataset.authModalOpen = 'true';
    clearFormMessages();
    const activeContainer = mode === 'signup' ? signupContainer : mode === 'reset' ? resetContainer : loginContainer;
    focusFirstField(activeContainer);
  };

  const handleAuthAction = (action) => {
    switch (action) {
      case 'login':
        window.dispatchEvent(new Event('navbar:close-overlays'));
        showAuthModal('login');
        break;
      case 'signup':
        window.dispatchEvent(new Event('navbar:close-overlays'));
        showAuthModal('signup');
        break;
      case 'logout':
        if (!auth) {
          console.error('Sign-out requested but Firebase auth is unavailable.');
          return;
        }
        auth.signOut().then(() => {
          renderDropdown(null);
        }).catch(error => {
          console.error('Failed to sign out:', error);
        });
        break;
      case 'profile': {
        const user = auth?.currentUser;
        if (user) {
          window.location.href = 'profile.html';
        } else {
          alert('Not signed in');
        }
        break;
      }
      case 'settings': {
        const user = auth?.currentUser;
        if (user) {
          window.location.href = 'settings.html';
        } else {
          alert('Not signed in');
        }
        break;
      }
      case 'admin': {
        const user = auth?.currentUser;
        if (user) {
          window.location.href = 'admin.html';
        } else {
          alert('Not signed in');
        }
        break;
      }
      default:
        break;
    }
  };

  document.addEventListener('navbar:auth-action', (event) => {
    const action = event.detail?.action;
    if (!action) return;
    handleAuthAction(action);
  });

  document.body.addEventListener('click', (event) => {
    if (event.defaultPrevented) return;
    const trigger = event.target.closest('[data-auth-action]');
    if (!trigger) return;
    const action = trigger.dataset.authAction;
    if (!action) return;
    event.preventDefault();
    handleAuthAction(action);
  });

  if (modal) {
    closeModalEl?.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeModal();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal.getAttribute('data-open') === 'true') {
        closeModal();
      }
    });
  }

  document.getElementById('showSignup')?.addEventListener('click', (event) => {
    event.preventDefault();
    showAuthModal('signup');
  });

  document.getElementById('showLogin')?.addEventListener('click', (event) => {
    event.preventDefault();
    showAuthModal('login');
  });

  document.getElementById('showLoginFromReset')?.addEventListener('click', (event) => {
    event.preventDefault();
    showAuthModal('login');
  });

  document.getElementById('showReset')?.addEventListener('click', (event) => {
    event.preventDefault();
    showAuthModal('reset');
  });

  document.getElementById('loginForm')?.addEventListener('submit', function (e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    if (!email || !password) return;
    clearFormMessages();
    if (!auth) {
      const loginError = document.getElementById('loginError');
      if (loginError) {
        loginError.textContent = 'Authentication is temporarily unavailable. Please try again shortly.';
        loginError.removeAttribute('hidden');
      }
      return;
    }
    auth.signInWithEmailAndPassword(email, password)
      .then(() => {
        renderDropdown(auth.currentUser);
        closeModal();
      })
      .catch((error) => {
        const loginError = document.getElementById('loginError');
        if (loginError) {
          loginError.textContent = error.message;
          loginError.removeAttribute('hidden');
        }
      });
  });

  document.getElementById('signupForm')?.addEventListener('submit', function (e) {
    e.preventDefault();
    const email = document.getElementById('signupEmail')?.value.trim();
    const password = document.getElementById('signupPassword')?.value;
    if (!email || !password) return;
    clearFormMessages();
    if (!auth) {
      const signupError = document.getElementById('signupError');
      if (signupError) {
        signupError.textContent = 'Authentication is temporarily unavailable. Please try again shortly.';
        signupError.removeAttribute('hidden');
      }
      return;
    }
    auth.createUserWithEmailAndPassword(email, password)
      .then(() => {
        renderDropdown(auth.currentUser);
        closeModal();
      })
      .catch((error) => {
        const signupError = document.getElementById('signupError');
        if (signupError) {
          signupError.textContent = error.message;
          signupError.removeAttribute('hidden');
        }
      });
  });

  document.querySelectorAll('.google-login, .google-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      if (!auth) {
        alert('Authentication is temporarily unavailable. Please try again shortly.');
        return;
      }
      const provider = new firebase.auth.GoogleAuthProvider();
      auth.signInWithPopup(provider)
        .then(() => {
          renderDropdown(auth.currentUser);
          closeModal();
          window.location.href = 'dashboard.html';
        })
        .catch((error) => {
          const targetError = !loginContainer?.hasAttribute('hidden')
            ? document.getElementById('loginError')
            : document.getElementById('signupError');
          if (targetError) {
            targetError.textContent = error.message;
            targetError.removeAttribute('hidden');
          } else {
            alert('Google sign-in error: ' + error.message);
          }
        });
    });
  });

  document.getElementById('resetForm')?.addEventListener('submit', function (e) {
    e.preventDefault();
    const email = document.getElementById('resetEmail')?.value.trim();
    if (!email) return;
    clearFormMessages();
    if (!auth) {
      const resetError = document.getElementById('resetError');
      if (resetError) {
        resetError.textContent = 'Authentication is temporarily unavailable. Please try again shortly.';
        resetError.removeAttribute('hidden');
      }
      return;
    }
    auth.sendPasswordResetEmail(email)
      .then(() => {
        const resetSuccess = document.getElementById('resetSuccess');
        if (resetSuccess) {
          resetSuccess.textContent = 'Check your inbox for the reset link.';
          resetSuccess.removeAttribute('hidden');
        }
      })
      .catch((error) => {
        const resetError = document.getElementById('resetError');
        if (resetError) {
          resetError.textContent = error.message;
          resetError.removeAttribute('hidden');
        }
      });
  });
});

const slideContainer = document.querySelector('.carousel-slide');
const images = document.querySelectorAll('.carousel-slide img');
const prevBtn = document.querySelector('.carousel-btn.prev');
const nextBtn = document.querySelector('.carousel-btn.next');
const dotsContainer = document.querySelector('.carousel-dots');

let currentIndex = 0;
  const captions = Array.from(images).map(img => img.dataset.caption);
const captionEl = document.getElementById('carousel-caption'); // Make sure this exists in HTML
document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.getElementById("themeToggle");
  const themeLabel = document.getElementById("themeLabel");

  // Load saved theme
  const savedTheme = localStorage.getItem("theme") || "light";
  document.body.classList.toggle("dark-mode", savedTheme === "dark");
  themeToggle.checked = savedTheme === "dark";
  themeLabel.textContent = savedTheme === "dark" ? "Dark Mode" : "Light Mode";

  // Toggle theme
  themeToggle.addEventListener("change", () => {
    const isDarkMode = themeToggle.checked;
    document.body.classList.toggle("dark-mode", isDarkMode);
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
    themeLabel.textContent = isDarkMode ? "Dark Mode" : "Light Mode";
  });

  // Language Selector
  const languageSelector = document.getElementById("languageSelector");
  languageSelector.addEventListener("change", () => {
    const selectedLanguage = languageSelector.value;
    console.log(`Language changed to: ${selectedLanguage}`);
    // TODO: Implement language change functionality
  });
});document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.getElementById("themeToggle");
  const themeLabel = document.getElementById("themeLabel");
  const notificationsToggle = document.getElementById("notifications");

  // Load saved theme
  const savedTheme = localStorage.getItem("theme") || "light";
  document.body.classList.toggle("dark-mode", savedTheme === "dark");
  themeToggle.checked = savedTheme === "dark";
  themeLabel.textContent = savedTheme === "dark" ? "Dark Mode" : "Light Mode";

  // Toggle theme
  themeToggle.addEventListener("change", () => {
    const isDarkMode = themeToggle.checked;
    document.body.classList.toggle("dark-mode", isDarkMode);
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
    themeLabel.textContent = isDarkMode ? "Dark Mode" : "Light Mode";
  });

  // Notifications Toggle
  notificationsToggle.addEventListener("change", () => {
    const isEnabled = notificationsToggle.checked;
    console.log(`Notifications are now ${isEnabled ? "enabled" : "disabled"}`);
    // TODO: Implement backend or localStorage to save this preference
  });

  // Language Selector
  const languageSelector = document.getElementById("languageSelector");
  languageSelector.addEventListener("change", () => {
    const selectedLanguage = languageSelector.value;
    console.log(`Language changed to: ${selectedLanguage}`);
    // TODO: Implement language change functionality
  });
});
