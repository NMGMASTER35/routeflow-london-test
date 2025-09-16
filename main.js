// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDuedLuagA4IXc9ZMG9wvoak-sRrhtFZfo",
  authDomain: "routeflow-london.firebaseapp.com",
  projectId: "routeflow-london",
  storageBucket: "routeflow-london.firebasestorage.app",
  messagingSenderId: "368346241440",
  appId: "1:368346241440:web:7cc87d551420459251ecc5"
};

const ADMIN_OVERRIDES = new Map([
  [
    'emKTnjbKIKfBjQzQEvpUOWOpFKc2',
    {
      email: 'nmorris210509@gmail.com'
    }
  ]
]);

const normaliseEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

function hasAdminOverride(userOrUid) {
  if (!userOrUid) {
    return false;
  }

  const uid = typeof userOrUid === 'string' ? userOrUid : userOrUid?.uid;
  if (!uid || !ADMIN_OVERRIDES.has(uid)) {
    return false;
  }

  const override = ADMIN_OVERRIDES.get(uid);
  if (override?.email) {
    const currentEmail = normaliseEmail(typeof userOrUid === 'string' ? undefined : userOrUid?.email);
    const expectedEmail = normaliseEmail(override.email);
    if (currentEmail && expectedEmail && currentEmail !== expectedEmail) {
      return false;
    }
  }

  return true;
}

function isAdminUser(user, tokenResult) {
  if (tokenResult?.claims?.admin) {
    return true;
  }
  return hasAdminOverride(user);
}

window.RouteflowAdmin = Object.freeze({
  ...(window.RouteflowAdmin || {}),
  overrides: ADMIN_OVERRIDES,
  hasOverride: hasAdminOverride,
  isAdminUser,
  listOverrides: () => Array.from(ADMIN_OVERRIDES.entries()).map(([uid, meta]) => ({ uid, ...meta }))
});

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
const AUTH_VIEW_IDS = {
  login: 'loginFormContainer',
  signup: 'signupFormContainer',
  reset: 'resetFormContainer',
  admin: 'adminFormContainer'
};

function setElementHidden(element, hidden) {
  if (!element) return;
  if (hidden) {
    element.setAttribute('hidden', '');
    element.setAttribute('aria-hidden', 'true');
  } else {
    element.removeAttribute('hidden');
    element.removeAttribute('aria-hidden');
  }
}

function showMessage(id, message) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message ?? '';
  if (message) {
    element.removeAttribute('hidden');
  } else {
    element.setAttribute('hidden', '');
  }
}

function clearFormMessages() {
  ['loginError', 'signupError', 'resetError', 'resetSuccess', 'adminLoginError'].forEach(id => {
    showMessage(id, '');
  });
}

function resetAuthForms() {
  ['loginForm', 'signupForm', 'resetForm', 'adminLoginForm'].forEach(id => {
    const form = document.getElementById(id);
    form?.reset();
  });
}

function closeModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.removeAttribute('data-open');
  modal.setAttribute('aria-hidden', 'true');
  delete document.body.dataset.authModalOpen;
  clearFormMessages();
  resetAuthForms();
}

function focusFirstField(container) {
  if (!container) return;
  const focusTarget = container.querySelector('input, button, [tabindex]');
  if (focusTarget) {
    requestAnimationFrame(() => focusTarget.focus());
  }
}

function setActiveAuthView(mode) {
  let activeContainer = null;
  Object.entries(AUTH_VIEW_IDS).forEach(([key, id]) => {
    const container = document.getElementById(id);
    const shouldHide = key !== mode;
    if (container) {
      container.toggleAttribute('hidden', shouldHide);
      if (!shouldHide) {
        activeContainer = container;
      }
    }
  });
  return activeContainer;
}

function showAuthModal(mode = 'login') {
  const modal = document.getElementById('authModal');
  if (!modal) {
    const handleReady = () => {
      document.removeEventListener('auth-modal:ready', handleReady);
      showAuthModal(mode);
    };
    document.addEventListener('auth-modal:ready', handleReady, { once: true });
    return;
  }

  clearFormMessages();
  const activeContainer = setActiveAuthView(mode);
  modal.setAttribute('data-open', 'true');
  modal.setAttribute('aria-hidden', 'false');
  document.body.dataset.authModalOpen = 'true';
  focusFirstField(activeContainer);
}

