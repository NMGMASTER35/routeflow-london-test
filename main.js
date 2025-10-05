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

const profileCache = new Map();
const normaliseTextValue = (value) => (typeof value === 'string' ? value.trim() : '');
const normaliseEmailValue = (value) => normaliseTextValue(value).toLowerCase();

const cloneProfileData = (value) => {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneProfileData(item));
  }
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (typeof value === 'object') {
    const tag = Object.prototype.toString.call(value);
    if (tag !== '[object Object]') {
      return value;
    }
    return Object.keys(value).reduce((acc, key) => {
      acc[key] = cloneProfileData(value[key]);
      return acc;
    }, {});
  }
  return value;
};

const getCachedProfile = (uid) => {
  if (!uid || !profileCache.has(uid)) {
    return null;
  }
  return cloneProfileData(profileCache.get(uid));
};

const setCachedProfile = (uid, data) => {
  if (!uid) {
    return null;
  }
  const snapshot = cloneProfileData(data || {});
  profileCache.set(uid, snapshot);
  return cloneProfileData(snapshot);
};

const mergeProfileCache = (uid, data) => {
  if (!uid) {
    return null;
  }
  const current = cloneProfileData(profileCache.get(uid) || {});
  const incoming = cloneProfileData(data || {});
  const merged = { ...current, ...incoming };
  return setCachedProfile(uid, merged);
};

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

const resolveProfileDisplayName = (user) => {
  if (!user) return '';
  const cached = user.uid ? getCachedProfile(user.uid) : null;
  if (cached?.displayName) {
    return cached.displayName;
  }
  if (typeof user.displayName === 'string' && user.displayName.trim()) {
    return user.displayName.trim();
  }
  return '';
};

