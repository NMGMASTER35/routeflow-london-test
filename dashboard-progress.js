const API_BASE_URL = (window.__ROUTEFLOW_API_BASE__ || '/api').replace(/\/$/, '');

const buildDashboardPath = (uid) => `${API_BASE_URL}/profile/${encodeURIComponent(uid)}/dashboard`;

const parseJsonResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return null;
  }
  try {
    return await response.json();
  } catch (error) {
    console.warn('RouteFlow dashboard progress: failed to parse response payload.', error);
    return null;
  }
};

const getCurrentUser = () => {
  const routeflowAuth = window.RouteflowAuth;
  if (routeflowAuth?.getCurrentUser) {
    try {
      return routeflowAuth.getCurrentUser();
    } catch (error) {
      console.error('RouteFlow dashboard progress: unable to read user from RouteflowAuth.', error);
    }
  }
  try {
    if (typeof firebase !== 'undefined' && typeof firebase.auth === 'function') {
      const auth = firebase.auth();
      return auth?.currentUser || null;
    }
  } catch (error) {
    console.error('RouteFlow dashboard progress: unable to resolve Firebase auth user.', error);
  }
  return null;
};

const ensureAuthenticatedUser = (uid) => {
  const user = getCurrentUser();
  if (!user || user.uid !== uid) {
    throw new Error('You must be signed in to sync dashboard progress.');
  }
  if (typeof user.getIdToken !== 'function') {
    throw new Error('A connected RouteFlow account is required to sync progress.');
  }
  return user;
};

const authorisedRequest = async (uid, { method = 'GET', body = null } = {}) => {
  const user = ensureAuthenticatedUser(uid);
  const token = await user.getIdToken();
  const headers = {
    Authorization: `Bearer ${token}`
  };
  let requestBody = body;
  if (requestBody !== null && requestBody !== undefined) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(requestBody);
  }

  const response = await fetch(buildDashboardPath(uid), {
    method,
    headers,
    body: requestBody
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    const message = payload?.error || 'Unable to complete dashboard progress request.';
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

export async function getDashboardState(uid) {
  if (!uid) return null;
  try {
    const payload = await authorisedRequest(uid, { method: 'GET' });
    if (payload && typeof payload === 'object') {
      return payload.state ?? null;
    }
    return null;
  } catch (error) {
    if (error?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function saveDashboardState(uid, state) {
  if (!uid) {
    throw new Error('A user id is required to save dashboard progress.');
  }
  const payload = await authorisedRequest(uid, {
    method: 'PUT',
    body: { state: state && typeof state === 'object' ? state : {} }
  });
  if (payload && typeof payload === 'object') {
    return payload.state ?? {};
  }
  return state && typeof state === 'object' ? state : {};
}
