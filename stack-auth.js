(function initialiseStackAuth() {
  const STACK_STORAGE_PREFIX = 'routeflow:stack-auth:identity:';

  const PROVIDERS = Object.freeze({
    'google.com': {
      id: 'google.com',
      key: 'google',
      label: 'Google',
      defaultDisplayName: 'Google Navigator',
      defaultEmailSuffix: '@google.stack.routeflow',
      description: 'Use your Google account with Stack Auth.'
    },
    'github.com': {
      id: 'github.com',
      key: 'github',
      label: 'GitHub',
      defaultDisplayName: 'GitHub Pathfinder',
      defaultEmailSuffix: '@github.stack.routeflow',
      description: 'Connect GitHub to unlock developer tooling perks.'
    },
    'discord.com': {
      id: 'discord.com',
      key: 'discord',
      label: 'Discord',
      defaultDisplayName: 'Discord Strategist',
      defaultEmailSuffix: '@discord.stack.routeflow',
      description: 'Link Discord to access community missions.'
    }
  });

  const PROVIDER_ALIASES = Object.freeze({
    google: 'google.com',
    github: 'github.com',
    discord: 'discord.com'
  });

  const normaliseProviderId = (value) => {
    if (!value) return null;
    const trimmed = String(value).trim().toLowerCase();
    if (!trimmed) return null;
    if (PROVIDER_ALIASES[trimmed]) {
      return PROVIDER_ALIASES[trimmed];
    }
    if (PROVIDERS[trimmed]) {
      return trimmed;
    }
    if (trimmed.endsWith('.com') && PROVIDERS[trimmed]) {
      return trimmed;
    }
    const inferred = `${trimmed}.com`;
    if (PROVIDERS[inferred]) {
      return inferred;
    }
    return trimmed;
  };

  const storageKeyForProvider = (providerId) => {
    const normalised = normaliseProviderId(providerId);
    if (!normalised) {
      return `${STACK_STORAGE_PREFIX}unknown`;
    }
    const meta = PROVIDERS[normalised];
    return `${STACK_STORAGE_PREFIX}${meta?.key || normalised}`;
  };

  const readStoredIdentity = (providerId) => {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    try {
      const raw = localStorage.getItem(storageKeyForProvider(providerId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      if (!parsed.providerId) {
        parsed.providerId = normaliseProviderId(providerId);
      }
      return parsed;
    } catch (error) {
      console.warn('Stack Auth: unable to read cached identity.', error);
      return null;
    }
  };

  const writeStoredIdentity = (providerId, identity) => {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      if (!identity) {
        localStorage.removeItem(storageKeyForProvider(providerId));
        return;
      }
      const payload = {
        providerId: normaliseProviderId(providerId),
        email: identity.email || null,
        displayName: identity.displayName || null,
        avatarUrl: identity.avatarUrl || null,
        lastUsedAt: Date.now()
      };
      localStorage.setItem(storageKeyForProvider(providerId), JSON.stringify(payload));
    } catch (error) {
      console.warn('Stack Auth: unable to persist cached identity.', error);
    }
  };

  const resolveDefaultEmail = (providerId) => {
    const meta = PROVIDERS[providerId] || PROVIDERS[normaliseProviderId(providerId)] || null;
    if (!meta) {
      return `stack.user.${Date.now()}@routeflow`; // fallback
    }
    return `${meta.key}.user.${Date.now()}${meta.defaultEmailSuffix}`;
  };

  const resolveDefaultDisplayName = (providerId) => {
    const meta = PROVIDERS[providerId] || PROVIDERS[normaliseProviderId(providerId)] || null;
    if (!meta) {
      return 'Stack Auth Explorer';
    }
    return meta.defaultDisplayName;
  };

  const promptForIdentity = (providerId, options = {}) => {
    const meta = PROVIDERS[providerId] || PROVIDERS[normaliseProviderId(providerId)] || null;
    const label = meta?.label || 'Stack Auth provider';
    const stored = readStoredIdentity(providerId) || {};
    const defaultEmail = options.email || stored.email || resolveDefaultEmail(providerId);
    const email = window.prompt(`Stack Auth — enter your ${label} email`, defaultEmail);
    if (!email) {
      throw new Error(`${label} sign-in cancelled.`);
    }
    const defaultName = options.displayName || stored.displayName || resolveDefaultDisplayName(providerId);
    const displayName = window.prompt(`Stack Auth — how should we address you?`, defaultName) || defaultName;
    const identity = {
      providerId: normaliseProviderId(providerId),
      email: email.trim(),
      displayName: displayName.trim(),
      avatarUrl: stored.avatarUrl || null
    };
    writeStoredIdentity(providerId, identity);
    return identity;
  };

  const startProviderFlow = async (providerId, options = {}) => {
    const normalised = normaliseProviderId(providerId);
    if (!normalised || !PROVIDERS[normalised]) {
      throw new Error('Stack Auth provider is not configured.');
    }
    // Simulate asynchronous flow so consumers can await a promise similar to OAuth popups
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const identity = promptForIdentity(normalised, options);
          resolve(identity);
        } catch (error) {
          reject(error);
        }
      }, 10);
    });
  };

  const api = {
    providers: PROVIDERS,
    aliases: PROVIDER_ALIASES,
    normaliseProviderId,
    getStoredIdentity(providerId) {
      return readStoredIdentity(providerId);
    },
    rememberIdentity(providerId, identity) {
      writeStoredIdentity(providerId, identity);
    },
    startProviderFlow(providerId, options = {}) {
      return startProviderFlow(providerId, options);
    }
  };

  window.RouteflowStackAuth = Object.freeze({
    ...(window.RouteflowStackAuth || {}),
    ...api
  });
})();
