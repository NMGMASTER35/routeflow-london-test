import { getFavourites, removeFavourite } from './favourites.js';
import { getRecents } from './recents.js';
import { getNotes, addNote, updateNote, removeNote } from './notes.js';
import { inferFavouriteType, resolveFavouriteTitle, buildFavouriteMeta } from './favourite-utils.js';

const heroElements = {
  avatar: document.getElementById('profileAvatar'),
  role: document.getElementById('profileRole'),
  name: document.getElementById('profileName'),
  username: document.getElementById('profileUsername'),
  email: document.getElementById('profileEmail'),
  displayName: document.getElementById('profileDisplayName'),
  handle: document.getElementById('profileHandle'),
  memberSince: document.getElementById('profileMemberSince'),
  lastActive: document.getElementById('profileLastActive'),
  uid: document.getElementById('profileUid'),
  primaryEmail: document.getElementById('profilePrimaryEmail'),
  openSettings: document.getElementById('openSettings'),
  signOut: document.getElementById('signOutBtn'),
  edit: document.getElementById('editProfileBtn'),
  refresh: document.getElementById('refreshProfile')
};

const statsElements = {
  favourites: document.getElementById('statFavourites'),
  notes: document.getElementById('statNotes'),
  recents: document.getElementById('statRecents'),
  message: document.getElementById('profileStatusMessage')
};

const listElements = {
  favourites: document.getElementById('profileFavouritesList'),
  recents: document.getElementById('profileRecentsList'),
  notes: document.getElementById('profileNotesList'),
  preferences: document.getElementById('profilePreferences')
};

const addNoteButton = document.getElementById('addNoteBtn');

const editorElements = {
  container: document.getElementById('profileEditor'),
  form: document.getElementById('profileEditorForm'),
  displayName: document.getElementById('profileEditorDisplayName'),
  gender: document.getElementById('profileEditorGender'),
  avatar: document.getElementById('profileEditorAvatar'),
  error: document.getElementById('profileEditorError'),
  saveButton: document.getElementById('profileEditorSave'),
  cancelButton: document.getElementById('profileEditorCancel')
};

const PROFILE_ENDPOINT =
  (typeof window !== 'undefined' && window.RouteflowProfile?.endpoint) || '/api/profile';
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

const createDefaultProfileExtras = () => ({
  gender: ''
});

const state = {
  user: null,
  isAdmin: false,
  profileExtras: createDefaultProfileExtras()
};

const resolveEnsureFunction = () => {
  const routeflowAuth = window.RouteflowAuth;
  if (routeflowAuth?.ensure) {
    return routeflowAuth.ensure.bind(routeflowAuth);
  }
  if (typeof window.ensureFirebaseAuth === 'function') {
    return window.ensureFirebaseAuth;
  }
  return null;
};

let authPromise = null;
const ensureAuth = () => {
  const ensure = resolveEnsureFunction();
  if (!ensure) {
    return Promise.resolve(null);
  }
  if (!authPromise) {
    authPromise = ensure().catch((error) => {
      console.error('RouteFlow profile: failed to initialise authentication.', error);
      return null;
    });
  }
  return authPromise;
};

