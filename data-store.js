const STORAGE_PREFIX = 'routeflow';

export const STORAGE_KEYS = {
  withdrawnRoutes: `${STORAGE_PREFIX}.withdrawnRoutes`,
  routeTagOverrides: `${STORAGE_PREFIX}.routeTagOverrides`
};

const resolveStorage = () => {
  if (typeof window === 'undefined' || !('localStorage' in window)) {
    return null;
  }
  try {
    const testKey = `${STORAGE_PREFIX}.test`;
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch (error) {
    console.warn('Local storage is not available for admin data:', error);
    return null;
  }
};

const storage = resolveStorage();

const readItem = (key) => {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch (error) {
    console.warn('Failed to read admin data from storage:', error);
    return null;
  }
};

const writeItem = (key, value) => {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn('Failed to write admin data to storage:', error);
    return false;
  }
};

const parseJson = (value, fallback) => {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('Failed to parse stored admin data:', error);
    return fallback;
  }
};

const normaliseText = (value) => (typeof value === 'string' ? value.trim() : '');

export const storageAvailable = Boolean(storage);

export const createId = () => `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const sanitiseWithdrawnEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const route = normaliseText(entry.route);
  if (!route) return null;
  const id = normaliseText(entry.id) || createId();
  return {
    id,
    route,
    start: normaliseText(entry.start),
    end: normaliseText(entry.end),
    launched: normaliseText(entry.launched),
    withdrawn: normaliseText(entry.withdrawn),
    operator: normaliseText(entry.operator),
    replacedBy: normaliseText(entry.replacedBy)
  };
};

const sanitiseRouteTagOverride = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const route = normaliseText(entry.route);
  if (!route) return null;
  const tags = Array.isArray(entry.tags)
    ? entry.tags
        .map((tag) => normaliseText(tag))
        .filter((tag, index, source) => tag && source.indexOf(tag) === index)
    : [];
  if (!tags.length) return null;
  const id = normaliseText(entry.id) || createId();
  return { id, route, tags };
};

const sortByRoute = (a, b) => a.route.localeCompare(b.route, 'en', { numeric: true });

const sanitiseCollection = (collection, sanitiser, sort = false) => {
  if (!Array.isArray(collection)) return [];
  const cleaned = collection
    .map((item) => sanitiser(item))
    .filter(Boolean);
  if (sort) {
    cleaned.sort(sortByRoute);
  }
  return cleaned;
};

export const getStoredWithdrawnRoutes = () => {
  const raw = readItem(STORAGE_KEYS.withdrawnRoutes);
  return sanitiseCollection(parseJson(raw, []), sanitiseWithdrawnEntry, true);
};

export const setStoredWithdrawnRoutes = (routes) => {
  const cleaned = sanitiseCollection(routes, sanitiseWithdrawnEntry, true);
  writeItem(STORAGE_KEYS.withdrawnRoutes, JSON.stringify(cleaned));
  return cleaned;
};

export const getRouteTagOverrides = () => {
  const raw = readItem(STORAGE_KEYS.routeTagOverrides);
  return sanitiseCollection(parseJson(raw, []), sanitiseRouteTagOverride, true);
};

export const setRouteTagOverrides = (overrides) => {
  const cleaned = sanitiseCollection(overrides, sanitiseRouteTagOverride, true);
  writeItem(STORAGE_KEYS.routeTagOverrides, JSON.stringify(cleaned));
  return cleaned;
};

export const normaliseRouteKey = (value) => normaliseText(value).toUpperCase();

export const getRouteTagOverrideMap = (overrides = getRouteTagOverrides()) => {
  const map = new Map();
  overrides.forEach((entry) => {
    const key = normaliseRouteKey(entry.route);
    if (!key) return;
    map.set(key, [...entry.tags]);
  });
  return map;
};

