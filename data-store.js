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
    id: 'blog-weekly-roundup-2025-05-23',
    title: 'Weekly London Transport News – 23 May 2025',
    summary: 'Northern line closures, express bus extras and Docklands works to note before the bank holiday.',
    content:
      'Track closures impact the Northern line between Golders Green and Edgware across the long weekend, with a rail replacement ' +
      'loop published inside RouteFlow so you can quickly check frequencies. Additional express journeys run on the X26 and X140 ' +
      'to support airport travel, while a slimmed timetable affects Woolwich Ferry crossings late Sunday.',
    author: 'Network desk',
    publishedAt: '2025-05-23T16:30:00.000Z',
    tags: ['Weekly London Transport News']
  },
  {
    id: 'blog-consultation-summer-2025',
    title: 'Have your say on summer bus consultations',
    summary: 'Transport for London is consulting on Central London night routes, Croydon tram resilience and a new Sutton Superloop link.',
    content:
      'Three consultations launched this week. Night buses N11 and N29 are proposed to swap termini to balance demand in the West ' +
      'End, Croydon trams gain additional turnback capability at Sandilands to improve recovery, and a Sutton to Kingston Superloop ' +
      'branch would join the orbital express family. We have highlighted the closing dates and supporting documents for each.',
    author: 'Policy and planning',
    publishedAt: '2025-05-21T09:00:00.000Z',
    tags: ['New London Consultations']
  },
  {
    id: 'blog-bus-models-electric-era',
    title: 'Meet London’s newest electric double-deckers',
    summary: 'A closer look at the Wright StreetDeck Electroliner and BYD-Alexander Dennis B12 that are joining busy trunk corridors.',
    content:
      'Routes 43 and 133 headline the rollout of the StreetDeck Electroliner this quarter, bringing faster charging, lighter shells ' +
      'and upgraded driver assistance. The BYD-Alexander Dennis B12 batches destined for Putney convert long-standing diesel duties ' +
      'while keeping capacity identical for school peaks.',
    author: 'Fleet editor',
    publishedAt: '2025-05-18T13:15:00.000Z',
    tags: ['Learn about bus models']
  },
  {
    id: 'blog-weekly-roundup-2025-05-16',
    title: 'Weekly London Transport News – 16 May 2025',
    summary: 'Elizabeth line diversions, Jubilee line testing nights and South London roadworks to plan around.',
    content:
      'Sunday morning diversions on the Elizabeth line divert trains into Platform 5 at Paddington, while Jubilee line extensions ' +
      'run late-night test services to trial the new timetable. Expect staged closures along Brixton Road through May as gas main ' +
      'works restrict traffic to single lanes in each direction.',
    author: 'Network desk',
    publishedAt: '2025-05-16T16:45:00.000Z',
    tags: ['Weekly London Transport News']
  },
  {
    id: 'blog-consultation-night-bus-refresh',
    title: 'Night bus refresh for the West End',
    summary: 'TfL proposes tweaks to the night grid between Tottenham Court Road, Victoria and Chelsea Embankment to better reflect late traffic.',
    content:
      'A proposed reroute of the N26 introduces a direct Marble Arch to Victoria link overnight, while the N5 would short-turn at ' +
      'Chelsea to release resource for an every-12-minute N137. We break down the reasoning, affected stops and how to respond to ' +
      'the consultation before it closes on 14 June.',
    author: 'Policy and planning',
    publishedAt: '2025-05-14T08:20:00.000Z',
    tags: ['New London Consultations']
  },
  {
    id: 'blog-bus-models-refurb',
    title: 'Inside the mid-life refits keeping hybrids fresh',
    summary: 'Stagecoach and Arriva are refreshing their hybrid fleets with brighter interiors, USB-C charging and accessibility upgrades.',
    content:
      'Take a tour through the revamped Volvo B5LH and Enviro400H batches that return from refurbishment. We highlight the updated ' +
      'saloon lighting, seat trims and revised wheelchair bays, plus the garages scheduling early conversions so you know where to ' +
      'spot them first.',
    author: 'Fleet editor',
    publishedAt: '2025-05-10T11:00:00.000Z',
    tags: ['Learn about bus models']
  },
  {
    id: 'blog-city-pulse',
    title: 'Keeping pace with London’s network',
    summary: 'See how RouteFlow London brings live arrivals, rare workings and smart planning into a single dashboard.',
    content:
      'London never stands still—and neither should your travel tools. RouteFlow London now stitches together live arrivals, service ' +
      'alerts and enthusiast insights so you can pivot quickly when the network changes. From highlighting rare allocations to ' +
      'surfacing accessibility information, the platform is designed to feel personal from the moment you sign in.',
    author: 'RouteFlow London team',
    publishedAt: '2025-04-18T09:30:00.000Z',
    tags: ['Product updates']
  },
  {
    id: 'blog-arrivals-refresh',
    title: 'Live tracking gets a smarter arrivals board',
    summary: 'The tracking console now groups departures by mode, shows richer stop context and remembers your favourites.',
    content:
      'We have rebuilt the arrivals board with clarity in mind. Search suggestions surface faster, while new layout cues make it easy ' +
      'to separate buses, trams, river services and more. Pin your go-to stops, add quick notes for special workings and watch ' +
      'everything refresh automatically without losing your place.',
    author: 'Product design',
    publishedAt: '2025-05-06T07:45:00.000Z',
    tags: ['Tracking', 'Design']
  },
  {
    id: 'blog-journey-studio',
    title: 'Planning journeys with confidence',
    summary: 'Multi-mode filters, accessibility options and clearer itineraries make the planner ready for every kind of trip.',
    content:
      'Tell RouteFlow where you are heading and we’ll present options that respect the way you travel. Choose the modes you prefer, ' +
      'filter out stairs or escalators and compare legs at a glance. Each journey shows interchanges, line colours and essential ' +
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

