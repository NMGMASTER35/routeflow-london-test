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
    '--primary': '#0f62fe',
    '--primary-dark': '#0043ce',
    '--accent-blue': '#30a0ff',
    '--accent-blue-dark': '#0f6ede',
    '--accent-blue-rgb': '48, 160, 255',
    '--accent-blue-dark-rgb': '15, 110, 222',
    '--accent-blue-tint-rgb': '186, 229, 255',
    '--accent-red': '#ff8b5f',
    '--accent-red-dark': '#ff6a3d',
    '--accent-red-rgb': '255, 139, 95',
    '--background-light': '#f2f7ff',
    '--foreground-light': '#0a1f3f',
    '--background-dark': '#020f24',
    '--foreground-dark': '#e6f0ff',
    '--card-bg-light': 'rgba(255, 255, 255, 0.92)',
    '--card-bg-dark': 'rgba(13, 23, 53, 0.92)',
    '--ink-rgb': '10, 31, 63',
    '--ink-soft-rgb': '36, 66, 118',
    '--transition': '0.32s cubic-bezier(.22,.83,.38,.99)'
  };

  const ACCENTS = {
    routeflow: {
      label: 'RouteFlow Horizon Blue',
      accent: '#30a0ff',
      accentDark: '#0f6ede',
      accentTint: '#bae5ff',
      primary: '#0f62fe',
      primaryDark: '#0043ce',
      red: '#ff8b5f',
      redDark: '#ff6a3d'
    }
  };

  const hexToRgb = (hex) => {
    if (typeof hex !== 'string') return null;
    const value = hex.trim().replace('#', '');
    if (![3, 6].includes(value.length)) return null;
    const expanded = value.length === 3
      ? value.split('').map((char) => char + char).join('')
      : value;
    const numeric = Number.parseInt(expanded, 16);
    if (Number.isNaN(numeric)) return null;
    const r = (numeric >> 16) & 255;
    const g = (numeric >> 8) & 255;
    const b = numeric & 255;
    return `${r}, ${g}, ${b}`;
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

    const primary = palette.primary ?? palette.accent;
    const primaryDark = palette.primaryDark ?? palette.accentDark;

    root.style.setProperty('--accent-blue', palette.accent);
    root.style.setProperty('--accent-blue-dark', palette.accentDark);
    root.style.setProperty('--primary', primary);
    root.style.setProperty('--primary-dark', primaryDark);
    root.style.setProperty('--navbar-accent', primary);
    root.style.setProperty('--navbar-accent-dark', primaryDark);

    const accentRgb = hexToRgb(palette.accent) ?? DEFAULT_TOKENS['--accent-blue-rgb'];
    const accentDarkRgb = hexToRgb(palette.accentDark) ?? DEFAULT_TOKENS['--accent-blue-dark-rgb'];
    const accentTintRgb = hexToRgb(palette.accentTint) ?? hexToRgb(palette.accent) ?? DEFAULT_TOKENS['--accent-blue-tint-rgb'];
    const accentRed = palette.red ?? DEFAULT_TOKENS['--accent-red'];
    const accentRedDark = palette.redDark ?? DEFAULT_TOKENS['--accent-red-dark'];
    const accentRedRgb = hexToRgb(accentRed) ?? DEFAULT_TOKENS['--accent-red-rgb'];

    root.style.setProperty('--accent-blue-rgb', accentRgb);
    root.style.setProperty('--accent-blue-dark-rgb', accentDarkRgb);
    root.style.setProperty('--accent-blue-tint-rgb', accentTintRgb);
    root.style.setProperty('--accent-red', accentRed);
    root.style.setProperty('--accent-red-dark', accentRedDark);
    root.style.setProperty('--accent-red-rgb', accentRedRgb);
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