window.openModal = showAuthModal;

async function updateAdminVisibility(user) {
  const adminTargets = document.querySelectorAll('[data-requires-admin]');
  if (!adminTargets.length) {
    return;
  }

  if (!user) {
    window.__lastAuthIsAdmin = false;
    adminTargets.forEach(target => setElementHidden(target, true));
    return;
  }

  try {
    const tokenResult = await user.getIdTokenResult();
    const isAdmin = isAdminUser(user, tokenResult);
    window.__lastAuthIsAdmin = isAdmin;
    adminTargets.forEach(target => setElementHidden(target, !isAdmin));
    document.dispatchEvent(new CustomEvent('auth:admin-state', {
      detail: { isAdmin }
    }));
  } catch (error) {
    console.error('Failed to determine administrator privileges:', error);
    window.__lastAuthIsAdmin = undefined;
    adminTargets.forEach(target => setElementHidden(target, true));
  }
}

function renderDropdown(user) {
  window.__lastAuthUser = user ?? null;

  const signedOutSections = document.querySelectorAll('[data-auth-state="signed-out"]');
  const signedInSections = document.querySelectorAll('[data-auth-state="signed-in"]');

  signedOutSections.forEach(section => setElementHidden(section, !!user));
  signedInSections.forEach(section => setElementHidden(section, !user));

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

  updateAdminVisibility(user);
}

window.renderDropdown = renderDropdown;

function handleAuthAction(action) {
  switch (action) {
    case 'login':
      window.dispatchEvent(new Event('navbar:close-overlays'));
      showAuthModal('login');
      break;
    case 'signup':
      window.dispatchEvent(new Event('navbar:close-overlays'));
      showAuthModal('signup');
      break;
    case 'admin-login':
      window.dispatchEvent(new Event('navbar:close-overlays'));
      showAuthModal('admin');
      break;
    case 'logout':
      if (!auth) {
        console.error('Sign-out requested but Firebase auth is unavailable.');
        return;
      }
      auth.signOut()
        .then(() => {
          window.__lastAuthIsAdmin = false;
          renderDropdown(null);
        })
        .catch(error => {
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
      if (!user) {
        showAuthModal('admin');
        break;
      }
      const proceed = () => { window.location.href = 'admin.html'; };
      const knownState = window.__lastAuthIsAdmin;
      if (knownState === true) {
        proceed();
      } else if (knownState === false) {
        alert('This account does not have administrator access.');
      } else {
        user.getIdTokenResult()
          .then(result => {
            const isAdmin = isAdminUser(user, result);
            window.__lastAuthIsAdmin = isAdmin;
            updateAdminVisibility(user);
            if (isAdmin) {
              proceed();
            } else {
              alert('This account does not have administrator access.');
            }
          })
          .catch(error => {
            console.error('Failed to verify administrator permissions:', error);
            alert('Unable to verify administrator access right now. Please try again later.');
          });
      }
      break;
    }
    default:
      break;
  }
}

auth?.onAuthStateChanged(user => {
  renderDropdown(user);
});

document.addEventListener('DOMContentLoaded', () => {
  renderDropdown(auth?.currentUser ?? null);
});

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

document.addEventListener('click', (event) => {
  const closeButton = event.target.closest('#closeModal');
  if (closeButton) {
    event.preventDefault();
    closeModal();
    return;
  }

  const showSignup = event.target.closest('#showSignup');
  if (showSignup) {
    event.preventDefault();
    showAuthModal('signup');
    return;
  }

  const showLogin = event.target.closest('#showLogin, #showLoginFromReset, #showLoginFromAdmin');
  if (showLogin) {
    event.preventDefault();
    showAuthModal('login');
    return;
  }

  const showReset = event.target.closest('#showReset');
  if (showReset) {
    event.preventDefault();
    showAuthModal('reset');
    return;
  }

  const showAdmin = event.target.closest('#showAdminLogin, #showAdminFromSignup');
  if (showAdmin) {
    event.preventDefault();
    showAuthModal('admin');
    return;
  }

  const modal = document.getElementById('authModal');
  if (modal && event.target === modal) {
    closeModal();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const modal = document.getElementById('authModal');
    if (modal?.getAttribute('data-open') === 'true') {
      closeModal();
    }
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  if (form.id === 'loginForm') {
    event.preventDefault();
    handleLoginSubmit(form);
  } else if (form.id === 'signupForm') {
    event.preventDefault();
    handleSignupSubmit(form);
  } else if (form.id === 'resetForm') {
    event.preventDefault();
    handleResetSubmit(form);
  } else if (form.id === 'adminLoginForm') {
    event.preventDefault();
    handleAdminLoginSubmit(form);
  }
});

function handleLoginSubmit(form) {
  const email = form.querySelector('#loginEmail')?.value.trim();
  const password = form.querySelector('#loginPassword')?.value;
  if (!email || !password) return;
  clearFormMessages();
  if (!auth) {
    showMessage('loginError', 'Authentication is temporarily unavailable. Please try again shortly.');
    return;
  }
  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      renderDropdown(auth.currentUser);
      closeModal();
    })
    .catch((error) => {
      showMessage('loginError', error?.message || 'Unable to sign in. Please try again.');
    });
}