const getCurrentAuthUser = () => {
  const routeflowAuth = window.RouteflowAuth;
  if (routeflowAuth?.getCurrentUser) {
    try {
      return routeflowAuth.getCurrentUser();
    } catch (error) {
      console.error('RouteFlow profile: unable to read user from RouteflowAuth.', error);
    }
  }
  try {
    if (typeof firebase !== 'undefined' && typeof firebase.auth === 'function') {
      const auth = firebase.auth();
      return auth?.currentUser || null;
    }
  } catch (error) {
    console.error('RouteFlow profile: unable to resolve Firebase auth user.', error);
  }
  return null;
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const shortenUid = (uid) => {
  if (!uid) return '—';
  if (uid.length <= 12) return uid;
  return `${uid.slice(0, 6)}…${uid.slice(-4)}`;
};

const sanitiseHandle = (value) => {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
};

const deriveUsername = (user) => {
  if (!user) return '';
  const providerHandle = sanitiseHandle(user.reloadUserInfo?.screenName || user.reloadUserInfo?.displayName);
  if (providerHandle) return providerHandle;
  const displayName = sanitiseHandle(user.displayName);
  if (displayName) return displayName;
  const emailHandle = sanitiseHandle(user.email?.split('@')?.[0]);
  if (emailHandle) return emailHandle;
  return sanitiseHandle(user.uid);
};

const setActionEnabled = (element, enabled) => {
  if (!element) return;
  if (enabled) {
    element.removeAttribute('disabled');
    element.removeAttribute('data-disabled');
  } else {
    element.setAttribute('disabled', '');
    element.setAttribute('data-disabled', '');
  }
};

const isEditorBusy = () => editorElements.form?.getAttribute('aria-busy') === 'true';

const clearEditorError = () => {
  if (editorElements.error) {
    editorElements.error.textContent = '';
  }
};

const showEditorError = (message) => {
  if (editorElements.error) {
    editorElements.error.textContent = message;
  }
};

const setEditorBusy = (busy) => {
  if (editorElements.form) {
    editorElements.form.setAttribute('aria-busy', busy ? 'true' : 'false');
  }
  [editorElements.saveButton, editorElements.cancelButton].forEach((button) => {
    if (!button) return;
    if (busy) {
      button.setAttribute('disabled', '');
    } else {
      button.removeAttribute('disabled');
    }
  });
};

const prefillProfileEditor = () => {
  const displayName = state.user?.displayName?.trim() || '';
  const gender = state.profileExtras?.gender || '';
  if (editorElements.displayName) {
    editorElements.displayName.value = displayName;
  }
  if (editorElements.gender) {
    editorElements.gender.value = gender;
  }
  if (editorElements.avatar) {
    editorElements.avatar.value = '';
  }
  clearEditorError();
};

const handleEditorKeydown = (event) => {
  if (event.key === 'Escape' && editorElements.container && !editorElements.container.hidden && !isEditorBusy()) {
    event.preventDefault();
    closeProfileEditor();
  }
};

const openProfileEditor = () => {
  if (!state.user || !editorElements.container) return;
  prefillProfileEditor();
  editorElements.container.hidden = false;
  editorElements.container.removeAttribute('aria-hidden');
  setEditorBusy(false);
  document.body.classList.add('modal-open');
  window.requestAnimationFrame(() => {
    editorElements.displayName?.focus();
  });
  document.addEventListener('keydown', handleEditorKeydown);
};

const closeProfileEditor = () => {
  if (!editorElements.container) return;
  editorElements.container.hidden = true;
  editorElements.container.setAttribute('aria-hidden', 'true');
  setEditorBusy(false);
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', handleEditorKeydown);
  prefillProfileEditor();
};

const getEditorValues = () => ({
  displayName: editorElements.displayName?.value.trim() || '',
  gender: editorElements.gender?.value.trim() || '',
  avatarFile: editorElements.avatar?.files?.[0] || null
});

const validateProfileEditor = (values) => {
  if (values.displayName && values.displayName.length < 2) {
    return 'Display name must be at least 2 characters.';
  }
  if (values.displayName.length > 80) {
    return 'Display name must be fewer than 80 characters.';
  }
  if (values.gender && values.gender.length > 60) {
    return 'Gender must be 60 characters or fewer.';
  }
  if (values.avatarFile) {
    if (values.avatarFile.size > MAX_AVATAR_SIZE_BYTES) {
      return 'Avatar images must be 5 MB or smaller.';
    }
    if (values.avatarFile.type && !values.avatarFile.type.startsWith('image/')) {
      return 'Please choose an image file for your avatar.';
    }
  }
  return null;
};

const uploadAvatar = async (user, file) => {
  if (!user || !file) return user?.photoURL || '';
  await ensureAuth();
  const storage = (typeof firebase !== 'undefined' && typeof firebase.storage === 'function')
    ? firebase.storage()
    : null;
  if (!storage) {
    throw new Error('Firebase storage is not available.');
  }
  const safeName = (file.name || 'avatar')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const resolvedName = safeName || `avatar-${Date.now()}`;
  const path = `avatars/${user.uid}/${Date.now()}-${resolvedName}`;
  const metadata = { cacheControl: 'public,max-age=3600' };
  if (file.type) {
    metadata.contentType = file.type;
  }
  const storageRef = storage.ref(path);
  const snapshot = await storageRef.put(file, metadata);
  return snapshot.ref.getDownloadURL();
};

const persistProfileExtras = async (user, extras) => {
  if (!user?.getIdToken) return null;
  const token = await user.getIdToken();
  const payload = {
    gender: extras.gender || null
  };
  const response = await fetch(PROFILE_ENDPOINT, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (response.status === 204) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to update profile extras (${response.status})`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return null;
};

const fetchProfileExtras = async (user) => {
  if (!user?.getIdToken) return createDefaultProfileExtras();
  try {
    const token = await user.getIdToken();
    const response = await fetch(PROFILE_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (response.status === 404) {
      return createDefaultProfileExtras();
    }
    if (!response.ok) {
      throw new Error(`Failed to load profile extras (${response.status})`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return createDefaultProfileExtras();
    }
    const data = await response.json();
    return {
      ...createDefaultProfileExtras(),
      ...data,
      gender: typeof data?.gender === 'string' ? data.gender.trim() : ''
    };
  } catch (error) {
    console.warn('Unable to fetch extended profile details.', error);
    return createDefaultProfileExtras();
  }
};

const handleProfileEditorSubmit = async (event) => {
  event.preventDefault();
  clearEditorError();

  if (!state.user) {
    showEditorError('You need to be signed in to update your profile.');
    return;
  }

  const values = getEditorValues();
  const validationError = validateProfileEditor(values);
  if (validationError) {
    showEditorError(validationError);
    return;
  }

  const hasChanges =
    values.avatarFile ||
    values.displayName !== (state.user.displayName || '') ||
    values.gender !== (state.profileExtras?.gender || '');

  if (!hasChanges) {
    showEditorError('There are no changes to save.');
    return;
  }

  if (typeof state.user.updateProfile !== 'function') {
    showEditorError('Profile updates require a connected RouteFlow account.');
    return;
  }

  setEditorBusy(true);

  try {
    let photoURL = state.user.photoURL || '';
    if (values.avatarFile) {
      photoURL = await uploadAvatar(state.user, values.avatarFile);
    }

    await state.user.updateProfile({
      displayName: values.displayName || null,
      photoURL: photoURL || null
    });

    if (values.gender !== (state.profileExtras?.gender || '')) {
      await persistProfileExtras(state.user, { gender: values.gender });
    }

    if (typeof state.user.reload === 'function') {
      try {
        await state.user.reload();
      } catch (reloadError) {
        console.warn('RouteFlow profile: user reload failed after profile update.', reloadError);
      }
    }

    let refreshedUser = null;
    try {
      const auth = await ensureAuth();
      refreshedUser = auth?.currentUser || getCurrentAuthUser();
    } catch (refreshError) {
      console.error('RouteFlow profile: failed to refresh user after update.', refreshError);
      refreshedUser = getCurrentAuthUser();
    }
    if (refreshedUser) {
      state.user = refreshedUser;
    }

    state.profileExtras = {
      ...state.profileExtras,
      gender: values.gender
    };

    refreshHero();
    closeProfileEditor();
  } catch (error) {
    console.error('Failed to update profile information.', error);
    showEditorError('We could not save your changes. Please try again.');
  } finally {
    setEditorBusy(false);
  }
};

const resetList = (element, message) => {
  if (!element) return;
  element.innerHTML = '';
  const emptyState = document.createElement('li');
  emptyState.className = 'profile-empty';
  emptyState.textContent = message;
  element.appendChild(emptyState);
};

const renderFavourites = (uid, favourites = []) => {
  const container = listElements.favourites;
  if (!container) return;
  container.innerHTML = '';
  const safeFavourites = Array.isArray(favourites) ? favourites : [];
  if (!safeFavourites.length) {
    resetList(container, 'You have not saved any favourites yet.');
    return;
  }

  safeFavourites.forEach((favourite) => {
    const item = document.createElement('li');
    item.className = 'profile-item';

    const label = document.createElement('p');
    label.className = 'profile-item__title';
    label.textContent = resolveFavouriteTitle(favourite);

    const badge = document.createElement('span');
    badge.className = 'profile-chip';
    badge.textContent = inferFavouriteType(favourite);
    badge.setAttribute('aria-hidden', 'true');

    const metaParts = buildFavouriteMeta(favourite, label.textContent);
    if (metaParts.length) {
      const meta = document.createElement('p');
      meta.className = 'profile-item__meta';
      meta.textContent = metaParts.join(' • ');
      item.append(label, badge, meta);
    } else {
      item.append(label, badge);
    }

    const actions = document.createElement('div');
    actions.className = 'profile-item__actions';

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'profile-chip';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', async () => {
      if (!uid || !favourite?.id) return;
      try {
        setActionEnabled(removeButton, false);
        await removeFavourite(uid, favourite.id);
      } catch (error) {
        console.error('Failed to remove favourite:', error);
        alert('We could not remove this favourite. Please try again.');
      } finally {
        setActionEnabled(removeButton, true);
      }
      try {
        await renderAllSections();
      } catch (refreshError) {
        console.error('Failed to refresh profile after removing favourite.', refreshError);
      }
    });

    actions.appendChild(removeButton);
    item.appendChild(actions);

    container.appendChild(item);
  });
};

const renderRecents = (uid, recents = []) => {
  const container = listElements.recents;
  if (!container) return;
  container.innerHTML = '';
  const safeRecents = Array.isArray(recents) ? recents : [];
  if (!safeRecents.length) {
    resetList(container, 'Recent lookups will appear here once you start exploring.');
    return;
  }

  safeRecents.forEach((recent) => {
    const item = document.createElement('li');
    item.className = 'profile-item';

    const title = document.createElement('p');
    title.className = 'profile-item__title';
    title.textContent = recent.title || recent.name || recent.url || 'Recent lookup';
    item.appendChild(title);

    if (recent.url) {
      const link = document.createElement('a');
      link.href = recent.url;
      link.textContent = 'Open';
      link.className = 'profile-chip';
      link.target = '_self';
      link.rel = 'noopener';
      const actions = document.createElement('div');
      actions.className = 'profile-item__actions';
      actions.appendChild(link);
      item.appendChild(actions);
    }

    container.appendChild(item);
  });
};

const renderNotes = (uid, notes = []) => {
  const container = listElements.notes;
  if (!container) return;
  container.innerHTML = '';
  const safeNotes = Array.isArray(notes) ? notes : [];
  if (!safeNotes.length) {
    resetList(container, 'Add a note to pin service details or journey reminders.');
    return;
  }

  safeNotes.forEach((note) => {
    const item = document.createElement('li');
    item.className = 'profile-item profile-note';

    const title = document.createElement('p');
    title.className = 'profile-item__title';
    title.textContent = note.name || 'Saved note';

    const text = document.createElement('p');
    text.className = 'profile-note__text';
    text.textContent = note.text || '';

    const actions = document.createElement('div');
    actions.className = 'profile-item__actions';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'profile-chip';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', async () => {
      if (!uid || !note?.id) return;
      const updated = prompt('Update your note:', note.text || '');
      if (updated === null) {
        return;
      }
      const nextText = updated.trim();
      if (!nextText) {
        alert('Your note cannot be empty.');
        return;
      }
      try {
        setActionEnabled(editButton, false);
        await updateNote(uid, note.id, {
          name: note.name || 'Saved note',
          text: nextText
        });
      } catch (error) {
        console.error('Failed to update note:', error);
        alert('We could not update this note. Please try again.');
      } finally {
        setActionEnabled(editButton, true);
      }
      try {
        await renderAllSections();
      } catch (refreshError) {
        console.error('Failed to refresh profile after updating note.', refreshError);
      }
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'profile-chip';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async () => {
      if (!uid || !note?.id) return;
      if (!confirm('Remove this note?')) return;
      try {
        setActionEnabled(deleteButton, false);
        await removeNote(uid, note.id);
      } catch (error) {
        console.error('Failed to remove note:', error);
        alert('We could not remove this note. Please try again.');
      } finally {
        setActionEnabled(deleteButton, true);
      }
      try {
        await renderAllSections();
      } catch (refreshError) {
        console.error('Failed to refresh profile after removing note.', refreshError);
      }
    });

    actions.append(editButton, deleteButton);
    item.append(title, text, actions);
    container.appendChild(item);
  });
};

const renderPreferences = () => {
  const container = listElements.preferences;
  if (!container) return;
  container.innerHTML = '';

  const prefsApi = window.RouteflowPreferences;
  if (!prefsApi) {
    const placeholder = document.createElement('p');
    placeholder.className = 'profile-empty';
    placeholder.textContent = 'Preference data is unavailable on this device.';
    container.appendChild(placeholder);
    return;
  }

  const preferences = prefsApi.getPreferences();
  const accentOptions = prefsApi.getAccentOptions ? prefsApi.getAccentOptions() : {};

  const entries = [
    { label: 'Theme', value: preferences.theme === 'dark' ? 'Dark' : 'Light' },
    { label: 'Accent colour', value: accentOptions?.[preferences.accent]?.label || preferences.accent },
    { label: 'Text scale', value: `${Math.round((preferences.textScale || 1) * 100)}%` },
    { label: 'High contrast', value: preferences.highContrast ? 'Enabled' : 'Disabled' },
    { label: 'Readable font', value: preferences.readableFont ? 'Enabled' : 'Disabled' },
    { label: 'Reduce motion', value: preferences.reduceMotion ? 'Enabled' : 'Disabled' }
  ];

  entries.forEach((entry) => {
    const wrapper = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = entry.label;
    const value = document.createElement('dd');
    value.textContent = entry.value;
    wrapper.append(term, value);
    container.appendChild(wrapper);
  });
};

const renderStats = (uid, favourites = [], notes = [], recents = []) => {
  const safeFavourites = Array.isArray(favourites) ? favourites : [];
  const safeNotes = Array.isArray(notes) ? notes : [];
  const safeRecents = Array.isArray(recents) ? recents : [];

  statsElements.favourites.textContent = safeFavourites.length;
  statsElements.notes.textContent = safeNotes.length;
  statsElements.recents.textContent = safeRecents.length;

  if (!safeFavourites.length && !safeNotes.length) {
    statsElements.message.textContent = 'Save a favourite or add a note to build your personalised dashboard.';
  } else {
    statsElements.message.textContent = `You have ${safeFavourites.length} favourite${safeFavourites.length === 1 ? '' : 's'} and ${safeNotes.length} note${safeNotes.length === 1 ? '' : 's'} ready to go.`;
  }
};

const renderAllSections = async () => {
  if (!state.user) {
    resetList(listElements.favourites, 'Sign in to start saving favourites.');
    resetList(listElements.recents, 'Sign in to see your recent lookups.');
    resetList(listElements.notes, 'Sign in to write notes.');
    if (listElements.preferences) {
      listElements.preferences.innerHTML = '';
    }
    statsElements.favourites.textContent = '0';
    statsElements.notes.textContent = '0';
    statsElements.recents.textContent = '0';
    statsElements.message.textContent = 'Sign in to unlock personalised insights across RouteFlow London.';
    return;
  }

  const uid = state.user.uid;
  const recents = Array.isArray(getRecents(uid)) ? getRecents(uid) : [];

  renderRecents(uid, recents);
  renderPreferences();

  resetList(listElements.favourites, 'Loading your favourites…');
  resetList(listElements.notes, 'Loading your notes…');
  statsElements.message.textContent = 'Loading your personalised data…';
  statsElements.favourites.textContent = '0';
  statsElements.notes.textContent = '0';
  statsElements.recents.textContent = String(recents.length);

  const [favouritesResult, notesResult] = await Promise.allSettled([
    getFavourites(uid),
    getNotes(uid)
  ]);

  let favourites = [];
  let notes = [];

  if (favouritesResult.status === 'fulfilled') {
    favourites = Array.isArray(favouritesResult.value) ? favouritesResult.value : [];
    renderFavourites(uid, favourites);
  } else {
    console.error('Failed to load favourites for profile view.', favouritesResult.reason);
    resetList(listElements.favourites, 'We could not load your favourites right now.');
  }

  if (notesResult.status === 'fulfilled') {
    notes = Array.isArray(notesResult.value) ? notesResult.value : [];
    renderNotes(uid, notes);
  } else {
    console.error('Failed to load notes for profile view.', notesResult.reason);
    resetList(listElements.notes, 'We could not load your notes right now.');
  }

  renderStats(uid, favourites, notes, recents);

  if (favouritesResult.status !== 'fulfilled' || notesResult.status !== 'fulfilled') {
    statsElements.message.textContent = 'We could not load some of your data. Please try refreshing.';
  }
};

const refreshHero = () => {
  if (!state.user) {
    if (heroElements.avatar) heroElements.avatar.src = 'user-icon.png';
    if (heroElements.role) heroElements.role.textContent = 'Guest';
    if (heroElements.name) heroElements.name.textContent = 'Your profile';
    if (heroElements.username) {
      heroElements.username.textContent = '';
      heroElements.username.hidden = true;
    }
    if (heroElements.email) heroElements.email.textContent = 'Sign in to personalise your RouteFlow London experience.';
    if (heroElements.displayName) heroElements.displayName.textContent = '—';
    if (heroElements.handle) heroElements.handle.textContent = '—';
    if (heroElements.memberSince) heroElements.memberSince.textContent = '—';
    if (heroElements.lastActive) heroElements.lastActive.textContent = '—';
    if (heroElements.uid) heroElements.uid.textContent = '—';
    if (heroElements.primaryEmail) heroElements.primaryEmail.textContent = '—';
    setActionEnabled(heroElements.openSettings, false);
    setActionEnabled(heroElements.signOut, false);
    setActionEnabled(heroElements.edit, false);
    return;
  }

  const { user, isAdmin } = state;
  const displayName = user.displayName?.trim() || '';
  const emailAddress = user.email || '';
  const username = deriveUsername(user);

  if (heroElements.avatar) {
    heroElements.avatar.src = user.photoURL || 'user-icon.png';
    heroElements.avatar.alt = user.displayName ? `${user.displayName}'s avatar` : 'Profile avatar';
  }

  if (heroElements.role) {
    heroElements.role.textContent = isAdmin ? 'Administrator' : 'Member';
  }

  if (heroElements.name) {
    heroElements.name.textContent = displayName || emailAddress || 'RouteFlow member';
  }

  if (heroElements.username) {
    if (username) {
      heroElements.username.textContent = `@${username}`;
      heroElements.username.hidden = false;
    } else {
      heroElements.username.textContent = '';
      heroElements.username.hidden = true;
    }
  }

  if (heroElements.displayName) {
    heroElements.displayName.textContent = displayName || '—';
  }

  if (heroElements.handle) {
    heroElements.handle.textContent = username || '—';
  }

  if (heroElements.email) {
    heroElements.email.textContent = emailAddress || 'No email linked to this account.';
  }

  if (heroElements.primaryEmail) {
    heroElements.primaryEmail.textContent = emailAddress || '—';
  }

  if (heroElements.memberSince) {
    heroElements.memberSince.textContent = formatDateTime(user.metadata?.creationTime);
  }

  if (heroElements.lastActive) {
    heroElements.lastActive.textContent = formatDateTime(user.metadata?.lastSignInTime);
  }

  if (heroElements.uid) {
    heroElements.uid.textContent = shortenUid(user.uid);
  }

  setActionEnabled(heroElements.openSettings, true);
  setActionEnabled(heroElements.signOut, true);
  setActionEnabled(heroElements.edit, true);
};

const detectAdminStatus = async (user) => {
  if (!user) return false;
  try {
    const tokenResult = await user.getIdTokenResult();
    if (window.RouteflowAdmin?.isAdminUser) {
      return Boolean(window.RouteflowAdmin.isAdminUser(user, tokenResult));
    }
    if (tokenResult?.claims?.admin) {
      return true;
    }
    if (window.RouteflowAdmin?.hasOverride) {
      return Boolean(window.RouteflowAdmin.hasOverride(user));
    }
  } catch (error) {
    console.warn('Unable to determine administrator status for profile view.', error);
    if (window.RouteflowAdmin?.hasOverride) {
      try {
        return Boolean(window.RouteflowAdmin.hasOverride(user));
      } catch (overrideError) {
        console.warn('Admin override lookup failed.', overrideError);
      }
    }
  }
  return false;
};

const attachEventHandlers = () => {
  if (heroElements.signOut) {
    heroElements.signOut.addEventListener('click', async () => {
      const auth = await ensureAuth();
      if (!auth || typeof auth.signOut !== 'function') {
        alert('Authentication is temporarily unavailable. Please try again later.');
        return;
      }
      try {
        await auth.signOut();
      } catch (error) {
        console.error('Failed to sign out:', error);
        alert('Unable to sign out right now. Please try again.');
      }
    });
  }

  if (heroElements.edit) {
    heroElements.edit.addEventListener('click', () => {
      if (!state.user) {
        alert('Sign in to edit your profile.');
        return;
      }
      openProfileEditor();
    });
  }

  if (heroElements.refresh) {
    heroElements.refresh.addEventListener('click', async () => {
      if (!state.user) return;
      try {
        state.isAdmin = await detectAdminStatus(state.user);
        refreshHero();
      } catch (error) {
        console.error('Failed to refresh admin status:', error);
      }
      try {
        await renderAllSections();
      } catch (error) {
        console.error('Failed to refresh profile sections after manual refresh.', error);
      }
    });
  }

  if (editorElements.form) {
    editorElements.form.addEventListener('submit', handleProfileEditorSubmit);
  }

  if (editorElements.container) {
    editorElements.container.addEventListener('click', (event) => {
      const dismissTarget = event.target.closest('[data-profile-editor-dismiss]');
      if (!dismissTarget || isEditorBusy()) {
        return;
      }
      event.preventDefault();
      closeProfileEditor();
    });
  }

  ['displayName', 'gender'].forEach((key) => {
    const field = editorElements[key];
    if (field) {
      field.addEventListener('input', () => {
        if (editorElements.error?.textContent) {
          clearEditorError();
        }
      });
    }
  });

  if (editorElements.avatar) {
    editorElements.avatar.addEventListener('input', () => {
      if (editorElements.error?.textContent) {
        clearEditorError();
      }
    });
  }

  if (addNoteButton) {
    addNoteButton.addEventListener('click', async () => {
      if (!state.user) {
        alert('Sign in to add notes to your profile.');
        return;
      }
      const titleInput = prompt('What would you like to call this note?', 'New note');
      if (!titleInput) return;
      const name = titleInput.trim();
      if (!name) {
        alert('Your note title cannot be empty.');
        return;
      }
      const textInput = prompt('Add your note details:');
      if (!textInput) return;
      const noteText = textInput.trim();
      if (!noteText) {
        alert('Your note cannot be empty.');
        return;
      }
      try {
        await addNote(state.user.uid, { name, text: noteText });
      } catch (error) {
        console.error('Failed to add note for profile view.', error);
        alert('We could not save this note. Please try again.');
        return;
      }
      try {
        await renderAllSections();
      } catch (error) {
        console.error('Failed to refresh profile after adding note.', error);
      }
    });
  }
};

let authUpdateToken = 0;

const applyAuthUser = async (user) => {
  const token = ++authUpdateToken;
  state.user = user || null;
  state.isAdmin = false;

  if (!user) {
    state.profileExtras = createDefaultProfileExtras();
    closeProfileEditor();
    refreshHero();
    try {
      await renderAllSections();
    } catch (error) {
      console.error('Failed to render profile sections after sign-out.', error);
    }
    return;
  }

  try {
    state.isAdmin = await detectAdminStatus(user);
  } catch (error) {
    console.error('Failed to determine administrator status for profile view.', error);
    state.isAdmin = false;
  }

  try {
    state.profileExtras = await fetchProfileExtras(user);
  } catch (error) {
    console.error('Failed to refresh profile extras.', error);
    state.profileExtras = createDefaultProfileExtras();
  }

  if (token !== authUpdateToken) {
    return;
  }

  prefillProfileEditor();
  refreshHero();
  try {
    await renderAllSections();
  } catch (error) {
    console.error('Failed to render profile sections after auth change.', error);
  }
};

const initialise = () => {
  attachEventHandlers();

  applyAuthUser(getCurrentAuthUser());

  ensureAuth().catch(() => null);

  const routeflowAuth = window.RouteflowAuth;
  if (routeflowAuth?.subscribe) {
    routeflowAuth.subscribe((authUser) => {
      applyAuthUser(authUser || null);
    });
    return;
  }

  ensureAuth()
    .then((auth) => {
      if (!auth || typeof auth.onAuthStateChanged !== 'function') {
        applyAuthUser(getCurrentAuthUser());
        return;
      }
      auth.onAuthStateChanged((authUser) => {
        applyAuthUser(authUser || null);
      });
    })
    .catch((error) => {
      console.error('RouteFlow profile: failed to observe authentication state.', error);
      applyAuthUser(getCurrentAuthUser());
    });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialise, { once: true });
} else {
  initialise();
}