const createUserSummary = (user) => {
  if (!user) return null;
  const displayName = resolveProfileDisplayName(user);
  return {
    uid: user.uid || null,
    email: user.email || null,
    displayName: displayName || null,
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

  const stackAuth = () => window.RouteflowStackAuth || null;

  const normaliseProviderIdValue = (value) => {
    const stack = stackAuth();
    if (stack?.normaliseProviderId) {
      return stack.normaliseProviderId(value);
    }
    if (!value) return null;
    const trimmed = String(value).trim().toLowerCase();
    if (!trimmed) return null;
    if (trimmed === 'google') return 'google.com';
    if (trimmed === 'github') return 'github.com';
    if (trimmed === 'discord') return 'discord.com';
    if (trimmed.includes('.')) {
      return trimmed;
    }
    return `${trimmed}.com`;
  };

  const getProviderMeta = (providerId) => {
    const stack = stackAuth();
    const normalised = normaliseProviderIdValue(providerId);
    return stack?.providers?.[normalised] || null;
  };

  const deriveProviderEmail = (providerId) => {
    const meta = getProviderMeta(providerId);
    if (meta?.defaultEmailSuffix) {
      return `${meta.key || 'stack'}.user.${Date.now()}${meta.defaultEmailSuffix}`;
    }
    return `stack.user.${Date.now()}@routeflow`;
  };

  const deriveProviderDisplayName = (providerId) => {
    const meta = getProviderMeta(providerId);
    return meta?.defaultDisplayName || 'Stack Auth Explorer';
  };

  const normaliseEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
  const rawEmail = (value) => (typeof value === 'string' ? value.trim() : '');

  const isValidEmail = (value) => {
    const email = rawEmail(value);
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

  const generateUid = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `local-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  };

  const convertStoredRecord = (record, key) => {
    if (!record || typeof record !== 'object') {
      return null;
    }
    const uid = record.uid || (key && !key.includes('@') ? key : generateUid());
    const emailValue = normaliseTextValue(record.email)
      || (typeof key === 'string' && key.includes('@') ? key : '')
      || null;
    const displayNameValue = normaliseTextValue(record.displayName)
      || (emailValue ? emailValue.split('@')?.[0] : '')
      || 'Explorer';
    const passwordHash = typeof record.passwordHash === 'string' && record.passwordHash
      ? record.passwordHash
      : null;

    const providers = {};
    if (record.providers && typeof record.providers === 'object') {
      Object.values(record.providers).forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const providerId = entry.providerId || entry.id || null;
        if (!providerId) return;
        providers[providerId] = {
          providerId,
          email: normaliseTextValue(entry.email) || emailValue,
          displayName: normaliseTextValue(entry.displayName) || displayNameValue,
          linkedAt: entry.linkedAt || Date.now(),
          lastLoginAt: entry.lastLoginAt || entry.linkedAt || Date.now()
        };
      });
    }
    if (passwordHash) {
      providers.password = providers.password || {
        providerId: 'password',
        email: emailValue,
        displayName: displayNameValue,
        linkedAt: record.createdAt || Date.now(),
        lastLoginAt: record.updatedAt || Date.now()
      };
    }

    const providerId = record.provider
      || (passwordHash ? 'password' : Object.keys(providers)[0] || 'local');

    return {
      uid,
      email: emailValue,
      displayName: displayNameValue,
      passwordHash,
      provider: providerId,
      providers,
      photoURL: record.photoURL || null,
      createdAt: record.createdAt || Date.now(),
      updatedAt: record.updatedAt || Date.now()
    };
  };

  const loadUsers = () => {
    if (typeof localStorage === 'undefined') return {};
    const stored = safeParse(localStorage.getItem(LOCAL_AUTH_STORAGE_KEY), {});
    if (!stored || typeof stored !== 'object') {
      return {};
    }
    const result = {};
    Object.entries(stored).forEach(([key, value]) => {
      const converted = convertStoredRecord(value, key);
      if (converted) {
        result[converted.uid] = converted;
      }
    });
    return result;
  };

  const state = {
    users: loadUsers(),
    currentRecord: null,
    currentUser: null,
    providerIndex: {},
    emailIndex: {}
  };

  const rebuildIndexes = () => {
    state.providerIndex = {};
    state.emailIndex = {};
    Object.values(state.users).forEach((record) => {
      const primaryEmailKey = normaliseEmail(record.email);
      if (primaryEmailKey) {
        state.emailIndex[primaryEmailKey] = record.uid;
      }
      if (record.providers && typeof record.providers === 'object') {
        Object.values(record.providers).forEach((entry) => {
          if (!entry || typeof entry !== 'object') return;
          const providerId = entry.providerId || entry.id;
          if (!providerId) return;
          const providerEmailKey = normaliseEmail(entry.email || record.email);
          if (providerEmailKey) {
            state.providerIndex[`${providerId}:${providerEmailKey}`] = record.uid;
            state.emailIndex[providerEmailKey] = record.uid;
          }
        });
      }
    });
  };

  rebuildIndexes();

  const saveUsers = (users) => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(users));
      } catch (error) {
        console.warn('Routeflow local auth: unable to persist users', error);
      }
    }
    rebuildIndexes();
  };

  const findRecordByUid = (uid) => {
    if (!uid) return null;
    return state.users[uid] || null;
  };

  const findRecordByEmail = (email) => {
    const key = normaliseEmail(email);
    if (!key) return null;
    const uid = state.emailIndex[key];
    if (uid && state.users[uid]) {
      return state.users[uid];
    }
    return null;
  };

  const findRecordByProvider = (providerId, email) => {
    const normalisedProvider = normaliseProviderIdValue(providerId);
    if (!normalisedProvider) return null;
    const emailKey = normaliseEmail(email);
    if (!emailKey) return null;
    const uid = state.providerIndex[`${normalisedProvider}:${emailKey}`];
    if (uid && state.users[uid]) {
      return state.users[uid];
    }
    return null;
  };

  const ensurePassword = (password) => encodePassword(password ?? '');

  const toProviderData = (record) => {
    const entries = [];
    if (record.providers && typeof record.providers === 'object') {
      Object.values(record.providers).forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const providerId = entry.providerId || entry.id;
        if (!providerId) return;
        entries.push({
          providerId,
          email: entry.email || record.email || null,
          displayName: entry.displayName || record.displayName || null
        });
      });
    }
    if (!entries.length) {
      entries.push({
        providerId: record.provider || (record.passwordHash ? 'password' : 'local'),
        email: record.email || null,
        displayName: record.displayName || null
      });
    }
    return entries;
  };

  const toUserObject = (record) => {
    if (!record) return null;
    const providerData = toProviderData(record);
    const providerId = record.provider || providerData[0]?.providerId || 'local';
    return {
      uid: record.uid,
      email: record.email || null,
      displayName: record.displayName || (record.email ? record.email.split('@')?.[0] : 'Explorer'),
      providerId,
      providerData,
      local: true,
      isAnonymous: false,
      photoURL: record.photoURL || null,
      getIdTokenResult: async () => ({ claims: { local: true } }),
      updateProfile: async (updates = {}) => {
        const nextName = normaliseTextValue(updates.displayName);
        const nextPhoto = normaliseTextValue(updates.photoURL);
        if (nextName) {
          record.displayName = nextName;
        }
        if (nextPhoto) {
          record.photoURL = nextPhoto;
        }
        record.updatedAt = Date.now();
        saveUsers(state.users);
        setCurrentRecord(record);
      },
      reload: async () => {}
    };
  };

  const notify = () => {
    const snapshot = state.currentUser
      ? {
          ...state.currentUser,
          providerData: Array.isArray(state.currentUser.providerData)
            ? state.currentUser.providerData.map((entry) => ({ ...entry }))
            : []
        }
      : null;
    listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('Routeflow local auth: listener error', error);
      }
    });
  };

  const persistSession = (record) => {
    if (typeof localStorage === 'undefined') return;
    try {
      if (record) {
        localStorage.setItem(LOCAL_AUTH_SESSION_KEY, JSON.stringify({
          uid: record.uid,
          email: record.email || null,
          providerId: record.provider || 'local'
        }));
      } else {
        localStorage.removeItem(LOCAL_AUTH_SESSION_KEY);
      }
    } catch (error) {
      console.warn('Routeflow local auth: unable to persist session', error);
    }
  };

  const setCurrentRecord = (record) => {
    state.currentRecord = record || null;
    state.currentUser = record ? toUserObject(record) : null;
    persistSession(record || null);
    syncUserSummary(state.currentUser);
    notify();
  };

  const runStackProviderFlow = async (providerId, options = {}) => {
    const stack = stackAuth();
    if (stack?.startProviderFlow) {
      return stack.startProviderFlow(providerId, options);
    }
    const meta = getProviderMeta(providerId);
    const label = meta?.label || providerId || 'Stack Auth provider';
    const emailPrompt = window.prompt(`Stack Auth — enter your ${label} email`, options.email || deriveProviderEmail(providerId));
    if (!emailPrompt) {
      throw new Error(`${label} sign-in cancelled.`);
    }
    const namePrompt = window.prompt(`Stack Auth — how should we address you?`, options.displayName || deriveProviderDisplayName(providerId))
      || options.displayName
      || emailPrompt.split('@')?.[0]
      || 'Explorer';
    return {
      providerId: normaliseProviderIdValue(providerId),
      email: emailPrompt.trim(),
      displayName: namePrompt.trim()
    };
  };

  const rememberIdentity = (providerId, identity) => {
    const stack = stackAuth();
    if (stack?.rememberIdentity) {
      stack.rememberIdentity(providerId, identity);
    }
  };

  const attachProviderToRecord = (record, providerId, identity = {}, options = {}) => {
    if (!record) {
      return record;
    }
    const normalisedProvider = normaliseProviderIdValue(providerId);
    if (!normalisedProvider) {
      return record;
    }
    const emailValue = normaliseTextValue(identity.email) || record.email || deriveProviderEmail(normalisedProvider);
    const displayNameValue = normaliseTextValue(identity.displayName)
      || normaliseTextValue(record.displayName)
      || deriveProviderDisplayName(normalisedProvider);

    if (!record.displayName && displayNameValue) {
      record.displayName = displayNameValue;
    }
    if (!record.email && emailValue) {
      record.email = emailValue;
    }

    const previous = record.providers?.[normalisedProvider];
    const entry = {
      providerId: normalisedProvider,
      email: emailValue || record.email || null,
      displayName: displayNameValue || null,
      linkedAt: previous?.linkedAt || Date.now(),
      lastLoginAt: Date.now()
    };

    record.providers = record.providers || {};
    record.providers[normalisedProvider] = entry;

    if (options.makePrimary && entry.email) {
      record.email = entry.email;
    }

    record.provider = normalisedProvider;
    record.updatedAt = Date.now();
    rememberIdentity(normalisedProvider, identity);
    return record;
  };

  const ensureRecordForProvider = (providerId, identity = {}, options = {}) => {
    const normalisedProvider = normaliseProviderIdValue(providerId);
    if (!normalisedProvider) {
      throw new Error('Stack Auth provider is not available.');
    }
    const preferredUid = options.preferUid || identity.uid || null;
    let record = preferredUid ? findRecordByUid(preferredUid) : null;

    const emailValue = normaliseTextValue(identity.email);
    if (!record && emailValue) {
      record = findRecordByProvider(normalisedProvider, emailValue) || findRecordByEmail(emailValue);
    }

    if (!record) {
      const uid = preferredUid || generateUid();
      record = {
        uid,
        email: emailValue || deriveProviderEmail(normalisedProvider),
        displayName: normaliseTextValue(identity.displayName) || deriveProviderDisplayName(normalisedProvider),
        passwordHash: null,
        provider: normalisedProvider,
        providers: {},
        photoURL: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      state.users[uid] = record;
    }

    attachProviderToRecord(record, normalisedProvider, identity, { makePrimary: options.makePrimary || !record.passwordHash });
    saveUsers(state.users);
    return record;
  };

  const syncUsersFromStorage = () => {
    state.users = loadUsers();
    rebuildIndexes();
    if (state.currentRecord) {
      const refreshed = findRecordByUid(state.currentRecord.uid);
      if (refreshed) {
        setCurrentRecord(refreshed);
      } else {
        setCurrentRecord(null);
      }
    }
  };

  const handleSessionChange = (sessionValue) => {
    if (!sessionValue) {
      setCurrentRecord(null);
      return;
    }
    const session = safeParse(sessionValue);
    if (session?.uid && state.users[session.uid]) {
      setCurrentRecord(state.users[session.uid]);
      return;
    }
    if (session?.email) {
      const record = findRecordByEmail(session.email);
      if (record) {
        setCurrentRecord(record);
        return;
      }
    }
    setCurrentRecord(null);
  };

  const loadSession = () => {
    if (typeof localStorage === 'undefined') return;
    const session = safeParse(localStorage.getItem(LOCAL_AUTH_SESSION_KEY));
    if (session?.uid && state.users[session.uid]) {
      setCurrentRecord(state.users[session.uid]);
      return;
    }
    if (session?.email) {
      const record = findRecordByEmail(session.email);
      if (record) {
        setCurrentRecord(record);
        return;
      }
    }
    setCurrentRecord(null);
  };

  loadSession();

  const handleStorageEvent = (event) => {
    if (!event || event.storageArea !== localStorage) {
      return;
    }
    if (event.key === LOCAL_AUTH_STORAGE_KEY) {
      syncUsersFromStorage();
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
      const emailValue = rawEmail(email);
      if (!emailValue || !password) {
        throw new Error('Please provide both email and password.');
      }
      if (!isValidEmail(emailValue)) {
        throw new Error('Enter a valid email address.');
      }
      const record = findRecordByEmail(emailValue);
      if (!record || !record.passwordHash) {
        throw new Error('No password account found with that email.');
      }
      if (record.passwordHash !== ensurePassword(password)) {
        throw new Error('Incorrect password.');
      }
      attachProviderToRecord(record, 'password', { email: record.email, displayName: record.displayName }, { makePrimary: true });
      saveUsers(state.users);
      setCurrentRecord(record);
      return { user: state.currentUser };
    },
    async createUserWithEmailAndPassword(email, password) {
      const emailValue = rawEmail(email);
      if (!emailValue || !password) {
        throw new Error('Email and password are required.');
      }
      if (!isValidEmail(emailValue)) {
        throw new Error('Enter a single valid email address.');
      }
      if (findRecordByEmail(emailValue)) {
        throw new Error('An account already exists with that email.');
      }
      const uid = generateUid();
      const record = {
        uid,
        email: emailValue,
        displayName: emailValue.split('@')?.[0] || 'Explorer',
        passwordHash: ensurePassword(password),
        provider: 'password',
        providers: {
          password: {
            providerId: 'password',
            email: emailValue,
            displayName: emailValue.split('@')?.[0] || 'Explorer',
            linkedAt: Date.now(),
            lastLoginAt: Date.now()
          }
        },
        photoURL: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      state.users[uid] = record;
      saveUsers(state.users);
      setCurrentRecord(record);
      return { user: state.currentUser };
    },
    async sendPasswordResetEmail(email) {
      const emailValue = rawEmail(email);
      if (!emailValue) {
        throw new Error('Please provide an email address.');
      }
      if (!isValidEmail(emailValue)) {
        throw new Error('Enter a valid email address.');
      }
      if (!findRecordByEmail(emailValue)) {
        throw new Error('No account found with that email.');
      }
      return { simulated: true };
    },
    async signInWithPopup(provider) {
      const providerId = normaliseProviderIdValue(provider?.providerId || provider);
      if (!providerId) {
        throw new Error('Choose a Stack Auth provider to continue.');
      }
      const identity = await runStackProviderFlow(providerId, { mode: 'signin' });
      const record = ensureRecordForProvider(providerId, identity, { makePrimary: true });
      setCurrentRecord(record);
      return { user: state.currentUser };
    },
    async linkWithPopup(provider) {
      if (!state.currentRecord) {
        throw new Error('Sign in to link additional providers.');
      }
      const providerId = normaliseProviderIdValue(provider?.providerId || provider);
      if (!providerId) {
        throw new Error('Choose a Stack Auth provider to link.');
      }
      const identity = await runStackProviderFlow(providerId, {
        mode: 'link',
        email: state.currentRecord.email,
        displayName: state.currentRecord.displayName
      });
      attachProviderToRecord(state.currentRecord, providerId, identity, { makePrimary: false });
      saveUsers(state.users);
      setCurrentRecord(state.currentRecord);
      return { user: state.currentUser };
    },
    async unlinkProvider(provider) {
      if (!state.currentRecord) {
        throw new Error('Sign in to manage linked providers.');
      }
      const providerId = normaliseProviderIdValue(provider?.providerId || provider);
      if (!providerId) {
        throw new Error('Choose a provider to unlink.');
      }
      if (providerId === 'password') {
        throw new Error('Password sign-in cannot be unlinked.');
      }
      if (!state.currentRecord.providers?.[providerId]) {
        throw new Error('That provider is not linked to your account.');
      }
      delete state.currentRecord.providers[providerId];
      if (state.currentRecord.provider === providerId) {
        state.currentRecord.provider = state.currentRecord.passwordHash
          ? 'password'
          : Object.keys(state.currentRecord.providers)[0] || 'local';
      }
      state.currentRecord.updatedAt = Date.now();
      saveUsers(state.users);
      setCurrentRecord(state.currentRecord);
      return { user: state.currentUser };
    },
    async signOut() {
      setCurrentRecord(null);
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
  const profile = user?.uid ? getCachedProfile(user.uid) : null;
  if (profile?.roles?.admin) {
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
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js'
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

const FIRESTORE_COLLECTION_PROFILES = 'profiles';
let firestoreInstance = null;
let firestoreInitPromise = null;

function getServerTimestampValue() {
  try {
    if (typeof firebase !== 'undefined' && firebase.firestore?.FieldValue?.serverTimestamp) {
      return firebase.firestore.FieldValue.serverTimestamp();
    }
  } catch (error) {
    console.warn('Routeflow Firebase: server timestamp unavailable, falling back to client time.', error);
  }
  return new Date().toISOString();
}

async function ensureFirestore() {
  if (firestoreInstance) {
    return firestoreInstance;
  }
  if (firestoreInitPromise) {
    return firestoreInitPromise;
  }
  firestoreInitPromise = ensureFirebaseAuth()
    .then((authInstance) => {
      if (!authInstance) {
        return null;
      }
      if (typeof firebase === 'undefined' || typeof firebase.firestore !== 'function') {
        console.warn('Firebase Firestore SDK is not available.');
        return null;
      }
      if (!firebase.apps.length) {
        const firebaseConfig = resolveFirebaseConfig();
        if (firebaseConfig) {
          firebase.initializeApp(firebaseConfig);
        }
      }
      firestoreInstance = firebase.firestore();
      try {
        firestoreInstance.settings({ ignoreUndefinedProperties: true });
      } catch (error) {
        // Ignore settings errors (SDK already initialised elsewhere)
      }
      return firestoreInstance;
    })
    .catch((error) => {
      console.error('Failed to initialise Firebase Firestore:', error);
      return null;
    })
    .finally(() => {
      firestoreInitPromise = null;
    });
  return firestoreInitPromise;
}

async function getProfileDocRef(uid) {
  if (!uid) {
    return null;
  }
  const instance = await ensureFirestore();
  if (!instance) {
    return null;
  }
  return instance.collection(FIRESTORE_COLLECTION_PROFILES).doc(uid);
}

async function loadProfileDocument(uid, { forceRefresh = false } = {}) {
  if (!uid) {
    return null;
  }
  if (!forceRefresh) {
    const cached = getCachedProfile(uid);
    if (cached) {
      return cached;
    }
  }
  const docRef = await getProfileDocRef(uid);
  if (!docRef) {
    return getCachedProfile(uid);
  }
  try {
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      setCachedProfile(uid, {});
      return null;
    }
    const data = snapshot.data() || {};
    setCachedProfile(uid, data);
    return getCachedProfile(uid);
  } catch (error) {
    console.warn('Routeflow Firebase: failed to load profile document.', error);
    return getCachedProfile(uid);
  }
}

async function writeProfileDocument(uid, payload, { merge = true, refresh = true } = {}) {
  if (!uid) {
    return null;
  }
  const docRef = await getProfileDocRef(uid);
  if (!docRef) {
    return null;
  }
  try {
    await docRef.set(payload, { merge });
  } catch (error) {
    console.error('Routeflow Firebase: failed to write profile document.', error);
    throw error;
  }
  if (refresh) {
    return loadProfileDocument(uid, { forceRefresh: true });
  }
  mergeProfileCache(uid, payload);
  return getCachedProfile(uid);
}

async function ensureUserProfileRecord(user, overrides = {}) {
  if (!user?.uid) {
    return null;
  }
  const docRef = await getProfileDocRef(user.uid);
  if (!docRef) {
    return null;
  }

  let existing = null;
  try {
    const snapshot = await docRef.get();
    existing = snapshot.exists ? snapshot.data() || {} : {};
    if (!snapshot.exists) {
      existing = {};
    }
  } catch (error) {
    console.warn('Routeflow Firebase: unable to inspect profile document.', error);
    existing = {};
  }

  const updates = {};
  const displayNameValue = normaliseTextValue(overrides.displayName ?? existing.displayName ?? user.displayName);
  if (displayNameValue && displayNameValue !== existing.displayName) {
    updates.displayName = displayNameValue;
  }

  const emailValue = normaliseEmailValue(overrides.email ?? existing.email ?? user.email);
  if (emailValue && emailValue !== existing.email) {
    updates.email = emailValue;
  }

  if (overrides.roles && typeof overrides.roles === 'object') {
    updates.roles = { ...(existing.roles || {}), ...cloneProfileData(overrides.roles) };
  }

  if (overrides.roleAssignments && typeof overrides.roleAssignments === 'object') {
    updates.roleAssignments = { ...(existing.roleAssignments || {}), ...cloneProfileData(overrides.roleAssignments) };
  }

  if (Object.prototype.hasOwnProperty.call(overrides, 'discord')) {
    if (overrides.discord === null) {
      updates.discord = null;
    } else if (typeof overrides.discord === 'object') {
      updates.discord = { ...(existing.discord || {}), ...cloneProfileData(overrides.discord) };
    }
  }

  if (!existing.createdAt) {
    updates.createdAt = getServerTimestampValue();
  }
  if (Object.keys(updates).length) {
    updates.updatedAt = getServerTimestampValue();
    await docRef.set(updates, { merge: true });
  }

  try {
    const refreshed = await docRef.get();
    const data = refreshed.exists ? refreshed.data() || {} : {};
    return setCachedProfile(user.uid, data);
  } catch (error) {
    console.warn('Routeflow Firebase: failed to refresh profile document.', error);
    return getCachedProfile(user.uid);
  }
}

async function setRoleState(uid, roleName, enabled, meta = {}) {
  if (!uid || !roleName) {
    return null;
  }
  const current = (await loadProfileDocument(uid)) || {};
  const roles = { ...(current.roles || {}) };
  const assignments = { ...(current.roleAssignments || {}) };

  roles[roleName] = Boolean(enabled);
  const assignment = { ...(assignments[roleName] || {}) };
  if (meta.note) assignment.note = meta.note;
  if (meta.assignedBy) assignment.assignedBy = meta.assignedBy;
  if (meta.assignedByName) assignment.assignedByName = meta.assignedByName;
  if (meta.assignedByEmail) assignment.assignedByEmail = meta.assignedByEmail;
  assignment.updatedAt = getServerTimestampValue();
  assignments[roleName] = assignment;

  const payload = {
    roles,
    roleAssignments: assignments,
    updatedAt: getServerTimestampValue()
  };
  if (!current.createdAt) {
    payload.createdAt = getServerTimestampValue();
  }

  return writeProfileDocument(uid, payload, { merge: true, refresh: true });
}

async function assignAdminRole(targetUid, metadata = {}) {
  return setRoleState(targetUid, 'admin', true, {
    assignedBy: metadata.assignedBy || null,
    assignedByName: metadata.assignedByName || null,
    assignedByEmail: metadata.assignedByEmail || null,
    note: metadata.note || null
  });
}

async function findProfileByEmail(email) {
  const emailValue = normaliseEmailValue(email);
  if (!emailValue) {
    return null;
  }
  const instance = await ensureFirestore();
  if (!instance) {
    return null;
  }
  try {
    const snapshot = await instance
      .collection(FIRESTORE_COLLECTION_PROFILES)
      .where('email', '==', emailValue)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    const data = doc.data() || {};
    setCachedProfile(doc.id, data);
    return { uid: doc.id, ...cloneProfileData(data) };
  } catch (error) {
    console.error('Routeflow Firebase: failed to locate profile by email.', error);
    return null;
  }
}

async function listAdminProfiles() {
  const instance = await ensureFirestore();
  if (!instance) {
    return [];
  }
  try {
    const snapshot = await instance
      .collection(FIRESTORE_COLLECTION_PROFILES)
      .where('roles.admin', '==', true)
      .get();
    const results = [];
    snapshot.forEach((doc) => {
      const data = doc.data() || {};
      setCachedProfile(doc.id, data);
      results.push({ uid: doc.id, ...cloneProfileData(data) });
    });
    return results;
  } catch (error) {
    console.error('Routeflow Firebase: failed to list administrators.', error);
    return [];
  }
}

async function updateDiscordLink(user, details = {}) {
  if (!user?.uid) {
    return null;
  }
  const current = (await loadProfileDocument(user.uid)) || {};
  let discordPayload = null;
  if (details === null) {
    discordPayload = null;
  } else if (typeof details === 'object') {
    discordPayload = {
      ...(current.discord || {}),
      ...cloneProfileData(details),
      lastSyncedAt: getServerTimestampValue()
    };
  } else {
    return current;
  }

  const payload = {
    discord: discordPayload,
    updatedAt: getServerTimestampValue()
  };
  if (!current.createdAt) {
    payload.createdAt = getServerTimestampValue();
  }
  return writeProfileDocument(user.uid, payload, { merge: true, refresh: true });
}

async function syncDiscordRoles(uid, roles = [], meta = {}) {
  if (!uid) {
    return null;
  }
  const safeRoles = Array.isArray(roles) ? roles.filter((role) => typeof role === 'string' && role.trim()).map((role) => role.trim()) : [];
  const current = (await loadProfileDocument(uid)) || {};
  const discordPayload = {
    ...(current.discord || {}),
    roles: safeRoles,
    lastSyncedAt: getServerTimestampValue()
  };
  if (meta.guildId) {
    discordPayload.guildId = meta.guildId;
  }
  if (meta.syncedBy) {
    discordPayload.syncedBy = meta.syncedBy;
  }
  return writeProfileDocument(uid, {
    discord: discordPayload,
    updatedAt: getServerTimestampValue()
  }, { merge: true, refresh: true });
}

const routeflowFirebaseApi = {
  ensureAuth: ensureFirebaseAuth,
  ensureFirestore,
  loadProfile: loadProfileDocument,
  writeProfile: writeProfileDocument,
  ensureProfile: ensureUserProfileRecord,
  getCachedProfile: (uid) => getCachedProfile(uid),
  mergeProfileCache,
  assignAdminRole,
  setRoleState,
  findProfileByEmail,
  listAdmins: listAdminProfiles,
  updateDiscordLink,
  syncDiscordRoles
};

window.RouteflowFirebase = Object.freeze({
  ...(window.RouteflowFirebase || {}),
  ...routeflowFirebaseApi
});

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

async function updateAdminVisibility(user, options = {}) {
  const { ensureProfile = true } = options;
  const adminTargets = document.querySelectorAll('[data-requires-admin]');
  if (!adminTargets.length) {
    return;
  }

  if (!user) {
    window.__lastAuthIsAdmin = false;
    adminTargets.forEach(target => setElementHidden(target, true));
    return;
  }

  if (ensureProfile) {
    try {
      await ensureUserProfileRecord(user);
    } catch (error) {
      console.warn('Failed to refresh profile before checking admin privileges.', error);
    }
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

function applyAuthUi(summary, user) {
  const resolvedSummary = summary || loadPersistedUserSummary();
  applySummaryToDocument(resolvedSummary);

  const signedOutSections = document.querySelectorAll('[data-auth-state="signed-out"]');
  const signedInSections = document.querySelectorAll('[data-auth-state="signed-in"]');

  signedOutSections.forEach((section) => setElementHidden(section, !!user));
  signedInSections.forEach((section) => setElementHidden(section, !user));

  document.querySelectorAll('[data-profile-toggle]').forEach((toggle) => {
    toggle.setAttribute('aria-expanded', 'false');
  });

  document.querySelectorAll('[data-profile-menu]').forEach((menu) => {
    menu.setAttribute('data-open', 'false');
    menu.setAttribute('aria-hidden', 'true');
    menu.setAttribute('hidden', '');
  });

  const displayName = resolvedSummary?.displayName
    || user?.email
    || resolvedSummary?.email
    || 'Account';

  document.querySelectorAll('[data-profile-label]').forEach((label) => {
    label.textContent = user ? displayName : 'Account';
  });

  document.querySelectorAll('[data-profile-name]').forEach((nameEl) => {
    nameEl.textContent = user ? displayName : 'Account';
  });

  document.querySelectorAll('[data-profile-email]').forEach((emailEl) => {
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

  applyAuthUi(summary, user);

  if (user) {
    ensureUserProfileRecord(user)
      .then(() => {
        const refreshedSummary = createUserSummary(user);
        persistUserSummary(refreshedSummary);
        applyAuthUi(refreshedSummary, user);
        updateAdminVisibility(user, { ensureProfile: false });
      })
      .catch((error) => {
        console.warn('Routeflow auth: unable to synchronise profile document.', error);
        updateAdminVisibility(user, { ensureProfile: false });
      });
  } else {
    updateAdminVisibility(null);
  }

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
    const user = instance.currentUser ?? null;
    if (user) {
      try {
        await ensureUserProfileRecord(user);
      } catch (profileError) {
        console.warn('Routeflow auth: unable to refresh profile during login.', profileError);
      }
    }
    renderDropdown(user);
    closeModal();
    form.reset();
  } catch (error) {
    showMessage('loginError', error?.message || 'Unable to sign in. Please try again.');
  }
}

async function handleSignupSubmit(form) {
  const nameField = form.querySelector('#signupDisplayName');
  const displayNameInput = normaliseTextValue(nameField?.value);
  const email = form.querySelector('#signupEmail')?.value.trim();
  const password = form.querySelector('#signupPassword')?.value;
  if (!displayNameInput) {
    showMessage('signupError', 'Please tell us your name so we know how to greet you.');
    nameField?.focus();
    return;
  }
  if (displayNameInput.length < 2) {
    showMessage('signupError', 'Names must be at least two characters long.');
    nameField?.focus();
    return;
  }
  if (!email || !password) {
    showMessage('signupError', 'Enter an email address and password to continue.');
    return;
  }
  clearFormMessages();
  const instance = await ensureFirebaseAuth();
  if (!instance) {
    showMessage('signupError', 'Authentication is temporarily unavailable. Please try again shortly.');
    return;
  }
  try {
    const credential = await instance.createUserWithEmailAndPassword(email, password);
    const user = credential?.user || instance.currentUser || null;
    if (user) {
      try {
        if (typeof user.updateProfile === 'function') {
          await user.updateProfile({ displayName: displayNameInput });
        }
      } catch (profileError) {
        console.warn('Routeflow auth: failed to persist display name to Firebase profile.', profileError);
      }
      try {
        await ensureUserProfileRecord(user, { displayName: displayNameInput, email });
      } catch (profileSyncError) {
        console.warn('Routeflow auth: failed to initialise Firestore profile.', profileSyncError);
      }
      renderDropdown(user);
    } else {
      renderDropdown(null);
    }
    closeModal();
    form.reset();
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

async function handleStackProviderAuth(providerId, options = {}) {
  const stack = window.RouteflowStackAuth;
  const normalisedProvider = stack?.normaliseProviderId ? stack.normaliseProviderId(providerId) : providerId;
  if (!normalisedProvider) {
    throw new Error('Select a Stack Auth provider to continue.');
  }

  const instance = await ensureFirebaseAuth();
  if (!instance) {
    throw new Error('Authentication is temporarily unavailable. Please try again shortly.');
  }

  const isLinking = options.mode === 'link' && typeof instance.linkWithPopup === 'function';
  const handlerName = isLinking ? 'linkWithPopup' : 'signInWithPopup';
  const handler = instance[handlerName];

  if (typeof handler !== 'function') {
    throw new Error('Stack Auth providers are not available in this environment.');
  }

  const result = await handler.call(instance, { providerId: normalisedProvider, mode: options.mode || 'login' });
  const user = result?.user || instance.currentUser || null;

  if (!isLinking && !options.skipRender && user) {
    renderDropdown(user);
  }

  return user;
}

window.handleStackProviderAuth = handleStackProviderAuth;

document.addEventListener('click', async (event) => {
  const providerButton = event.target.closest('[data-stack-provider]');
  if (!providerButton) {
    return;
  }

  event.preventDefault();

  const providerId = providerButton.dataset.stackProvider || providerButton.getAttribute('data-provider');
  const mode = providerButton.dataset.stackMode || (providerButton.closest('#signupFormContainer') ? 'signup' : 'login');

  try {
    await handleStackProviderAuth(providerId, { mode });
    if (mode !== 'link') {
      closeModal();
      const currentPath = typeof window !== 'undefined' ? window.location.pathname || '' : '';
      if (!currentPath.endsWith('dashboard.html')) {
        window.location.href = 'dashboard.html';
      }
    }
  } catch (error) {
    const loginContainer = document.getElementById('loginFormContainer');
    const activeId = mode === 'signup' || (loginContainer && loginContainer.hasAttribute('hidden')) ? 'signupError' : 'loginError';
    if (activeId) {
      showMessage(activeId, error?.message || 'Stack Auth sign-in failed. Please try again.');
    } else {
      alert(error?.message || 'Stack Auth sign-in failed.');
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