function handleSignupSubmit(form) {
  const email = form.querySelector('#signupEmail')?.value.trim();
  const password = form.querySelector('#signupPassword')?.value;
  if (!email || !password) return;
  clearFormMessages();
  if (!auth) {
    showMessage('signupError', 'Authentication is temporarily unavailable. Please try again shortly.');
    return;
  }
  auth.createUserWithEmailAndPassword(email, password)
    .then(() => {
      renderDropdown(auth.currentUser);
      closeModal();
    })
    .catch((error) => {
      showMessage('signupError', error?.message || 'Unable to create your account. Please try again.');
    });
}

function handleResetSubmit(form) {
  const email = form.querySelector('#resetEmail')?.value.trim();
  if (!email) return;
  clearFormMessages();
  if (!auth) {
    showMessage('resetError', 'Authentication is temporarily unavailable. Please try again shortly.');
    return;
  }
  auth.sendPasswordResetEmail(email)
    .then(() => {
      showMessage('resetSuccess', 'Check your inbox for the reset link.');
    })
    .catch((error) => {
      showMessage('resetError', error?.message || 'We could not send the reset email. Please try again.');
    });
}

function handleAdminLoginSubmit(form) {
  const email = form.querySelector('#adminEmail')?.value.trim();
  const password = form.querySelector('#adminPassword')?.value;
  if (!email || !password) return;
  clearFormMessages();
  if (!auth) {
    showMessage('adminLoginError', 'Authentication is temporarily unavailable. Please try again shortly.');
    return;
  }
  auth.signInWithEmailAndPassword(email, password)
    .then(async (credential) => {
      const user = credential?.user || auth.currentUser;
      if (!user) {
        throw new Error('Administrator sign-in failed. Please try again.');
      }
      const tokenResult = await user.getIdTokenResult();
      const isAdmin = isAdminUser(user, tokenResult);
      window.__lastAuthIsAdmin = isAdmin;
      if (!isAdmin) {
        await auth.signOut();
        renderDropdown(null);
        throw new Error('This account does not have administrator access.');
      }
      renderDropdown(user);
      closeModal();
      window.location.href = 'admin.html';
    })
    .catch((error) => {
      console.error('Admin sign-in failed:', error);
      showMessage('adminLoginError', error?.message || 'Unable to sign in as an administrator. Please try again.');
    });
}

document.addEventListener('click', (event) => {
  const googleBtn = event.target.closest('.google-login, .google-btn');
  if (!googleBtn) {
    return;
  }
  event.preventDefault();
  if (!auth || typeof firebase === 'undefined' || !firebase.auth?.GoogleAuthProvider) {
    alert('Authentication is temporarily unavailable. Please try again shortly.');
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then(async (result) => {
      const user = result?.user || auth.currentUser;
      renderDropdown(user ?? null);
      if (user) {
        try {
          await updateAdminVisibility(user);
        } catch (error) {
          console.error('Failed to refresh admin state after Google sign-in:', error);
        }
      }
      closeModal();
      window.location.href = 'dashboard.html';
    })
    .catch((error) => {
      const loginContainer = document.getElementById('loginFormContainer');
      const targetId = loginContainer && !loginContainer.hasAttribute('hidden') ? 'loginError' : 'signupError';
      if (targetId) {
        showMessage(targetId, error?.message || 'Google sign-in failed. Please try again.');
      } else {
        alert('Google sign-in error: ' + (error?.message || error));
      }
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
