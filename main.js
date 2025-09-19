// Firebase config
function resolveFirebaseConfig() {
  const config = window.__ROUTEFLOW_CONFIG__?.firebase;
  if (!config?.apiKey) {
    return null;
  }
  return config;
}

const LOCAL_AUTH_STORAGE_KEY = 'routeflow:local-auth:users';
const LOCAL_AUTH_SESSION_KEY = 'routeflow:local-auth:session';

const encodePassword = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  try {
    if (typeof TextEncoder !== 'undefined') {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(value);
      let binary = '';
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return btoa(binary);
    }
    return btoa(unescape(encodeURIComponent(value)));
  } catch (error) {
    console.warn('Routeflow local auth: unable to encode password', error);
    return String(value ?? '');
  }
};

function createLocalAuth() {
  const listeners = new Set();

  const safeParse = (value, fallback = null) => {
    if (typeof value !== 'string' || !value) return fallback;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (error) {
      console.warn('Routeflow local auth: failed to parse stored value', error);
      return fallback;
    }
  };

  const loadUsers = () => {
    if (typeof localStorage === 'undefined') return {};
    const stored = safeParse(localStorage.getItem(LOCAL_AUTH_STORAGE_KEY), {});
    return stored && typeof stored === 'object' ? stored : {};
  };

  const saveUsers = (users) => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(users));
    } catch (error) {
      console.warn('Routeflow local auth: unable to persist users', error);
    }
  };

  const state = {
    users: loadUsers(),
    currentUser: null
  };

  const notify = () => {
    const snapshot = state.currentUser ? { ...state.currentUser } : null;
    listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('Routeflow local auth: listener error', error);
      }
    });
  };

  const persistSession = (user) => {
    if (typeof localStorage === 'undefined') return;
    try {
      if (user) {
        localStorage.setItem(LOCAL_AUTH_SESSION_KEY, JSON.stringify({ uid: user.uid, email: user.email }));
      } else {
        localStorage.removeItem(LOCAL_AUTH_SESSION_KEY);
      }
    } catch (error) {
      console.warn('Routeflow local auth: unable to persist session', error);
    }
  };

  const toUserObject = (record) => {
    if (!record) return null;
    const baseName = record.displayName || record.email?.split('@')?.[0] || 'Explorer';
    return {
      uid: record.uid,
      email: record.email,
      displayName: baseName,
      getIdTokenResult: async () => ({ claims: { local: true } })
    };
  };

  const setCurrentUser = (record) => {
    state.currentUser = record ? toUserObject(record) : null;
    persistSession(state.currentUser);
    notify();
  };

  const loadSession = () => {
    if (typeof localStorage === 'undefined') return;
    const session = safeParse(localStorage.getItem(LOCAL_AUTH_SESSION_KEY));
    if (!session?.email) {
      setCurrentUser(null);
      return;
    }
    const emailKey = session.email.toLowerCase();
    const record = state.users[emailKey];
    if (record) {
      setCurrentUser(record);
    } else {
      setCurrentUser(null);
    }
  };

  const ensurePassword = (password) => encodePassword(password ?? '');

  const generateUid = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `local-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  };

  loadSession();

  const api = {
    get currentUser() {
      return state.currentUser;
    },
    async signInWithEmailAndPassword(email, password) {
      const normalisedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      if (!normalisedEmail || !password) {
        throw new Error('Please provide both email and password.');
      }
      const record = state.users[normalisedEmail];
      if (!record) {
        throw new Error('No account found with that email.');
      }
      const storedHash = record.passwordHash || '';
      if (storedHash !== ensurePassword(password)) {
        throw new Error('Incorrect password.');
      }
      setCurrentUser(record);
      return { user: state.currentUser };
    },
    async createUserWithEmailAndPassword(email, password) {
      const normalisedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      if (!normalisedEmail || !password) {
        throw new Error('Email and password are required.');
      }
      if (state.users[normalisedEmail]) {
        throw new Error('An account already exists with that email.');
      }
      const record = {
        uid: generateUid(),
        email: email.trim(),
        displayName: email.trim().split('@')?.[0] || 'Explorer',
        passwordHash: ensurePassword(password)
      };
      state.users[normalisedEmail] = record;
      saveUsers(state.users);
      setCurrentUser(record);
      return { user: state.currentUser };
    },
    async sendPasswordResetEmail(email) {
      const normalisedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      if (!normalisedEmail) {
        throw new Error('Please provide an email address.');
      }
      if (!state.users[normalisedEmail]) {
        throw new Error('No account found with that email.');
      }
      return { simulated: true };
    },
    async signOut() {
      setCurrentUser(null);
      return true;
    },
    onAuthStateChanged(callback) {
      if (typeof callback !== 'function') {
        return () => {};
      }
      listeners.add(callback);
      try {
        callback(state.currentUser);
      } catch (error) {
        console.error('Routeflow local auth: onAuthStateChanged callback failed', error);
      }
      return () => {
        listeners.delete(callback);
      };
    }
  };

  return api;
}

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

const CONFIG_SCRIPT_SRC = 'config.js';
const FIREBASE_SCRIPT_SRCS = [
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js'
];

const loadedScriptPromises = new Map();

function toAbsoluteUrl(src) {
  try {
    return new URL(src, document.baseURI).href;
  } catch (error) {
    console.warn('Failed to resolve script URL, using raw source.', error);
    return src;
  }
}

function loadExternalScript(src) {
  const absolute = toAbsoluteUrl(src);
  if (Array.from(document.scripts).some(script => script.src === absolute)) {
    return Promise.resolve();
  }
  if (loadedScriptPromises.has(absolute)) {
    return loadedScriptPromises.get(absolute);
  }
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
  loadedScriptPromises.set(absolute, promise);
  return promise;
}

async function ensureConfigLoaded() {
  if (window.__ROUTEFLOW_CONFIG__?.firebase?.apiKey) {
    return;
  }
  try {
    await loadExternalScript(CONFIG_SCRIPT_SRC);
  } catch (error) {
    console.warn('Failed to load client configuration:', error);
  }
}

async function ensureFirebaseScriptsLoaded() {
  for (const src of FIREBASE_SCRIPT_SRCS) {
    await loadExternalScript(src);
  }
}

let auth = null;
let authInitPromise = null;

async function initialiseAuthInstance() {
  await ensureConfigLoaded();
  const firebaseConfig = resolveFirebaseConfig();
  if (!firebaseConfig) {
    return createLocalAuth();
  }

  try {
    await ensureFirebaseScriptsLoaded();
  } catch (error) {
    console.error('Failed to load Firebase SDK:', error);
    return createLocalAuth();
  }

  if (typeof firebase === 'undefined') {
    console.error('Firebase SDK not loaded; authentication is unavailable.');
    return createLocalAuth();
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  if (!firebase.apps.length || !firebase.auth) {
    console.error('Firebase SDK loaded but authentication is unavailable.');
    return createLocalAuth();
  }

  return firebase.auth();
}

function ensureFirebaseAuth() {
  if (auth) {
    return Promise.resolve(auth);
  }
  if (authInitPromise) {
    return authInitPromise;
  }
  authInitPromise = initialiseAuthInstance()
    .then(instance => {
      auth = instance;
      return instance;
    })
    .catch(error => {
      console.error('Failed to initialise Firebase authentication:', error);
      return null;
    })
    .finally(() => {
      authInitPromise = null;
    });
  return authInitPromise;
}

const authReady = ensureFirebaseAuth();

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
  reset: 'resetFormContainer'
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
  ['loginError', 'signupError', 'resetError', 'resetSuccess'].forEach(id => {
    showMessage(id, '');
  });
}

function resetAuthForms() {
  ['loginForm', 'signupForm', 'resetForm'].forEach(id => {
    const form = document.getElementById(id);
    form?.reset();
  });
}

function closeModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.removeAttribute('data-open');
  modal.setAttribute('aria-hidden', 'true');
  modal.setAttribute('hidden', '');
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
  modal.removeAttribute('hidden');
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

async function handleAuthAction(action) {
  switch (action) {
    case 'login':
      window.dispatchEvent(new Event('navbar:close-overlays'));
      showAuthModal('login');
      break;
    case 'signup':
      window.dispatchEvent(new Event('navbar:close-overlays'));
      showAuthModal('signup');
      break;
    case 'logout': {
      const instance = await ensureFirebaseAuth();
      if (!instance) {
        alert('Authentication is temporarily unavailable. Please try again shortly.');
        return;
      }
      try {
        await instance.signOut();
        window.__lastAuthIsAdmin = false;
        renderDropdown(null);
      } catch (error) {
        console.error('Failed to sign out:', error);
        alert('Unable to sign out right now. Please try again.');
      }
      break;
    }
    case 'profile': {
      const instance = await ensureFirebaseAuth();
      if (!instance) {
        alert('Authentication is temporarily unavailable. Please try again shortly.');
        return;
      }
      const user = instance.currentUser;
      if (user) {
        window.location.href = 'profile.html';
      } else {
        showAuthModal('login');
      }
      break;
    }
    case 'settings': {
      const instance = await ensureFirebaseAuth();
      if (!instance) {
        alert('Authentication is temporarily unavailable. Please try again shortly.');
        return;
      }
      const user = instance.currentUser;
      if (user) {
        window.location.href = 'settings.html';
      } else {
        showAuthModal('login');
      }
      break;
    }
    case 'admin': {
      const instance = await ensureFirebaseAuth();
      if (!instance) {
        alert('Authentication is temporarily unavailable. Please try again shortly.');
        return;
      }
      const user = instance.currentUser;
      if (!user) {
        showAuthModal('login');
        return;
      }
      const proceed = () => { window.location.href = 'admin.html'; };
      const knownState = window.__lastAuthIsAdmin;
      if (knownState === true) {
        proceed();
        return;
      }
      if (knownState === false) {
        alert('This account does not have administrator access.');
        return;
      }
      try {
        const result = await user.getIdTokenResult();
        const isAdmin = isAdminUser(user, result);
        window.__lastAuthIsAdmin = isAdmin;
        updateAdminVisibility(user);
        if (isAdmin) {
          proceed();
        } else {
          alert('This account does not have administrator access.');
        }
      } catch (error) {
        console.error('Failed to verify administrator permissions:', error);
        alert('Unable to verify administrator access right now. Please try again later.');
      }
      break;
    }
    default:
      break;
  }
}

authReady.then(instance => {
  if (instance) {
    instance.onAuthStateChanged(user => {
      renderDropdown(user);
    });
  } else {
    window.__lastAuthIsAdmin = false;
  }
});

document.addEventListener('DOMContentLoaded', () => {
  renderDropdown(window.__lastAuthUser ?? null);
  ensureFirebaseAuth().then(instance => {
    if (instance) {
      renderDropdown(instance.currentUser ?? null);
    }
  });
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

  const showLogin = event.target.closest('#showLogin, #showLoginFromReset');
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
  }
});

async function handleLoginSubmit(form) {
  const email = form.querySelector('#loginEmail')?.value.trim();
  const password = form.querySelector('#loginPassword')?.value;
  if (!email || !password) return;
  clearFormMessages();
  const instance = await ensureFirebaseAuth();
  if (!instance) {
    showMessage('loginError', 'Authentication is temporarily unavailable. Please try again shortly.');
    return;
  }
  try {
    await instance.signInWithEmailAndPassword(email, password);
    renderDropdown(instance.currentUser ?? null);
    closeModal();
  } catch (error) {
    showMessage('loginError', error?.message || 'Unable to sign in. Please try again.');
  }
}

async function handleSignupSubmit(form) {
  const email = form.querySelector('#signupEmail')?.value.trim();
  const password = form.querySelector('#signupPassword')?.value;
  if (!email || !password) return;
  clearFormMessages();
  const instance = await ensureFirebaseAuth();
  if (!instance) {
    showMessage('signupError', 'Authentication is temporarily unavailable. Please try again shortly.');
    return;
  }
  try {
    await instance.createUserWithEmailAndPassword(email, password);
    renderDropdown(instance.currentUser ?? null);
    closeModal();
  } catch (error) {
    showMessage('signupError', error?.message || 'Unable to create your account. Please try again.');
  }
}

async function handleResetSubmit(form) {
  const email = form.querySelector('#resetEmail')?.value.trim();
  if (!email) return;
  clearFormMessages();
  const instance = await ensureFirebaseAuth();
  if (!instance) {
    showMessage('resetError', 'Authentication is temporarily unavailable. Please try again shortly.');
    return;
  }
  try {
    const result = await instance.sendPasswordResetEmail(email);
    const simulated = typeof result === 'object' && result !== null && result.simulated;
    const message = simulated
      ? 'Password reset link simulated. Set a new password the next time you sign in.'
      : 'Check your inbox for the reset link.';
    showMessage('resetSuccess', message);
  } catch (error) {
    showMessage('resetError', error?.message || 'We could not send the reset email. Please try again.');
  }
}

document.addEventListener('click', async (event) => {
  const googleBtn = event.target.closest('.google-login, .google-btn');
  if (!googleBtn) {
    return;
  }
  event.preventDefault();
  const instance = await ensureFirebaseAuth();
  if (!instance || typeof firebase === 'undefined' || !firebase.auth?.GoogleAuthProvider) {
    alert('Authentication is temporarily unavailable. Please try again shortly.');
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await instance.signInWithPopup(provider);
    const user = result?.user || instance.currentUser;
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
  } catch (error) {
    const loginContainer = document.getElementById('loginFormContainer');
    const targetId = loginContainer && !loginContainer.hasAttribute('hidden') ? 'loginError' : 'signupError';
    if (targetId) {
      showMessage(targetId, error?.message || 'Google sign-in failed. Please try again.');
    } else {
      alert('Google sign-in error: ' + (error?.message || error));
    }
  }
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
