function resolveApiBase(defaultBase = '/api') {
  const rawBase = typeof window !== 'undefined' ? window.__ROUTEFLOW_API_BASE__ : undefined;
  if (typeof rawBase !== 'string') {
    return defaultBase;
  }
  const trimmed = rawBase.trim();
  if (!trimmed || trimmed === '/') {
    return defaultBase;
  }
  const normalised = trimmed.replace(/\/+$/, '');
  return normalised || defaultBase;
}

const API_BASE_URL = resolveApiBase('/api');

const buildProfilePath = (uid, suffix = '') => {
  const safeSuffix = suffix ? (suffix.startsWith('/') ? suffix : `/${suffix}`) : '';
  return `${API_BASE_URL}/profile/${encodeURIComponent(uid)}${safeSuffix}`;
};

const parseJsonResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch (error) {
      console.warn('Failed to parse favourites response payload.', error);
    }
  }
  return null;
};

const getCurrentUser = () => {
  const routeflowAuth = window.RouteflowAuth;
  if (routeflowAuth?.getCurrentUser) {
    try {
      return routeflowAuth.getCurrentUser();
    } catch (error) {
      console.error('RouteFlow favourites: unable to read user from RouteflowAuth.', error);
    }
  }
  try {
    if (typeof firebase !== 'undefined' && typeof firebase.auth === 'function') {
      const auth = firebase.auth();
      return auth?.currentUser || null;
    }
  } catch (error) {
    console.error('RouteFlow favourites: unable to resolve Firebase auth user.', error);
  }
  return null;
};

const ensureAuthenticatedUser = (uid) => {
  const user = getCurrentUser();
  if (!user || user.uid !== uid) {
    throw new Error('You must be signed in to manage favourites.');
  }
  if (typeof user.getIdToken !== 'function') {
    throw new Error('This action requires a connected RouteFlow account.');
  }
  return user;
};

const authorisedRequest = async (uid, path, options = {}) => {
  const user = ensureAuthenticatedUser(uid);
  const token = await user.getIdToken();
  const requestInit = {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  };

  const response = await fetch(buildProfilePath(uid, path), requestInit);
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    const message = payload?.error || 'Unable to complete favourites request.';
    throw new Error(message);
  }
  return payload;
};

export async function getFavourites(uid) {
  if (!uid) return [];
  const payload = await authorisedRequest(uid, '/favourites');
  const favourites = Array.isArray(payload?.favourites) ? payload.favourites : [];
  return favourites.map((favourite) => ({ ...favourite }));
}

export async function addFavourite(uid, favourite) {
  if (!uid) throw new Error('A user id is required to add favourites.');
  if (!favourite || typeof favourite !== 'object') {
    throw new Error('A favourite payload is required.');
  }
  const payload = await authorisedRequest(uid, '/favourites', {
    method: 'POST',
    body: favourite
  });
  return payload?.favourite || null;
}

export async function updateFavourite(uid, favouriteId, data) {
  if (!uid) throw new Error('A user id is required to update favourites.');
  if (!favouriteId) throw new Error('A favourite id is required to update entries.');
  const payload = await authorisedRequest(uid, `/favourites/${encodeURIComponent(favouriteId)}`, {
    method: 'PUT',
    body: data
  });
  return payload?.favourite || null;
}

export async function removeFavourite(uid, favouriteId) {
  if (!uid) throw new Error('A user id is required to remove favourites.');
  if (!favouriteId) throw new Error('A favourite id is required to remove entries.');
  await authorisedRequest(uid, `/favourites/${encodeURIComponent(favouriteId)}`, {
    method: 'DELETE'
  });
  return true;
}
