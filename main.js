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
const AUTH_MODAL_SOURCE = 'components/auth-modal.html';
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LAST_USER_SUMMARY_KEY = 'routeflow:auth:last-user';
const GOOGLE_ACCOUNT_INFO_KEY = 'routeflow:local-auth:google-account';

let ensureAuthModalPromise = null;
let summaryUpdateDeferred = false;

const getUserProviderId = (user) => {
  if (!user) return null;
  if (typeof user.providerId === 'string' && user.providerId) {
    return user.providerId;
  }
  if (Array.isArray(user.providerData) && user.providerData.length) {
    const providerEntry = user.providerData.find((entry) => entry?.providerId);
    if (providerEntry?.providerId) {
      return providerEntry.providerId;
    }
  }
  if (user.local) {
    return 'local';
  }
  return null;
};

const createUserSummary = (user) => {
  if (!user) return null;
  return {
    uid: user.uid || null,
    email: user.email || null,
    displayName: user.displayName || null,
    providerId: getUserProviderId(user),
    timestamp: Date.now()
  };
};

function persistUserSummary(summary) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (summary) {
      localStorage.setItem(LAST_USER_SUMMARY_KEY, JSON.stringify(summary));
    } else {
      localStorage.removeItem(LAST_USER_SUMMARY_KEY);
    }
  } catch (error) {
    console.warn('Routeflow auth: unable to persist auth summary', error);
  }
}

function loadPersistedUserSummary() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_USER_SUMMARY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.warn('Routeflow auth: failed to parse cached auth summary', error);
    return null;
  }
}

function applySummaryToDocument(summary) {
  if (typeof document === 'undefined') {
    return;
  }
  const state = summary ? 'signed-in' : 'signed-out';
  const root = document.documentElement;
  if (root) {
    root.setAttribute('data-auth-state', state);
  }
  const body = document.body;
  if (!body) {
    if (!summaryUpdateDeferred) {
      summaryUpdateDeferred = true;
      document.addEventListener('DOMContentLoaded', () => {
        summaryUpdateDeferred = false;
        applySummaryToDocument(loadPersistedUserSummary());
      }, { once: true });
    }
    return;
  }
  body.setAttribute('data-auth-state', state);
  if (summary?.email) {
    body.setAttribute('data-auth-email', summary.email);
  } else {
    body.removeAttribute('data-auth-email');
  }
  if (summary?.displayName) {
    body.setAttribute('data-auth-name', summary.displayName);
  } else {
    body.removeAttribute('data-auth-name');
  }
}

function syncUserSummary(user) {
  const summary = createUserSummary(user);
  persistUserSummary(summary);
  applySummaryToDocument(summary);
  return summary;
}

