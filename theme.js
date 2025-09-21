(function () {
  const systemThemeQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

  const STORAGE_KEY = 'routeflow:preferences';
  const DEFAULT_PREFERENCES = {
    theme: 'light',
    accent: 'routeflow',
    textScale: 1,
    highContrast: false,
    readableFont: false,
    reduceMotion: false
  };

  const DEFAULT_TOKENS = {
    '--primary': '#003688',
    '--primary-dark': '#002a5c',
    '--accent-blue': '#003688',
    '--accent-blue-dark': '#002a5c',
    '--accent-red': '#d32f2f',
    '--accent-red-dark': '#a61c1c',
    '--background-light': '#ffffff',
    '--foreground-light': '#0b1f4b',
    '--background-dark': '#ffffff',
    '--foreground-dark': '#0b1f4b',
    '--card-bg-light': '#ffffff',
    '--card-bg-dark': '#ffffff',
    '--transition': '0.24s cubic-bezier(.4,0,.2,1)'
  };

  const ACCENTS = {
    routeflow: {
      label: 'RouteFlow Red & Blue',
      accent: '#003688',
      accentDark: '#002a5c',
      red: '#d32f2f',
      redDark: '#a61c1c'
    }
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const safeParse = (value) => {
    if (typeof value !== 'string') return null;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      console.warn('Routeflow preferences: failed to parse stored value', error);
      return null;
    }
  };

  const readStorage = () => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    } catch (error) {
      console.warn('Routeflow preferences: unable to access localStorage', error);
      return null;
    }
  };

  const writeStorage = (data) => {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Routeflow preferences: unable to persist preferences', error);
    }
  };

  const clearStorage = () => {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Routeflow preferences: unable to clear preferences', error);
    }
  };

  const sanitise = (partial) => {
    const result = {};

    if (partial && typeof partial === 'object') {
      if (Object.prototype.hasOwnProperty.call(partial, 'theme')) {
        result.theme = 'light';
      }

      if (Object.prototype.hasOwnProperty.call(partial, 'accent')) {
        result.accent = Object.prototype.hasOwnProperty.call(ACCENTS, partial.accent)
          ? partial.accent
          : DEFAULT_PREFERENCES.accent;
      }

      if (Object.prototype.hasOwnProperty.call(partial, 'textScale')) {
        const numeric = Number(partial.textScale);
        result.textScale = Number.isFinite(numeric)
          ? clamp(numeric, 0.9, 1.3)
          : DEFAULT_PREFERENCES.textScale;
      }

      if (Object.prototype.hasOwnProperty.call(partial, 'highContrast')) {
        result.highContrast = Boolean(partial.highContrast);
      }

      if (Object.prototype.hasOwnProperty.call(partial, 'readableFont')) {
        result.readableFont = Boolean(partial.readableFont);
      }

      if (Object.prototype.hasOwnProperty.call(partial, 'reduceMotion')) {
        result.reduceMotion = Boolean(partial.reduceMotion);
      }
    }

    return result;
  };

  const mergePreferences = (base, updates) => ({
    theme: updates.theme ?? base.theme,
    accent: updates.accent ?? base.accent,
    textScale: updates.textScale ?? base.textScale,
    highContrast: updates.highContrast ?? base.highContrast,
    readableFont: updates.readableFont ?? base.readableFont,
    reduceMotion: updates.reduceMotion ?? base.reduceMotion
  });

  const loadPreferences = () => {
    const stored = safeParse(readStorage());
    const sanitised = sanitise(stored);
    themeLocked = Object.prototype.hasOwnProperty.call(sanitised, 'theme');
    return mergePreferences(DEFAULT_PREFERENCES, sanitised);
  };

  let themeLocked = false;
  let state = loadPreferences();
  const listeners = new Set();

  const notify = () => {
    const snapshot = { ...state };
    listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('Routeflow preferences: listener error', error);
      }
    });
    document.dispatchEvent(new CustomEvent('routeflow:preferences-changed', {
      detail: snapshot
    }));
  };

  const applyThemeVariables = (root, accent) => {
    const palette = accent ?? ACCENTS[state.accent] ?? ACCENTS[DEFAULT_PREFERENCES.accent];
    if (!palette) return;

    root.style.setProperty('--accent-blue', palette.accent);
    root.style.setProperty('--accent-blue-dark', palette.accentDark);
    root.style.setProperty('--primary', palette.accent);
    root.style.setProperty('--primary-dark', palette.accentDark);
    root.style.setProperty('--navbar-accent', palette.accent);
    root.style.setProperty('--navbar-accent-dark', palette.accentDark);
    root.style.setProperty('--accent-red', palette.red ?? DEFAULT_TOKENS['--accent-red']);
    root.style.setProperty('--accent-red-dark', palette.redDark ?? DEFAULT_TOKENS['--accent-red-dark']);
  };

  const resetVariable = (root, name) => {
    if (Object.prototype.hasOwnProperty.call(DEFAULT_TOKENS, name)) {
      root.style.setProperty(name, DEFAULT_TOKENS[name]);
    } else {
      root.style.removeProperty(name);
    }
  };

  const applyHighContrast = (root, body, enabled) => {
    if (enabled) {
      root.style.setProperty('--background-light', '#ffffff');
      root.style.setProperty('--foreground-light', '#000000');
      root.style.setProperty('--card-bg-light', '#ffffff');
      root.style.setProperty('--background-dark', '#000000');
      root.style.setProperty('--foreground-dark', '#ffffff');
      root.style.setProperty('--card-bg-dark', '#040404');
    } else {
      resetVariable(root, '--background-light');
      resetVariable(root, '--foreground-light');
      resetVariable(root, '--card-bg-light');
      resetVariable(root, '--background-dark');
      resetVariable(root, '--foreground-dark');
      resetVariable(root, '--card-bg-dark');
    }

    body.classList.toggle('high-contrast', enabled);
  };

  const applyReduceMotion = (root, body, enabled) => {
    if (enabled) {
      root.style.setProperty('--transition', '0s');
    } else {
      resetVariable(root, '--transition');
    }
    body.classList.toggle('reduced-motion', enabled);
  };

  const applyPreferences = () => {
    const root = document.documentElement;
    const body = document.body;

    if (!root || !body) return;

    const accentKey = Object.prototype.hasOwnProperty.call(ACCENTS, state.accent)
      ? state.accent
      : DEFAULT_PREFERENCES.accent;
    state.accent = accentKey;
    const palette = ACCENTS[accentKey];

    applyThemeVariables(root, palette);

    state.theme = 'light';
    body.classList.remove('dark-mode');
    document.documentElement.style.colorScheme = 'light';

    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.accent = state.accent;
    document.documentElement.dataset.highContrast = String(state.highContrast);
    document.documentElement.dataset.reduceMotion = String(state.reduceMotion);

    applyHighContrast(root, body, state.highContrast);
    body.classList.toggle('readable-font', state.readableFont);
    applyReduceMotion(root, body, state.reduceMotion);

    const fontScale = clamp(Number(state.textScale) || DEFAULT_PREFERENCES.textScale, 0.9, 1.3);
    document.documentElement.style.fontSize = `${Math.round(fontScale * 100)}%`;
    root.style.setProperty('--font-scale', fontScale);
    root.style.setProperty('--accent-key', state.accent);
    document.documentElement.dataset.textScale = fontScale.toFixed(2);

    body.dataset.theme = 'light';
    body.dataset.accent = state.accent;
    body.dataset.highContrast = String(state.highContrast);
    body.dataset.readableFont = String(state.readableFont);
    body.dataset.reduceMotion = String(state.reduceMotion);
    body.dataset.textScale = fontScale.toFixed(2);
  };

  const persist = () => {
    writeStorage(state);
  };

  const setPreferences = (updates) => {
    const safeUpdates = sanitise(updates);
    if (Object.prototype.hasOwnProperty.call(safeUpdates, 'theme')) {
      themeLocked = true;
    }
    state = mergePreferences(state, safeUpdates);
    persist();
    applyPreferences();
    notify();
  };

  const resetPreferences = () => {
    themeLocked = false;
    state = { ...DEFAULT_PREFERENCES };
    clearStorage();
    applyPreferences();
    notify();
  };

  window.RouteflowPreferences = {
    getPreferences: () => ({ ...state }),
    setPreferences,
    setPreference: (key, value) => setPreferences({ [key]: value }),
    resetPreferences,
    getAccentOptions: () => {
      const copy = {};
      Object.keys(ACCENTS).forEach((key) => {
        copy[key] = { ...ACCENTS[key] };
      });
      return copy;
    },
    onChange: (listener) => {
      if (typeof listener !== 'function') {
        return () => {};
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };

  const refreshFromStorage = () => {
    const latest = loadPreferences();
    const hasChanged = Object.keys(DEFAULT_PREFERENCES).some((key) => latest[key] !== state[key]);
    if (hasChanged) {
      state = latest;
      applyPreferences();
      notify();
    }
  };

  const applySystemTheme = () => {
    if (state.theme !== 'light') {
      state = mergePreferences(state, { theme: 'light' });
      applyPreferences();
      notify();
    }
  };

  if (systemThemeQuery) {
    const handleSystemThemeChange = () => applySystemTheme();
    if (typeof systemThemeQuery.addEventListener === 'function') {
      systemThemeQuery.addEventListener('change', handleSystemThemeChange);
    } else if (typeof systemThemeQuery.addListener === 'function') {
      systemThemeQuery.addListener(handleSystemThemeChange);
    }
  }

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      refreshFromStorage();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPreferences, { once: true });
  }

  applyPreferences();
})();
