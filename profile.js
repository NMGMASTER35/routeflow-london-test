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

const state = {
  user: null,
  isAdmin: false
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
    heroElements.signOut.addEventListener('click', () => {
      const auth = firebase?.auth?.();
      if (auth) {
        auth.signOut().catch((error) => console.error('Failed to sign out:', error));
      }
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

const initialise = () => {
  attachEventHandlers();

  firebase?.auth?.().onAuthStateChanged(async (user) => {
    state.user = user || null;
    state.isAdmin = user ? await detectAdminStatus(user) : false;
    refreshHero();
    try {
      await renderAllSections();
    } catch (error) {
      console.error('Failed to render profile sections after auth state change.', error);
    }
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialise, { once: true });
} else {
  initialise();
}