applySummaryToDocument(loadPersistedUserSummary());

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
    if (!stored || typeof stored !== 'object') {
      return {};
    }
    Object.values(stored).forEach((record) => {
      if (record && typeof record === 'object') {
        if (!record.provider) {
          record.provider = record.passwordHash ? 'password' : 'local';
        }
      }
    });
    return stored;
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

  const readGoogleAccountInfo = () => {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(GOOGLE_ACCOUNT_INFO_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      console.warn('Routeflow local auth: failed to parse Google account cache', error);
      return null;
    }
  };

  const writeGoogleAccountInfo = (info) => {
    if (typeof localStorage === 'undefined') return;
    try {
      if (!info) {
        localStorage.removeItem(GOOGLE_ACCOUNT_INFO_KEY);
      } else {
        localStorage.setItem(GOOGLE_ACCOUNT_INFO_KEY, JSON.stringify(info));
      }
    } catch (error) {
      console.warn('Routeflow local auth: unable to persist Google account cache', error);
    }
  };

  const ensureGoogleAccountRecord = () => {
    const stored = readGoogleAccountInfo();
    const baseEmail = stored?.email && isValidEmail(stored.email)
      ? stored.email
      : `google.user.${Date.now()}@local.routeflow`;
    const normalised = normaliseEmailValue(baseEmail);
    let record = state.users[normalised];
    if (!record) {
      record = {
        uid: stored?.uid || generateUid(),
        email: baseEmail,
        displayName: stored?.displayName || 'Google Explorer',
        passwordHash: null,
        provider: 'google.com'
      };
      state.users[normalised] = record;
      saveUsers(state.users);
    } else {
      let changed = false;
      if (record.provider !== 'google.com') {
        record.provider = 'google.com';
        changed = true;
      }
      if (record.passwordHash) {
        record.passwordHash = null;
        changed = true;
      }
      if (!record.displayName) {
        record.displayName = stored?.displayName || 'Google Explorer';
        changed = true;
      }
      if (changed) {
        saveUsers(state.users);
      }
    }
    writeGoogleAccountInfo({
      uid: record.uid,
      email: record.email,
      displayName: record.displayName
    });
    return record;
  };

  const normaliseEmailValue = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
  const getRawEmail = (value) => (typeof value === 'string' ? value.trim() : '');

  const isValidEmail = (value) => {
    const email = getRawEmail(value);
    if (!email) return false;
    if (email.includes(',') || email.includes(';')) {
      return false;
    }
    if (/\s/.test(email)) {
      return false;
    }
    if (email.split('@').length !== 2) {
      return false;
    }
    return EMAIL_PATTERN.test(email);
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
        localStorage.setItem(LOCAL_AUTH_SESSION_KEY, JSON.stringify({
          uid: user.uid,
          email: user.email,
          providerId: getUserProviderId(user)
        }));
      } else {
        localStorage.removeItem(LOCAL_AUTH_SESSION_KEY);
      }
    } catch (error) {
      console.warn('Routeflow local auth: unable to persist session', error);
    }
  };

  const syncUsersFromStorage = () => {
    state.users = loadUsers();
  };

  const handleSessionChange = (sessionValue) => {
    if (!sessionValue) {
      setCurrentUser(null);
      return;
    }
    const session = safeParse(sessionValue);
    const emailKey = normaliseEmailValue(session?.email);
    if (!emailKey) {
      setCurrentUser(null);
      return;
    }
    if (!state.users[emailKey]) {
      syncUsersFromStorage();
    }
    const record = state.users[emailKey];
    if (record) {
      setCurrentUser(record);
    } else {
      setCurrentUser(null);
    }
  };

  const toUserObject = (record) => {
    if (!record) return null;
    const baseName = record.displayName || record.email?.split('@')?.[0] || 'Explorer';
    const providerId = record.provider || (record.passwordHash ? 'password' : 'local');
    return {
      uid: record.uid,
      email: record.email,
      displayName: baseName,
      providerId,
      providerData: [{ providerId, email: record.email || null }],
      local: true,
      isAnonymous: false,
      photoURL: null,
      getIdTokenResult: async () => ({ claims: { local: true } })
    };
  };

  const setCurrentUser = (record) => {
    state.currentUser = record ? toUserObject(record) : null;
    persistSession(state.currentUser);
    syncUserSummary(state.currentUser);
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

  const handleStorageEvent = (event) => {
    if (!event || event.storageArea !== localStorage) {
      return;
    }
    if (event.key === LOCAL_AUTH_STORAGE_KEY) {
      syncUsersFromStorage();
      if (state.currentUser?.email) {
        const key = normaliseEmailValue(state.currentUser.email);
        if (!state.users[key]) {
          setCurrentUser(null);
        }
      }
      return;
    }
    if (event.key === LOCAL_AUTH_SESSION_KEY) {
      handleSessionChange(event.newValue);
      return;
    }
    if (event.key === LAST_USER_SUMMARY_KEY) {
      applySummaryToDocument(loadPersistedUserSummary());
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
  }

  const api = {
    get currentUser() {
      return state.currentUser;
    },
    async signInWithEmailAndPassword(email, password) {
      const rawEmail = getRawEmail(email);
      const normalisedEmail = rawEmail.toLowerCase();
      if (!rawEmail || !password) {
        throw new Error('Please provide both email and password.');
      }
      if (!isValidEmail(rawEmail)) {
        throw new Error('Enter a valid email address.');
      }
      const record = state.users[normalisedEmail];
      if (!record) {
        throw new Error('No account found with that email.');
      }
      const providerId = record.provider || (record.passwordHash ? 'password' : 'local');
      if (providerId !== 'password') {
        throw new Error('Use the Google sign-in button for this account.');
      }
      const storedHash = record.passwordHash || '';
      if (!storedHash) {
        throw new Error('Use the Google sign-in button for this account.');
      }
      if (storedHash !== ensurePassword(password)) {
        throw new Error('Incorrect password.');
      }
      setCurrentUser(record);
      return { user: state.currentUser };
    },
    async createUserWithEmailAndPassword(email, password) {
      const rawEmail = getRawEmail(email);
      const normalisedEmail = rawEmail.toLowerCase();
      if (!normalisedEmail || !password) {
        throw new Error('Email and password are required.');
      }
      if (!isValidEmail(rawEmail)) {
        throw new Error('Enter a single valid email address.');
      }
      if (state.users[normalisedEmail]) {
        throw new Error('An account already exists with that email.');
      }
      const duplicate = Object.values(state.users).some((entry) => normaliseEmailValue(entry?.email) === normalisedEmail);
      if (duplicate) {
        throw new Error('An account already exists with that email.');
      }
      const record = {
        uid: generateUid(),
        email: rawEmail,
        displayName: rawEmail.split('@')?.[0] || 'Explorer',
        passwordHash: ensurePassword(password),
        provider: 'password'
      };
      state.users[normalisedEmail] = record;
      saveUsers(state.users);
      setCurrentUser(record);
      return { user: state.currentUser };
    },
    async sendPasswordResetEmail(email) {
      const rawEmail = getRawEmail(email);
      const normalisedEmail = rawEmail.toLowerCase();
      if (!normalisedEmail) {
        throw new Error('Please provide an email address.');
      }
      if (!isValidEmail(rawEmail)) {
        throw new Error('Enter a valid email address.');
      }
      if (!state.users[normalisedEmail]) {
        throw new Error('No account found with that email.');
      }
      return { simulated: true };
    },
    async signInWithPopup(provider) {
      const providerId = provider?.providerId || 'google.com';
      if (!providerId || !providerId.includes('google')) {
        throw new Error('This sign-in provider is not available offline.');
      }
      const record = ensureGoogleAccountRecord();
      setCurrentUser(record);
      return { user: state.currentUser };
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

  const uid = typeof userOrUid === 'string' && !userOrUid.includes('@') ? userOrUid : userOrUid?.uid;
  if (uid && ADMIN_OVERRIDES.has(uid)) {
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

  const email = normaliseEmail(
    typeof userOrUid === 'string' && userOrUid.includes('@')
      ? userOrUid
      : userOrUid?.email
  );
  if (!email) {
    return false;
  }

  for (const override of ADMIN_OVERRIDES.values()) {
    const expectedEmail = normaliseEmail(override?.email);
    if (expectedEmail && expectedEmail === email) {
      return true;
    }
  }

  return false;
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
const authSubscribers = new Set();

function getAuthEventDetail(user) {
  if (!user) {
    return null;
  }
  const providerId = getUserProviderId(user);
  return {
    uid: user.uid || null,
    email: user.email || null,
    displayName: user.displayName || null,
    photoURL: user.photoURL || null,
    providerId: providerId || null,
    isAnonymous: Boolean(user.isAnonymous),
    summary: createUserSummary(user)
  };
}

function notifyAuthSubscribers(user) {
  authSubscribers.forEach((listener) => {
    try {
      listener(user || null);
    } catch (error) {
      console.error('Routeflow auth: subscriber callback failed', error);
    }
  });
  try {
    document.dispatchEvent(new CustomEvent('routeflow:auth-state', {
      detail: {
        user: getAuthEventDetail(user),
        summary: createUserSummary(user),
        state: user ? 'signed-in' : 'signed-out'
      }
    }));
  } catch (error) {
    console.error('Routeflow auth: failed to broadcast auth-state event', error);
  }
}

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

async function ensureAuthModalElement() {
  const existing = document.getElementById('authModal');
  if (existing) {
    return existing;
  }

  if (ensureAuthModalPromise) {
    return ensureAuthModalPromise;
  }

  ensureAuthModalPromise = fetch(AUTH_MODAL_SOURCE)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load authentication modal (${response.status})`);
      }
      return response.text();
    })
    .then((html) => {
      const template = document.createElement('template');
      template.innerHTML = html.trim();
      const fragment = template.content.cloneNode(true);
      document.body.appendChild(fragment);
      const modal = document.getElementById('authModal');
      if (modal) {
        document.dispatchEvent(new CustomEvent('auth-modal:ready', { detail: { source: 'fallback' } }));
      }
      return modal;
    })
    .finally(() => {
      ensureAuthModalPromise = null;
    });

  return ensureAuthModalPromise;
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

async function showAuthModal(mode = 'login') {
  try {
    let modal = document.getElementById('authModal');
    if (!modal) {
      modal = await ensureAuthModalElement();
    }

    if (!modal) {
      throw new Error('Authentication modal element is unavailable.');
    }

    clearFormMessages();
    const activeContainer = setActiveAuthView(mode);
    modal.removeAttribute('hidden');
    modal.setAttribute('data-open', 'true');
    modal.setAttribute('aria-hidden', 'false');
    document.body.dataset.authModalOpen = 'true';
    focusFirstField(activeContainer);
    document.dispatchEvent(new CustomEvent('auth-modal:open', { detail: { view: mode } }));
  } catch (error) {
    console.error('Failed to display authentication modal:', error);
    alert('Authentication is temporarily unavailable. Please try again shortly.');
  }
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
  const previousUser = window.__lastAuthUser ?? null;
  window.__lastAuthUser = user ?? null;

  let summary = null;
  if (user) {
    summary = createUserSummary(user);
    persistUserSummary(summary);
  } else if (previousUser || (auth && auth.currentUser)) {
    persistUserSummary(null);
  }

  const resolvedSummary = summary || loadPersistedUserSummary();
  applySummaryToDocument(resolvedSummary);

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

  const displayName = resolvedSummary?.displayName
    || user?.email
    || resolvedSummary?.email
    || 'Account';
  document.querySelectorAll('[data-profile-label]').forEach(label => {
    label.textContent = user ? displayName : 'Account';
  });

  document.querySelectorAll('[data-profile-name]').forEach(name => {
    name.textContent = user ? displayName : 'Account';
  });

  document.querySelectorAll('[data-profile-email]').forEach(emailEl => {
    if (!emailEl) return;
    const emailValue = user?.email || resolvedSummary?.email || '';
    if (emailValue && emailValue !== displayName) {
      emailEl.textContent = emailValue;
      emailEl.removeAttribute('hidden');
      emailEl.setAttribute('aria-hidden', 'false');
    } else {
      emailEl.textContent = '';
      emailEl.setAttribute('hidden', '');
      emailEl.setAttribute('aria-hidden', 'true');
    }
  });

  updateAdminVisibility(user);
  notifyAuthSubscribers(user);
}

window.renderDropdown = renderDropdown;

const getLastKnownUser = () => window.__lastAuthUser ?? (auth?.currentUser ?? null);

const routeflowAuthApi = {
  ensure: ensureFirebaseAuth,
  ready: authReady,
  getCurrentUser() {
    return getLastKnownUser();
  },
  getLastKnownSummary() {
    const user = getLastKnownUser();
    if (user) {
      return createUserSummary(user);
    }
    return loadPersistedUserSummary();
  },
  getStoredSummary() {
    return loadPersistedUserSummary();
  },
  isAdmin() {
    return window.__lastAuthIsAdmin === true;
  },
  subscribe(callback) {
    if (typeof callback !== 'function') {
      return () => {};
    }
    authSubscribers.add(callback);
    try {
      callback(getLastKnownUser(), loadPersistedUserSummary());
    } catch (error) {
      console.error('Routeflow auth: subscriber callback failed', error);
    }
    return () => {
      authSubscribers.delete(callback);
    };
  },
  onReady(callback) {
    if (typeof callback !== 'function') {
      return;
    }
    authReady
      .then((instance) => {
        try {
          callback(instance);
        } catch (error) {
          console.error('Routeflow auth: onReady callback failed', error);
        }
      })
      .catch((error) => {
        console.error('Routeflow auth: onReady promise rejected', error);
      });
  }
};

window.RouteflowAuth = Object.freeze({
  ...(window.RouteflowAuth || {}),
  ...routeflowAuthApi
});

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
    case 'dashboard':
    case 'fleet': {
      const instance = await ensureFirebaseAuth();
      if (!instance) {
        alert('Authentication is temporarily unavailable. Please try again shortly.');
        return;
      }
      const user = instance.currentUser;
      const target = action === 'fleet' ? 'fleet.html' : 'dashboard.html';
      if (user) {
        window.location.href = target;
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

const SINGLE_EMAIL_SELECTOR = 'input[data-single-email]';

function enforceSingleEmailInput(field) {
  if (!(field instanceof HTMLInputElement)) return;
  const rawValue = typeof field.value === 'string' ? field.value.trim() : '';
  const invalid = /[,;]/.test(rawValue) || rawValue.split(/\s+/).filter(Boolean).length > 1;
  if (invalid) {
    field.setCustomValidity('Enter a single email address.');
  } else {
    field.setCustomValidity('');
  }
}

document.addEventListener('input', (event) => {
  const field = event.target;
  if (!(field instanceof HTMLInputElement)) {
    return;
  }
  if (!field.matches(SINGLE_EMAIL_SELECTOR)) {
    return;
  }
  enforceSingleEmailInput(field);
});

document.addEventListener('blur', (event) => {
  const field = event.target;
  if (!(field instanceof HTMLInputElement)) {
    return;
  }
  if (!field.matches(SINGLE_EMAIL_SELECTOR)) {
    return;
  }
  enforceSingleEmailInput(field);
  if (typeof field.reportValidity === 'function') {
    field.reportValidity();
  }
}, true);

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
  if (!instance) {
    alert('Authentication is temporarily unavailable. Please try again shortly.');
    return;
  }
  let provider = null;
  if (typeof firebase !== 'undefined' && firebase.auth?.GoogleAuthProvider) {
    provider = new firebase.auth.GoogleAuthProvider();
  } else if (typeof instance.signInWithPopup === 'function') {
    provider = { providerId: 'google.com' };
  } else {
    alert('Authentication is temporarily unavailable. Please try again shortly.');
    return;
  }
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
