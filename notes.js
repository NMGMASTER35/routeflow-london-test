const API_BASE_URL = (window.__ROUTEFLOW_API_BASE__ || '/api').replace(/\/$/, '');

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
      console.warn('Failed to parse notes response payload.', error);
    }
  }
  return null;
};

const getCurrentUser = () => firebase?.auth?.()?.currentUser || null;

const ensureAuthenticatedUser = (uid) => {
  const user = getCurrentUser();
  if (!user || user.uid !== uid) {
    throw new Error('You must be signed in to manage notes.');
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
    const message = payload?.error || 'Unable to complete notes request.';
    throw new Error(message);
  }
  return payload;
};

export async function getNotes(uid) {
  if (!uid) return [];
  const payload = await authorisedRequest(uid, '/notes');
  const notes = Array.isArray(payload?.notes) ? payload.notes : [];
  return notes.map((note) => ({ ...note }));
}

export async function addNote(uid, note) {
  if (!uid) throw new Error('A user id is required to add notes.');
  if (!note || typeof note !== 'object') {
    throw new Error('A note payload is required.');
  }
  const payload = await authorisedRequest(uid, '/notes', {
    method: 'POST',
    body: note
  });
  return payload?.note || null;
}

export async function updateNote(uid, noteId, data) {
  if (!uid) throw new Error('A user id is required to update notes.');
  if (!noteId) throw new Error('A note id is required to update entries.');
  const payload = await authorisedRequest(uid, `/notes/${encodeURIComponent(noteId)}`, {
    method: 'PUT',
    body: data
  });
  return payload?.note || null;
}

export async function removeNote(uid, noteId) {
  if (!uid) throw new Error('A user id is required to remove notes.');
  if (!noteId) throw new Error('A note id is required to remove entries.');
  await authorisedRequest(uid, `/notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE'
  });
  return true;
}
