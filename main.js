// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDuedLuagA4IXc9ZMG9wvoak-sRrhtFZfo",
  authDomain: "routeflow-london.firebaseapp.com",
  projectId: "routeflow-london",
  storageBucket: "routeflow-london.firebasestorage.app",
  messagingSenderId: "368346241440",
  appId: "1:368346241440:web:7cc87d551420459251ecc5"
};
firebase.initializeApp(firebaseConfig);

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

// Modal logic
function closeModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.style.display = 'none';
  clearFormMessages();
  document.getElementById('loginForm')?.reset();
  document.getElementById('signupForm')?.reset();
}
function clearFormMessages() {
  const loginError = document.getElementById('loginError');
  if (loginError) loginError.style.display = 'none';
  const signupError = document.getElementById('signupError');
  if (signupError) signupError.style.display = 'none';
  const resetError = document.getElementById('resetError');
  if (resetError) resetError.style.display = 'none';
}
// Initial auth state
firebase.auth().onAuthStateChanged(function(user) {
  renderDropdown(user);
});
document.addEventListener('DOMContentLoaded', function () {
  renderDropdown(firebase.auth().currentUser);

  const modal = document.getElementById('authModal');
  const closeModalEl = document.getElementById('closeModal');
  const loginContainer = document.getElementById('loginFormContainer');
  const signupContainer = document.getElementById('signupFormContainer');

  const showAuthModal = (mode) => {
    if (!modal) return;
    if (loginContainer) {
      loginContainer.style.display = mode === 'login' ? '' : 'none';
    }
    if (signupContainer) {
      signupContainer.style.display = mode === 'signup' ? '' : 'none';
    }
    const resetContainer = document.getElementById('resetFormContainer');
    if (resetContainer && mode !== 'reset') {
      resetContainer.style.display = 'none';
    }
    modal.style.display = 'block';
    clearFormMessages();
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
        firebase.auth().signOut().then(() => {
          renderDropdown(null);
        });
        break;
      case 'profile': {
        const user = firebase.auth().currentUser;
        if (user) {
          window.location.href = 'profile.html';
        } else {
          alert('Not signed in');
        }
        break;
      }
      case 'settings': {
        const user = firebase.auth().currentUser;
        if (user) {
          window.location.href = 'settings.html';
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
      if (event.key === 'Escape' && modal.style.display === 'block') {
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
    if (!modal) return;
    if (loginContainer) loginContainer.style.display = 'none';
    if (signupContainer) signupContainer.style.display = 'none';
    const resetContainer = document.getElementById('resetFormContainer');
    if (resetContainer) {
      resetContainer.style.display = '';
    }
    clearFormMessages();
  });

  document.getElementById('loginForm')?.addEventListener('submit', function (e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    if (!email || !password) return;
    clearFormMessages();
    firebase.auth().signInWithEmailAndPassword(email, password)
      .then(() => {
        renderDropdown(firebase.auth().currentUser);
        closeModal();
      })
      .catch((error) => {
        const loginError = document.getElementById('loginError');
        if (loginError) {
          loginError.textContent = error.message;
          loginError.style.display = 'block';
        }
      });
  });

  document.getElementById('signupForm')?.addEventListener('submit', function (e) {
    e.preventDefault();
    const email = document.getElementById('signupEmail')?.value.trim();
    const password = document.getElementById('signupPassword')?.value;
    if (!email || !password) return;
    clearFormMessages();
    firebase.auth().createUserWithEmailAndPassword(email, password)
      .then(() => {
        renderDropdown(firebase.auth().currentUser);
        closeModal();
      })
      .catch((error) => {
        const signupError = document.getElementById('signupError');
        if (signupError) {
          signupError.textContent = error.message;
          signupError.style.display = 'block';
        }
      });
  });

  document.querySelectorAll('.google-login').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const provider = new firebase.auth.GoogleAuthProvider();
      firebase.auth().signInWithPopup(provider)
        .then(() => {
          alert('Google sign-in successful!');
          window.location.href = 'dashboard.html';
        })
        .catch((error) => {
          alert('Google sign-in error: ' + error.message);
        });
    });
  });

  document.querySelectorAll('.reset-password').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const email = prompt('Enter your email to reset your password:');
      if (email) {
        firebase.auth().sendPasswordResetEmail(email)
          .then(() => {
            alert('Password reset email sent!');
          })
          .catch((error) => {
            alert('Reset error: ' + error.message);
          });
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
