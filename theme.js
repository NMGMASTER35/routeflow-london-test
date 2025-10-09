(function () {
  const systemThemeQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

  const STORAGE_KEY = 'routeflow:preferences';
  const DEFAULT_PREFERENCES = {
    theme: 'light',
    accent: 'horizon',
    textScale: 1,
    highContrast: false,
    readableFont: false,
    reduceMotion: false,
    dyslexiaFriendly: false,
    focusHighlight: true,
    underlineLinks: false,
    textSpacing: false,
    monochrome: false,
    largeCursor: false,
    simplifiedLayout: false
  };

  const DEFAULT_TOKENS = {
    '--primary': '#2563eb',
    '--primary-dark': '#1d4ed8',
    '--accent-blue': '#2563eb',
    '--accent-blue-dark': '#1e40af',
    '--accent-blue-rgb': '37, 99, 235',
    '--accent-blue-dark-rgb': '30, 64, 175',
    '--accent-blue-tint-rgb': '147, 197, 253',
    '--accent-red': '#1e3a8a',
    '--accent-red-dark': '#172554',
    '--accent-red-rgb': '30, 58, 138',
    '--background-light': '#f5f7ff',
    '--foreground-light': '#0b1220',
    '--background-dark': '#020617',
    '--foreground-dark': '#e2e8f0',
    '--card-bg-light': 'rgba(255, 255, 255, 0.96)',
    '--card-bg-dark': 'rgba(2, 6, 23, 0.86)',
    '--ink-rgb': '11, 18, 32',
    '--ink-soft-rgb': '56, 70, 97',
    '--transition': '0.28s cubic-bezier(.25,.8,.25,1)'
  };

  const ACCENTS = {
    horizon: {
      label: 'Horizon Blue',
      accent: '#2563eb',
      accentDark: '#1d4ed8',
      accentTint: '#93c5fd',
      red: '#1e3a8a',
      redDark: '#1d4ed8'
    },
    skyline: {
      label: 'Skyline Indigo',
      accent: '#3730a3',
      accentDark: '#312e81',
      accentTint: '#c7d2fe',
      red: '#4338ca',
      redDark: '#312e81'
    },
    lagoon: {
      label: 'Lagoon Teal',
      accent: '#0ea5e9',
      accentDark: '#0369a1',
      accentTint: '#7dd3fc',
      red: '#1e3a8a',
      redDark: '#0f172a'
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

      if (Object.prototype.hasOwnProperty.call(partial, 'dyslexiaFriendly')) {
        result.dyslexiaFriendly = Boolean(partial.dyslexiaFriendly);
      }

      if (Object.prototype.hasOwnProperty.call(partial, 'focusHighlight')) {
        result.focusHighlight = Boolean(partial.focusHighlight);
      }

      if (Object.prototype.hasOwnProperty.call(partial, 'underlineLinks')) {
        result.underlineLinks = Boolean(partial.underlineLinks);
      }

      if (Object.prototype.hasOwnProperty.call(partial, 'textSpacing')) {
        result.textSpacing = Boolean(partial.textSpacing);
      }

      if (Object.prototype.hasOwnProperty.call(partial, 'monochrome')) {
        result.monochrome = Boolean(partial.monochrome);
      }

      if (Object.prototype.hasOwnProperty.call(partial, 'largeCursor')) {
        result.largeCursor = Boolean(partial.largeCursor);
      }

      if (Object.prototype.hasOwnProperty.call(partial, 'simplifiedLayout')) {
        result.simplifiedLayout = Boolean(partial.simplifiedLayout);
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
    reduceMotion: updates.reduceMotion ?? base.reduceMotion,
    dyslexiaFriendly: updates.dyslexiaFriendly ?? base.dyslexiaFriendly,
    focusHighlight: updates.focusHighlight ?? base.focusHighlight,
    underlineLinks: updates.underlineLinks ?? base.underlineLinks,
    textSpacing: updates.textSpacing ?? base.textSpacing,
    monochrome: updates.monochrome ?? base.monochrome,
    largeCursor: updates.largeCursor ?? base.largeCursor,
    simplifiedLayout: updates.simplifiedLayout ?? base.simplifiedLayout
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
    document.documentElement.dataset.readableFont = String(state.readableFont);
    document.documentElement.dataset.dyslexiaFriendly = String(state.dyslexiaFriendly);
    document.documentElement.dataset.focusHighlight = String(state.focusHighlight);
    document.documentElement.dataset.underlineLinks = String(state.underlineLinks);
    document.documentElement.dataset.textSpacing = String(state.textSpacing);
    document.documentElement.dataset.reduceMotion = String(state.reduceMotion);
    document.documentElement.dataset.monochrome = String(state.monochrome);
    document.documentElement.dataset.largeCursor = String(state.largeCursor);
    document.documentElement.dataset.simplifiedLayout = String(state.simplifiedLayout);

    applyHighContrast(root, body, state.highContrast);
    body.classList.toggle('readable-font', state.readableFont);
    body.classList.toggle('dyslexia-font', state.dyslexiaFriendly);
    body.classList.toggle('focus-highlight', state.focusHighlight);
    body.classList.toggle('underline-links', state.underlineLinks);
    body.classList.toggle('text-spacing', state.textSpacing);
    body.classList.toggle('monochrome', state.monochrome);
    body.classList.toggle('large-cursor', state.largeCursor);
    body.classList.toggle('simplified-layout', state.simplifiedLayout);
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
    body.dataset.dyslexiaFriendly = String(state.dyslexiaFriendly);
    body.dataset.focusHighlight = String(state.focusHighlight);
    body.dataset.underlineLinks = String(state.underlineLinks);
    body.dataset.textSpacing = String(state.textSpacing);
    body.dataset.monochrome = String(state.monochrome);
    body.dataset.largeCursor = String(state.largeCursor);
    body.dataset.simplifiedLayout = String(state.simplifiedLayout);
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
