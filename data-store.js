const STORAGE_PREFIX = 'routeflow';

export const STORAGE_KEYS = {
  withdrawnRoutes: `${STORAGE_PREFIX}.withdrawnRoutes`,
  routeTagOverrides: `${STORAGE_PREFIX}.routeTagOverrides`,
  blogPosts: `${STORAGE_PREFIX}.blogPosts`
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

const normaliseUrl = (value) => {
  const text = normaliseText(value);
  if (!text) return '';
  try {
    const base = typeof window !== 'undefined' && window.location ? window.location.href : undefined;
    return base ? new URL(text, base).href : new URL(text).href;
  } catch (error) {
    return text;
  }
};

export const storageAvailable = Boolean(storage);

export const createId = () => `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const parseDateValue = (value) => {
  if (!value && value !== 0) {
    return new Date();
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return new Date();
  }
  return date;
};

const toIsoString = (value) => {
  try {
    return parseDateValue(value).toISOString();
  } catch (error) {
    return new Date().toISOString();
  }
};

const sanitiseTagList = (value) => {
  if (!value) return [];
  const source = Array.isArray(value) ? value : String(value).split(',');
  return source
    .map((tag) => normaliseText(tag))
    .filter((tag, index, array) => tag && array.indexOf(tag) === index);
};

const estimateReadMinutes = (content) => {
  const text = normaliseText(content);
  if (!text) return 3;
  const words = text.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 180));
  return minutes;
};

const sanitiseBlogPost = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const title = normaliseText(entry.title);
  if (!title) return null;
  const id = normaliseText(entry.id) || createId();
  const summary = normaliseText(entry.summary);
  const content = normaliseText(entry.content);
  const author = normaliseText(entry.author) || 'RouteFlow London team';
  const heroImage = normaliseUrl(entry.heroImage);
  const publishedAt = toIsoString(entry.publishedAt || entry.date);
  const featured = Boolean(entry.featured);
  const tags = sanitiseTagList(entry.tags);
  const readTime = Number.isFinite(Number(entry.readTime)) && Number(entry.readTime) > 0
    ? Math.round(Number(entry.readTime))
    : estimateReadMinutes(content || summary);

  return {
    id,
    title,
    summary,
    content,
    author,
    heroImage,
    publishedAt,
    tags,
    featured,
    readTime
  };
};

const sortBlogPostsByDateDesc = (a, b) => {
  const timeA = parseDateValue(a?.publishedAt).getTime();
  const timeB = parseDateValue(b?.publishedAt).getTime();
  return timeB - timeA;
};

const sanitiseBlogCollection = (collection) => {
  if (!Array.isArray(collection)) return [];
  return collection
    .map((item) => sanitiseBlogPost(item))
    .filter(Boolean)
    .sort(sortBlogPostsByDateDesc);
};

const cloneBlogCollection = (collection) =>
  Array.isArray(collection)
    ? collection.map((post) => ({
        ...post,
        tags: Array.isArray(post.tags) ? [...post.tags] : []
      }))
    : [];

const DEFAULT_BLOG_POSTS = sanitiseBlogCollection([
  {
    id: 'blog-city-pulse',
    title: 'Keeping pace with London\'s network',
    summary: 'See how RouteFlow London brings live arrivals, rare workings, and smart planning into a single dashboard.',
    content:
      'London never stands still—and neither should your travel tools. RouteFlow London now stitches together live arrivals, ' +
      'service alerts, and enthusiast insights so you can pivot quickly when the network changes. From highlighting rare ' +
      'allocations to surfacing accessibility information, the platform is designed to feel personal from the moment you sign in.',
    author: 'RouteFlow London team',
    publishedAt: '2025-04-18T09:30:00.000Z',
    tags: ['Product updates']
  },
  {
    id: 'blog-arrivals-refresh',
    title: 'Live tracking gets a smarter arrivals board',
    summary: 'The tracking console now groups departures by mode, shows richer stop context, and remembers your favourites.',
    content:
      'We have rebuilt the arrivals board with clarity in mind. Search suggestions surface faster, while new layout cues make it ' +
      'easy to separate buses, trams, river services and more. Pin your go-to stops, add quick notes for special workings, and ' +
      'watch everything refresh automatically without losing your place.',
    author: 'Product design',
    publishedAt: '2025-05-06T07:45:00.000Z',
    tags: ['Tracking', 'Design']
  },
  {
    id: 'blog-journey-studio',
    title: 'Planning journeys with confidence',
    summary: 'Multi-mode filters, accessibility options, and clearer itineraries make the planner ready for every kind of trip.',
    content:
      'Tell RouteFlow where you are heading and we\'ll present options that respect the way you travel. Choose the modes you prefer, ' +
      'filter out stairs or escalators, and compare legs at a glance. Each journey shows interchanges, line colours, and essential ' +
      'timings so you know exactly what to expect.',
    author: 'Journey planning',
    publishedAt: '2025-05-12T11:15:00.000Z',
    tags: ['Planning']
  }
]);

export const getStoredBlogPosts = () => {
  const raw = readItem(STORAGE_KEYS.blogPosts);
  const parsed = sanitiseBlogCollection(parseJson(raw, []));
  if (parsed.length) {
    return cloneBlogCollection(parsed);
  }
  return cloneBlogCollection(DEFAULT_BLOG_POSTS);
};

export const setStoredBlogPosts = (posts) => {
  const cleaned = sanitiseBlogCollection(posts);
  writeItem(STORAGE_KEYS.blogPosts, JSON.stringify(cleaned));
  return cloneBlogCollection(cleaned);
};

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

