const DISCORD_STORAGE_KEY = 'routeflow:discord:session';
const DISCORD_STATE_KEY = 'routeflow:discord:state';
const TOKEN_EXPIRY_BUFFER = 30 * 1000; // 30 seconds

let currentSession = null;
const listeners = new Set();

const safeParseJson = (value, fallback = null) => {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (error) {
    console.warn('RouteFlow Discord auth: failed to parse stored value', error);
    return fallback;
  }
};

const writeStorage = (key, value) => {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value === null) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('RouteFlow Discord auth: unable to persist value', error);
  }
};

const readStorage = (key) => {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn('RouteFlow Discord auth: unable to read value', error);
    return null;
  }
};

const generateState = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch (error) {
    console.warn('RouteFlow Discord auth: failed to generate secure state', error);
  }
  return `discord-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const getConfig = () => {
  const config = window.__ROUTEFLOW_CONFIG__?.discord;
  if (!config || typeof config !== 'object') {
    return null;
  }
  const scopes = Array.isArray(config.scopes) && config.scopes.length
    ? config.scopes.filter((scope) => typeof scope === 'string' && scope.trim()).map((scope) => scope.trim())
    : ['identify'];
  return {
    clientId: config.clientId || '',
    redirectUri: config.redirectUri || window.location.href.split('#')[0],
    prompt: config.prompt || 'consent',
    scopes
  };
};

const isConfigValid = (config) => Boolean(config?.clientId && config?.redirectUri);

const buildAuthUrl = (config, state) => {
  const params = new URLSearchParams({
    response_type: 'token',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
    prompt: config.prompt || 'consent',
    state
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
};

const saveSession = (session, reason) => {
  currentSession = session ? { ...session } : null;
  writeStorage(DISCORD_STORAGE_KEY, currentSession);
  notifyListeners(reason);
};

const isExpired = (session) => {
  if (!session?.expiresAt) return false;
  return Date.now() + TOKEN_EXPIRY_BUFFER >= session.expiresAt;
};

const notifyListeners = (reason) => {
  const payload = {
    connected: Boolean(currentSession && !isExpired(currentSession)),
    profile: currentSession?.profile || null,
    expiresAt: currentSession?.expiresAt || null,
    reason: reason || null
  };
  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (error) {
      console.error('RouteFlow Discord auth: listener error', error);
    }
  });
};

const loadSession = () => {
  const stored = safeParseJson(readStorage(DISCORD_STORAGE_KEY));
  if (!stored) {
    currentSession = null;
    return;
  }
  currentSession = stored;
};

const clearStateToken = () => {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(DISCORD_STATE_KEY);
  } catch (error) {
    console.warn('RouteFlow Discord auth: unable to clear state token', error);
  }
};

const persistStateToken = (state) => {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(DISCORD_STATE_KEY, state);
  } catch (error) {
    console.warn('RouteFlow Discord auth: unable to persist state token', error);
  }
};

const consumeStateToken = () => {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const token = sessionStorage.getItem(DISCORD_STATE_KEY);
    clearStateToken();
    return token;
  } catch (error) {
    console.warn('RouteFlow Discord auth: unable to consume state token', error);
    return null;
  }
};

const sanitiseProfile = (profile) => {
  if (!profile || typeof profile !== 'object') return null;
  const { id, username, discriminator, global_name: globalName, avatar } = profile;
  const displayName = globalName || (discriminator && discriminator !== '0' ? `${username}#${discriminator}` : username);
  return {
    id,
    username,
    discriminator,
    globalName,
    displayName,
    avatar
  };
};

const fetchDiscordProfile = async (token) => {
  const response = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    const error = new Error(`Discord profile request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response.json();
};

const handleProfileRefresh = async () => {
  if (!currentSession || !currentSession.accessToken) return;
  try {
    const profile = await fetchDiscordProfile(currentSession.accessToken);
    const cleaned = sanitiseProfile(profile);
    saveSession({ ...currentSession, profile: cleaned, lastSyncedAt: Date.now() }, 'profile-refreshed');
  } catch (error) {
    console.error('RouteFlow Discord auth: profile refresh failed', error);
    if (error.status === 401 || error.status === 403) {
      saveSession(null, 'token-revoked');
    }
  }
};

const parseOAuthFragment = () => {
  const hash = window.location.hash;
  if (!hash || hash.length <= 1) return null;
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(fragment);
  if (!params.has('access_token')) return null;

  const expectedState = consumeStateToken();
  const returnedState = params.get('state');
  if (expectedState && returnedState !== expectedState) {
    console.error('RouteFlow Discord auth: state mismatch, ignoring response');
    return null;
  }

  const accessToken = params.get('access_token');
  const tokenType = params.get('token_type') || 'Bearer';
  const expiresIn = Number(params.get('expires_in') || '3600');
  const scope = params.get('scope') || '';

  try {
    const cleanUrl = window.location.href.split('#')[0];
    window.history.replaceState({}, document.title, cleanUrl);
  } catch (error) {
    console.warn('RouteFlow Discord auth: failed to clean callback URL', error);
  }

  return {
    accessToken,
    tokenType,
    scope,
    obtainedAt: Date.now(),
    expiresAt: Date.now() + expiresIn * 1000,
    profile: null
  };
};

const evaluateInitialState = () => {
  loadSession();
  const oauthResult = parseOAuthFragment();
  if (oauthResult?.accessToken) {
    saveSession(oauthResult, 'linked');
    handleProfileRefresh();
    return;
  }

  if (!currentSession) {
    notifyListeners('idle');
    return;
  }

  if (isExpired(currentSession)) {
    saveSession(null, 'expired');
    return;
  }

  if (!currentSession.profile) {
    handleProfileRefresh();
  } else {
    notifyListeners('restored');
  }
};

evaluateInitialState();

export const getDiscordStatus = () => ({
  connected: Boolean(currentSession && !isExpired(currentSession)),
  profile: currentSession?.profile || null,
  expiresAt: currentSession?.expiresAt || null
});

export const connectDiscord = () => {
  const config = getConfig();
  if (!isConfigValid(config)) {
    throw new Error('Discord OAuth is not configured. Set clientId and redirectUri in config.js.');
  }
  const state = generateState();
  persistStateToken(state);
  const authUrl = buildAuthUrl(config, state);
  window.location.href = authUrl;
};

export const disconnectDiscord = () => {
  saveSession(null, 'disconnected');
};

export const subscribeToDiscordStatus = (listener) => {
  if (typeof listener !== 'function') {
    return () => {};
  }
  listeners.add(listener);
  try {
    listener(getDiscordStatus());
  } catch (error) {
    console.error('RouteFlow Discord auth: subscriber failed', error);
  }
  return () => {
    listeners.delete(listener);
  };
};

export const isDiscordConfigured = () => isConfigValid(getConfig());

export const refreshDiscordProfile = () => handleProfileRefresh();
