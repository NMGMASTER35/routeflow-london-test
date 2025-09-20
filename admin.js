import {
  storageAvailable,
  createId,
  getStoredWithdrawnRoutes,
  setStoredWithdrawnRoutes,
  getRouteTagOverrides,
  setRouteTagOverrides,
  getStoredBlogPosts,
  setStoredBlogPosts,
  refreshWithdrawnRoutes,
  refreshRouteTagOverrides,
  refreshBlogPosts,
  STORAGE_KEYS
} from './data-store.js';

const adminContent = document.getElementById('adminContent');
function getFirebaseConfig() {
  const config = window.__ROUTEFLOW_CONFIG__?.firebase;
  if (!config?.apiKey) {
    console.error('Firebase configuration is missing. Admin features are unavailable.');
    return null;
  }
  return config;
}

const FALLBACK_ADMIN_OVERRIDES = new Map([
  [
    'emKTnjbKIKfBjQzQEvpUOWOpFKc2',
    {
      email: 'nmorris210509@gmail.com'
    }
  ]
]);

const TAG_OPTIONS = ['Regular', 'Night', 'School', 'Special', 'Express'];

const adminState = {
  user: null,
  withdrawnRoutes: [],
  routeTagOverrides: [],
  withdrawnEditId: null,
  tagEditId: null,
  blogPosts: [],
  blogEditId: null
};

const adminViews = {
  withdrawn: null,
  tags: null,
  blog: null,
  roles: null
};

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const getFirebaseRolesApi = () => window.RouteflowFirebase || null;

const ensureAdminToken = async () => {
  if (!adminState.user || typeof adminState.user.getIdToken !== 'function') {
    throw new Error('Administrator authentication is unavailable.');
  }
  return adminState.user.getIdToken();
};

const formatDisplayName = (value) => (typeof value === 'string' ? value.trim() : '');

const normaliseEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const fallbackHasOverride = (userOrUid) => {
  if (!userOrUid) return false;
  const uid = typeof userOrUid === 'string' ? userOrUid : userOrUid?.uid;
  if (!uid) return false;
  const override = FALLBACK_ADMIN_OVERRIDES.get(uid);
  if (!override) return false;
  if (override.email && typeof userOrUid !== 'string') {
    const currentEmail = normaliseEmail(userOrUid?.email);
    const expectedEmail = normaliseEmail(override.email);
    if (currentEmail && expectedEmail && currentEmail !== expectedEmail) {
      return false;
    }
  }
  return true;
};

const resolveAdminStatus = (user, tokenResult) => {
  const helpers = window.RouteflowAdmin;
  if (helpers?.isAdminUser) {
    try {
      return Boolean(helpers.isAdminUser(user, tokenResult));
    } catch (error) {
      console.warn('Admin override helper threw an error, falling back to local checks.', error);
    }
  }
  if (tokenResult?.claims?.admin) {
    return true;
  }
  if (helpers?.hasOverride) {
    try {
      return Boolean(helpers.hasOverride(user));
    } catch (error) {
      console.warn('Admin override lookup failed, falling back to bundled overrides.', error);
    }
  }
  return fallbackHasOverride(user);
};

const REDIRECT_DELAY = 4000;
let redirectTimer = null;
let storageListenerRegistered = false;

function replaceContent(...nodes) {
  if (!adminContent) return;
  adminContent.replaceChildren(...nodes);
}

function createMessageSection(text, role = 'status', modifier = '') {
  const section = document.createElement('section');
  section.className = ['admin-message', modifier ? `admin-message--${modifier}` : ''].filter(Boolean).join(' ');
  if (role) {
    section.setAttribute('role', role);
  }
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  section.append(paragraph);
  return section;
}

function setBusy(isBusy) {
  if (!adminContent) return;
  if (isBusy) {
    adminContent.setAttribute('aria-busy', 'true');
  } else {
    adminContent.removeAttribute('aria-busy');
  }
}

function showInfo(message) {
  setBusy(true);
  if (!adminContent) return;
  replaceContent(createMessageSection(message, 'status', 'info'));
}

function showError(message) {
  setBusy(false);
  if (!adminContent) return;
  replaceContent(createMessageSection(message, 'alert', 'error'));
}

function handleUnauthorized(message) {
  showError(message);
  if (redirectTimer !== null) return;
  redirectTimer = window.setTimeout(() => {
    window.location.href = 'index.html';
  }, REDIRECT_DELAY);
}

function clearPendingRedirect() {
  if (redirectTimer !== null) {
    window.clearTimeout(redirectTimer);
    redirectTimer = null;
  }
}

function updateFeedback(target, text, tone = 'info') {
  if (!target) return;
  const content = text ? text.trim() : '';
  if (!content) {
    target.hidden = true;
    target.textContent = '';
    target.removeAttribute('data-tone');
    return;
  }
  target.hidden = false;
  target.dataset.tone = tone;
  target.textContent = content;
}

function createFeedbackElement() {
  const element = document.createElement('p');
  element.className = 'admin-feedback';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.hidden = true;
  return element;
}

function createActionButton(label, modifier, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = ['button', 'admin-button', modifier ? `admin-button--${modifier}` : '']
    .filter(Boolean)
    .join(' ');
  button.textContent = label;
  if (typeof onClick === 'function') {
    button.addEventListener('click', onClick);
  }
  return button;
}

function createWithdrawnPanel() {
  const panel = document.createElement('section');
  panel.className = 'admin-panel';
  panel.setAttribute('aria-labelledby', 'withdrawnPanelHeading');

  const header = document.createElement('div');
  header.className = 'admin-panel__header';

  const heading = document.createElement('h2');
  heading.id = 'withdrawnPanelHeading';
  heading.textContent = 'Custom withdrawn routes';

  const description = document.createElement('p');
  description.className = 'admin-panel__description';
  description.textContent = 'Add new entries to the withdrawn routes archive. Saved routes appear immediately on the public table for this device.';

  header.append(heading, description);
  panel.append(header);

  const feedback = createFeedbackElement();
  panel.append(feedback);

  const form = document.createElement('form');
  form.className = 'admin-form';
  form.noValidate = true;

  const fieldGrid = document.createElement('div');
  fieldGrid.className = 'admin-form__grid';

  const fieldDefinitions = [
    { name: 'route', label: 'Route', required: true, placeholder: 'e.g. 10' },
    { name: 'start', label: 'Start point', placeholder: 'e.g. Hammersmith' },
    { name: 'end', label: 'End point', placeholder: "e.g. King's Cross" },
    { name: 'launched', label: 'Launched', placeholder: 'e.g. 13 August 1988' },
    { name: 'withdrawn', label: 'Withdrawn', placeholder: 'e.g. 24 November 2018' },
    { name: 'operator', label: 'Last operator', placeholder: 'e.g. London United' },
    { name: 'replacedBy', label: 'Replaced by', placeholder: 'e.g. 23' }
  ];

  const inputs = {};

  fieldDefinitions.forEach((field) => {
    const group = document.createElement('div');
    group.className = 'admin-form__group';

    const label = document.createElement('label');
    label.setAttribute('for', `withdrawn-${field.name}`);
    label.textContent = field.label;

    const input = document.createElement('input');
    input.type = 'text';
    input.id = `withdrawn-${field.name}`;
    input.name = field.name;
    input.placeholder = field.placeholder || '';
    input.autocomplete = 'off';
    if (field.required) {
      input.required = true;
    }

    group.append(label, input);
    fieldGrid.append(group);
    inputs[field.name] = input;
  });

  form.append(fieldGrid);

  const actions = document.createElement('div');
  actions.className = 'admin-form__actions';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'button admin-button';
  submit.textContent = 'Add withdrawn route';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'button admin-button admin-button--secondary';
  cancel.textContent = 'Cancel edit';
  cancel.hidden = true;

  actions.append(submit, cancel);
  form.append(actions);
  panel.append(form);

  const listWrapper = document.createElement('div');
  listWrapper.className = 'network-table-wrapper admin-table-wrapper';
  panel.append(listWrapper);

  const resetForm = () => {
    form.reset();
    adminState.withdrawnEditId = null;
    submit.textContent = 'Add withdrawn route';
    cancel.hidden = true;
  };

  const startEdit = (entry) => {
    adminState.withdrawnEditId = entry.id;
    submit.textContent = 'Save withdrawn route';
    cancel.hidden = false;
    inputs.route.value = entry.route || '';
    inputs.start.value = entry.start || '';
    inputs.end.value = entry.end || '';
    inputs.launched.value = entry.launched || '';
    inputs.withdrawn.value = entry.withdrawn || '';
    inputs.operator.value = entry.operator || '';
    inputs.replacedBy.value = entry.replacedBy || '';
    inputs.route.focus();
    updateFeedback(feedback, `Editing withdrawn route ${entry.route}.`, 'info');
  };

  const renderList = () => {
    listWrapper.innerHTML = '';
    const routes = adminState.withdrawnRoutes;
    if (!routes.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-empty';
      empty.textContent = 'No custom withdrawn routes added yet.';
      listWrapper.append(empty);
      return;
    }

    const table = document.createElement('table');
    table.className = 'network-table admin-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Route', 'Start', 'End', 'Launched', 'Withdrawn', 'Operator', 'Replaced by', 'Actions'].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headerRow.append(th);
    });
    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement('tbody');
    routes.forEach((entry) => {
      const row = document.createElement('tr');
      const cells = [
        entry.route,
        entry.start,
        entry.end,
        entry.launched,
        entry.withdrawn,
        entry.operator,
        entry.replacedBy
      ];
      cells.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value || '—';
        row.append(cell);
      });

      const actionsCell = document.createElement('td');
      actionsCell.className = 'admin-table__actions';
      const editButton = createActionButton('Edit', 'ghost', () => {
        startEdit(entry);
      });
      const removeButton = createActionButton('Remove', 'danger', async () => {
        const confirmed = window.confirm(`Remove withdrawn route ${entry.route}?`);
        if (!confirmed) return;
        const nextRoutes = adminState.withdrawnRoutes.filter((item) => item.id !== entry.id);
        try {
          const token = await ensureAdminToken();
          const persisted = await setStoredWithdrawnRoutes(nextRoutes, { authToken: token });
          adminState.withdrawnRoutes = persisted;
          if (adminState.withdrawnEditId === entry.id) {
            resetForm();
          }
          renderList();
          updateFeedback(feedback, `Removed withdrawn route ${entry.route}.`, 'success');
        } catch (error) {
          console.error('Failed to remove withdrawn route.', error);
          updateFeedback(feedback, 'Unable to remove this withdrawn route. Please try again.', 'error');
        }
      });
      actionsCell.append(editButton, removeButton);
      row.append(actionsCell);
      tbody.append(row);
    });

    table.append(tbody);
    listWrapper.append(table);
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const routeValue = inputs.route.value.trim();
    if (!routeValue) {
      updateFeedback(feedback, 'A route number is required.', 'error');
      inputs.route.focus();
      return;
    }

    const entry = {
      id: adminState.withdrawnEditId || createId(),
      route: routeValue,
      start: inputs.start.value.trim(),
      end: inputs.end.value.trim(),
      launched: inputs.launched.value.trim(),
      withdrawn: inputs.withdrawn.value.trim(),
      operator: inputs.operator.value.trim(),
      replacedBy: inputs.replacedBy.value.trim()
    };

    let nextRoutes = [...adminState.withdrawnRoutes];
    if (adminState.withdrawnEditId) {
      const index = adminState.withdrawnRoutes.findIndex((item) => item.id === adminState.withdrawnEditId);
      if (index !== -1) {
        nextRoutes.splice(index, 1, entry);
      }
      updateFeedback(feedback, `Updated withdrawn route ${entry.route}.`, 'success');
    } else {
      nextRoutes.push(entry);
      updateFeedback(feedback, `Added withdrawn route ${entry.route}.`, 'success');
    }

    try {
      const token = await ensureAdminToken();
      const persisted = await setStoredWithdrawnRoutes(nextRoutes, { authToken: token });
      adminState.withdrawnRoutes = persisted;
      renderList();
      resetForm();
      inputs.route.focus();
    } catch (error) {
      console.error('Failed to save withdrawn route.', error);
      updateFeedback(feedback, 'We could not save this withdrawn route. Please try again.', 'error');
    }
  });

  cancel.addEventListener('click', () => {
    resetForm();
    updateFeedback(feedback, 'Editing cancelled.', 'info');
  });

  const refresh = () => {
    renderList();
    if (adminState.withdrawnEditId) {
      const current = adminState.withdrawnRoutes.find((item) => item.id === adminState.withdrawnEditId);
      if (!current) {
        resetForm();
        updateFeedback(feedback, 'The route you were editing is no longer available.', 'info');
      }
    }
  };

  refresh();

  return {
    element: panel,
    refresh
  };
}

function createRolePanel(currentUser, options = {}) {
  const { onAdminCountChange } = options;
  const panel = document.createElement('section');
  panel.className = 'admin-panel';
  panel.setAttribute('aria-labelledby', 'rolesPanelHeading');

  const header = document.createElement('div');
  header.className = 'admin-panel__header';

  const heading = document.createElement('h2');
  heading.id = 'rolesPanelHeading';
  heading.textContent = 'Role management';

  const description = document.createElement('p');
  description.className = 'admin-panel__description';
  description.textContent = 'Promote trusted members to administrators and track their Discord connections.';

  header.append(heading, description);
  panel.append(header);

  const feedback = createFeedbackElement();
  panel.append(feedback);

  const rolesApi = getFirebaseRolesApi();
  if (!rolesApi?.assignAdminRole || !rolesApi?.findProfileByEmail || !rolesApi?.listAdmins) {
    const warning = document.createElement('p');
    warning.className = 'admin-empty';
    warning.textContent = 'Firebase role controls are unavailable. Connect RouteflowFirebase to manage administrators.';
    panel.append(warning);
    if (typeof onAdminCountChange === 'function') {
      onAdminCountChange(null);
    }
    return { element: panel, refresh: () => {} };
  }

  const form = document.createElement('form');
  form.className = 'admin-form';
  form.noValidate = true;

  const grid = document.createElement('div');
  grid.className = 'admin-form__grid admin-form__grid--compact';

  const emailGroup = document.createElement('div');
  emailGroup.className = 'admin-form__group';
  const emailLabel = document.createElement('label');
  emailLabel.setAttribute('for', 'adminRoleEmail');
  emailLabel.textContent = 'Member email';
  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.id = 'adminRoleEmail';
  emailInput.name = 'email';
  emailInput.placeholder = 'name@example.com';
  emailInput.required = true;
  emailGroup.append(emailLabel, emailInput);

  const noteGroup = document.createElement('div');
  noteGroup.className = 'admin-form__group';
  const noteLabel = document.createElement('label');
  noteLabel.setAttribute('for', 'adminRoleNote');
  noteLabel.textContent = 'Notes (optional)';
  const noteInput = document.createElement('input');
  noteInput.type = 'text';
  noteInput.id = 'adminRoleNote';
  noteInput.name = 'note';
  noteInput.placeholder = 'Reason for access or context';
  noteGroup.append(noteLabel, noteInput);

  grid.append(emailGroup, noteGroup);
  form.append(grid);

  const actions = document.createElement('div');
  actions.className = 'admin-form__actions';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'button admin-button';
  submit.textContent = 'Grant admin access';
  actions.append(submit);
  form.append(actions);
  panel.append(form);

  const listWrapper = document.createElement('div');
  listWrapper.className = 'admin-role-list';
  panel.append(listWrapper);

  const renderList = async () => {
    const api = getFirebaseRolesApi();
    listWrapper.innerHTML = '';
    if (!api?.listAdmins) {
      const info = document.createElement('p');
      info.className = 'admin-empty';
      info.textContent = 'Role data is unavailable at the moment.';
      listWrapper.append(info);
      if (typeof onAdminCountChange === 'function') {
        onAdminCountChange(null);
      }
      return;
    }
    listWrapper.setAttribute('aria-busy', 'true');
    if (typeof onAdminCountChange === 'function') {
      onAdminCountChange('loading');
    }
    let admins = [];
    try {
      admins = await api.listAdmins();
    } catch (error) {
      console.error('Failed to load administrator list.', error);
      const errorMessage = document.createElement('p');
      errorMessage.className = 'admin-empty';
      errorMessage.textContent = 'Unable to load administrators. Try again later.';
      listWrapper.append(errorMessage);
      listWrapper.removeAttribute('aria-busy');
      if (typeof onAdminCountChange === 'function') {
        onAdminCountChange(null);
      }
      return;
    }
    listWrapper.removeAttribute('aria-busy');
    if (!admins.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-empty';
      empty.textContent = 'No administrators have been registered yet.';
      listWrapper.append(empty);
      if (typeof onAdminCountChange === 'function') {
        onAdminCountChange(0);
      }
      return;
    }
    const list = document.createElement('ul');
    list.className = 'admin-role-list__items';
    admins.forEach((profile) => {
      const item = document.createElement('li');
      item.className = 'admin-role-list__item';
      const title = document.createElement('strong');
      const name = formatDisplayName(profile.displayName) || formatDisplayName(profile.email) || profile.uid;
      title.textContent = name;
      const meta = document.createElement('p');
      meta.className = 'admin-role-list__meta';
      const details = [];
      if (profile.email) {
        details.push(profile.email);
      }
      const discordName = formatDisplayName(profile.discord?.displayName || profile.discord?.username);
      if (discordName) {
        details.push(`Discord: ${discordName}`);
      }
      const assignment = profile.roleAssignments?.admin;
      if (assignment?.assignedByName) {
        const byEmail = assignment.assignedByEmail ? ` (${assignment.assignedByEmail})` : '';
        details.push(`Assigned by ${assignment.assignedByName}${byEmail}`);
      }
      meta.textContent = details.join(' • ');
      item.append(title, meta);
      list.append(item);
    });
    listWrapper.append(list);
    if (typeof onAdminCountChange === 'function') {
      onAdminCountChange(admins.length);
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const api = getFirebaseRolesApi();
    if (!api?.assignAdminRole || !api?.findProfileByEmail) {
      updateFeedback(feedback, 'Role management is currently unavailable.', 'error');
      return;
    }
    const emailValue = formatDisplayName(emailInput.value).toLowerCase();
    const noteValue = formatDisplayName(noteInput.value);
    if (!emailValue || !EMAIL_REGEX.test(emailValue)) {
      updateFeedback(feedback, 'Enter a valid email address to promote.', 'error');
      emailInput.focus();
      return;
    }
    submit.setAttribute('disabled', '');
    updateFeedback(feedback, 'Looking up member…', 'info');
    let profile = null;
    try {
      profile = await api.findProfileByEmail(emailValue);
    } catch (lookupError) {
      console.error('Failed to lookup profile for admin promotion.', lookupError);
      updateFeedback(feedback, 'Unable to look up that member right now. Try again later.', 'error');
      submit.removeAttribute('disabled');
      return;
    }
    if (!profile) {
      updateFeedback(feedback, 'No profile was found for that email. Ask the member to sign in first.', 'error');
      submit.removeAttribute('disabled');
      return;
    }
    try {
      await api.assignAdminRole(profile.uid, {
        assignedBy: currentUser?.uid || null,
        assignedByEmail: formatDisplayName(currentUser?.email) || null,
        assignedByName: formatDisplayName(currentUser?.displayName) || formatDisplayName(currentUser?.email),
        note: noteValue || null
      });
      const promotedName = formatDisplayName(profile.displayName) || profile.email || profile.uid;
      updateFeedback(feedback, `${promotedName} now has administrator access.`, 'success');
      form.reset();
      renderList();
    } catch (assignError) {
      console.error('Failed to assign admin role.', assignError);
      updateFeedback(feedback, assignError?.message || 'Unable to update roles right now.', 'error');
    } finally {
      submit.removeAttribute('disabled');
    }
  });

  renderList();

  return {
    element: panel,
    refresh: renderList
  };
}

function createTagOverridePanel() {
  const panel = document.createElement('section');
  panel.className = 'admin-panel';
  panel.setAttribute('aria-labelledby', 'tagPanelHeading');

  const header = document.createElement('div');
  header.className = 'admin-panel__header';

  const heading = document.createElement('h2');
  heading.id = 'tagPanelHeading';
  heading.textContent = 'Route service tags';

  const description = document.createElement('p');
  description.className = 'admin-panel__description';
  description.textContent = 'Override the tags that appear on the routes page, including night or school designations.';

  header.append(heading, description);
  panel.append(header);

  const feedback = createFeedbackElement();
  panel.append(feedback);

  const form = document.createElement('form');
  form.className = 'admin-form';
  form.noValidate = true;

  const routeGroup = document.createElement('div');
  routeGroup.className = 'admin-form__group';

  const routeLabel = document.createElement('label');
  routeLabel.setAttribute('for', 'tag-route');
  routeLabel.textContent = 'Route';

  const routeInput = document.createElement('input');
  routeInput.type = 'text';
  routeInput.id = 'tag-route';
  routeInput.name = 'route';
  routeInput.placeholder = 'e.g. N25';
  routeInput.autocomplete = 'off';
  routeInput.required = true;

  routeGroup.append(routeLabel, routeInput);
  form.append(routeGroup);

  const tagFieldset = document.createElement('fieldset');
  tagFieldset.className = 'admin-form__group admin-form__group--fieldset';

  const legend = document.createElement('legend');
  legend.textContent = 'Service tags';
  tagFieldset.append(legend);

  const checkboxContainer = document.createElement('div');
  checkboxContainer.className = 'admin-checkboxes';
  const knownInputs = [];

  TAG_OPTIONS.forEach((tag) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'admin-checkbox';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = tag;
    checkbox.name = 'knownTags';
    const span = document.createElement('span');
    span.textContent = tag;
    wrapper.append(checkbox, span);
    checkboxContainer.append(wrapper);
    knownInputs.push(checkbox);
  });

  tagFieldset.append(checkboxContainer);
  form.append(tagFieldset);

  const customGroup = document.createElement('div');
  customGroup.className = 'admin-form__group';

  const customLabel = document.createElement('label');
  customLabel.setAttribute('for', 'tag-custom');
  customLabel.textContent = 'Custom tags (comma separated)';

  const customInput = document.createElement('input');
  customInput.type = 'text';
  customInput.id = 'tag-custom';
  customInput.name = 'custom';
  customInput.placeholder = 'e.g. Express, Limited Stop';
  customInput.autocomplete = 'off';

  customGroup.append(customLabel, customInput);
  form.append(customGroup);

  const actions = document.createElement('div');
  actions.className = 'admin-form__actions';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'button admin-button';
  submit.textContent = 'Save service tags';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'button admin-button admin-button--secondary';
  cancel.textContent = 'Cancel edit';
  cancel.hidden = true;

  actions.append(submit, cancel);
  form.append(actions);
  panel.append(form);

  const listWrapper = document.createElement('div');
  listWrapper.className = 'network-table-wrapper admin-table-wrapper';
  panel.append(listWrapper);

  const resetForm = () => {
    form.reset();
    knownInputs.forEach((checkbox) => {
      checkbox.checked = false;
    });
    adminState.tagEditId = null;
    submit.textContent = 'Save service tags';
    cancel.hidden = true;
  };

  const setFormFromEntry = (entry) => {
    adminState.tagEditId = entry.id;
    submit.textContent = 'Update service tags';
    cancel.hidden = false;
    routeInput.value = entry.route || '';
    const knownTagSet = new Set(TAG_OPTIONS);
    knownInputs.forEach((checkbox) => {
      checkbox.checked = entry.tags.includes(checkbox.value);
    });
    const customTags = entry.tags.filter((tag) => !knownTagSet.has(tag));
    customInput.value = customTags.join(', ');
    routeInput.focus();
    updateFeedback(feedback, `Editing service tags for ${entry.route}.`, 'info');
  };

  const collectTags = () => {
    const tags = [];
    knownInputs.forEach((checkbox) => {
      if (checkbox.checked && !tags.includes(checkbox.value)) {
        tags.push(checkbox.value);
      }
    });
    const customTags = customInput.value
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag && !tags.includes(tag));
    return [...tags, ...customTags];
  };

  const renderList = () => {
    listWrapper.innerHTML = '';
    const overrides = adminState.routeTagOverrides;
    if (!overrides.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-empty';
      empty.textContent = 'No route tag overrides saved yet.';
      listWrapper.append(empty);
      return;
    }

    const table = document.createElement('table');
    table.className = 'network-table admin-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Route', 'Tags', 'Actions'].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headerRow.append(th);
    });
    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement('tbody');
    overrides.forEach((entry) => {
      const row = document.createElement('tr');
      const routeCell = document.createElement('td');
      routeCell.textContent = entry.route;
      row.append(routeCell);

      const tagsCell = document.createElement('td');
      if (entry.tags.length) {
        const tagList = document.createElement('div');
        tagList.className = 'admin-tag-list';
        entry.tags.forEach((tag) => {
          const badge = document.createElement('span');
          badge.className = 'admin-tag';
          badge.textContent = tag;
          tagList.append(badge);
        });
        tagsCell.append(tagList);
      } else {
        tagsCell.textContent = '—';
      }
      row.append(tagsCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'admin-table__actions';
      const editButton = createActionButton('Edit', 'ghost', () => {
        setFormFromEntry(entry);
      });
      const removeButton = createActionButton('Remove', 'danger', async () => {
        const confirmed = window.confirm(`Remove tag override for ${entry.route}?`);
        if (!confirmed) return;
        const nextOverrides = adminState.routeTagOverrides.filter((item) => item.id !== entry.id);
        try {
          const token = await ensureAdminToken();
          const persisted = await setRouteTagOverrides(nextOverrides, { authToken: token });
          adminState.routeTagOverrides = persisted;
          if (adminState.tagEditId === entry.id) {
            resetForm();
          }
          renderList();
          updateFeedback(feedback, `Removed tags for ${entry.route}.`, 'success');
        } catch (error) {
          console.error('Failed to remove route tags.', error);
          updateFeedback(feedback, 'Unable to remove these service tags. Please try again.', 'error');
        }
      });
      actionsCell.append(editButton, removeButton);
      row.append(actionsCell);

      tbody.append(row);
    });

    table.append(tbody);
    listWrapper.append(table);
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const routeValue = routeInput.value.trim();
    if (!routeValue) {
      updateFeedback(feedback, 'A route number is required.', 'error');
      routeInput.focus();
      return;
    }

    const tags = collectTags();
    if (!tags.length) {
      updateFeedback(feedback, 'Select or enter at least one service tag.', 'error');
      return;
    }

    const entry = {
      id: adminState.tagEditId || createId(),
      route: routeValue,
      tags
    };

    let nextOverrides = [...adminState.routeTagOverrides];
    if (adminState.tagEditId) {
      const index = adminState.routeTagOverrides.findIndex((item) => item.id === adminState.tagEditId);
      if (index !== -1) {
        nextOverrides.splice(index, 1, entry);
      }
      updateFeedback(feedback, `Updated tags for ${entry.route}.`, 'success');
    } else {
      nextOverrides.push(entry);
      updateFeedback(feedback, `Saved tags for ${entry.route}.`, 'success');
    }

    try {
      const token = await ensureAdminToken();
      const persisted = await setRouteTagOverrides(nextOverrides, { authToken: token });
      adminState.routeTagOverrides = persisted;
      renderList();
      resetForm();
      routeInput.focus();
    } catch (error) {
      console.error('Failed to save route tag override.', error);
      updateFeedback(feedback, 'We could not save these service tags. Please try again.', 'error');
    }
  });

  cancel.addEventListener('click', () => {
    resetForm();
    updateFeedback(feedback, 'Editing cancelled.', 'info');
  });

  const refresh = () => {
    renderList();
    if (adminState.tagEditId) {
      const current = adminState.routeTagOverrides.find((item) => item.id === adminState.tagEditId);
      if (!current) {
        resetForm();
        updateFeedback(feedback, 'The tags you were editing are no longer available.', 'info');
      }
    }
  };

  refresh();

  return {
    element: panel,
    refresh
  };
}

function createBlogPanel() {
  const panel = document.createElement('section');
  panel.className = 'admin-panel';
  panel.setAttribute('aria-labelledby', 'infoPanelHeading');

  const header = document.createElement('div');
  header.className = 'admin-panel__header';

  const heading = document.createElement('h2');
  heading.id = 'infoPanelHeading';
  heading.textContent = 'Info hub updates';

  const description = document.createElement('p');
  description.className = 'admin-panel__description';
  description.textContent = 'Publish briefs and news that appear on the homepage and Info hub.';

  header.append(heading, description);
  panel.append(header);

  const feedback = createFeedbackElement();
  panel.append(feedback);

  const form = document.createElement('form');
  form.className = 'admin-form';
  form.noValidate = true;

  const grid = document.createElement('div');
  grid.className = 'admin-form__grid';

  const textGroup = (id, label, placeholder = '', type = 'text') => {
    const group = document.createElement('div');
    group.className = 'admin-form__group';
    const inputLabel = document.createElement('label');
    inputLabel.setAttribute('for', id);
    inputLabel.textContent = label;
    const input = document.createElement('input');
    input.type = type;
    input.id = id;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    group.append(inputLabel, input);
    return { group, input };
  };

  const createTextarea = (id, label, placeholder = '') => {
    const group = document.createElement('div');
    group.className = 'admin-form__group admin-form__group--stacked';
    const inputLabel = document.createElement('label');
    inputLabel.setAttribute('for', id);
    inputLabel.textContent = label;
    const textarea = document.createElement('textarea');
    textarea.id = id;
    textarea.placeholder = placeholder;
    textarea.rows = 4;
    group.append(inputLabel, textarea);
    return { group, textarea };
  };

  const inputs = {};

  const titleField = textGroup('blog-title', 'Title', 'e.g. Live tracking gets smarter');
  inputs.title = titleField.input;
  inputs.title.required = true;
  grid.append(titleField.group);

  const authorField = textGroup('blog-author', 'Author', 'RouteFlow London team');
  inputs.author = authorField.input;
  grid.append(authorField.group);

  const publishedField = textGroup('blog-published', 'Published on', '2025-05-12T10:00', 'datetime-local');
  inputs.published = publishedField.input;
  grid.append(publishedField.group);

  const heroField = textGroup('blog-hero', 'Hero image URL', 'https://example.com/bus.jpg', 'url');
  inputs.heroImage = heroField.input;
  grid.append(heroField.group);

  const tagsField = textGroup('blog-tags', 'Tags (comma separated)', 'Planning, Update');
  inputs.tags = tagsField.input;
  grid.append(tagsField.group);

  form.append(grid);

  const summaryField = createTextarea('blog-summary', 'Summary', 'A short teaser that appears on the homepage and Info hub.');
  inputs.summary = summaryField.textarea;
  form.append(summaryField.group);

  const contentField = createTextarea('blog-content', 'Full content', 'Add paragraphs separated by a blank line for the Info hub.');
  inputs.content = contentField.textarea;
  inputs.content.rows = 6;
  form.append(contentField.group);

  const featuredGroup = document.createElement('div');
  featuredGroup.className = 'admin-form__group admin-form__group--checkbox';
  const featuredLabel = document.createElement('label');
  const featuredInput = document.createElement('input');
  featuredInput.type = 'checkbox';
  featuredInput.id = 'blog-featured';
  inputs.featured = featuredInput;
  const featuredText = document.createElement('span');
  featuredText.textContent = 'Mark as featured brief';
  featuredLabel.append(featuredInput, featuredText);
  featuredGroup.append(featuredLabel);
  form.append(featuredGroup);

  const actions = document.createElement('div');
  actions.className = 'admin-form__actions';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'button admin-button';
  submit.textContent = 'Publish brief';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'button admin-button admin-button--secondary';
  cancel.textContent = 'Cancel edit';
  cancel.hidden = true;

  actions.append(submit, cancel);
  form.append(actions);
  panel.append(form);

  const listWrapper = document.createElement('div');
  listWrapper.className = 'admin-table-wrapper';
  panel.append(listWrapper);

  const toLocalInputValue = (isoValue) => {
    if (!isoValue) return '';
    const date = new Date(isoValue);
    if (!Number.isFinite(date.getTime())) return '';
    const offset = date.getTimezoneOffset();
    const adjusted = new Date(date.getTime() - offset * 60000);
    return adjusted.toISOString().slice(0, 16);
  };

  const fromLocalInputValue = (value) => {
    if (!value) return new Date().toISOString();
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return new Date().toISOString();
    return date.toISOString();
  };

  const resetForm = () => {
    form.reset();
    adminState.blogEditId = null;
    submit.textContent = 'Publish brief';
    cancel.hidden = true;
  };

  const startEdit = (entry) => {
    adminState.blogEditId = entry.id;
    submit.textContent = 'Save changes';
    cancel.hidden = false;
    inputs.title.value = entry.title || '';
    inputs.author.value = entry.author || '';
    inputs.summary.value = entry.summary || '';
    inputs.content.value = entry.content || '';
    inputs.heroImage.value = entry.heroImage || '';
    inputs.tags.value = Array.isArray(entry.tags) ? entry.tags.join(', ') : '';
    inputs.published.value = toLocalInputValue(entry.publishedAt);
    inputs.featured.checked = Boolean(entry.featured);
    inputs.title.focus();
    updateFeedback(feedback, `Editing “${entry.title}”.`, 'info');
  };

  const renderList = () => {
    listWrapper.innerHTML = '';
    const posts = adminState.blogPosts;
    if (!posts.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-empty';
      empty.textContent = 'No briefs published yet. Add your first update above.';
      listWrapper.append(empty);
      return;
    }

    const table = document.createElement('table');
    table.className = 'network-table admin-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Title', 'Published', 'Author', 'Tags', 'Featured', 'Actions'].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headerRow.append(th);
    });
    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement('tbody');
    posts.forEach((entry) => {
      const row = document.createElement('tr');

      const titleCell = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = entry.title;
      titleCell.appendChild(strong);
      if (entry.summary) {
        const summary = document.createElement('p');
        summary.className = 'admin-blog-summary';
        summary.textContent = entry.summary;
        titleCell.appendChild(summary);
      }
      row.append(titleCell);

      const publishedCell = document.createElement('td');
      const publishedDate = entry.publishedAt ? new Date(entry.publishedAt) : null;
      publishedCell.textContent = publishedDate && Number.isFinite(publishedDate.getTime())
        ? publishedDate.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';
      row.append(publishedCell);

      const authorCell = document.createElement('td');
      authorCell.textContent = entry.author || '—';
      row.append(authorCell);

      const tagsCell = document.createElement('td');
      tagsCell.textContent = entry.tags?.length ? entry.tags.join(', ') : '—';
      row.append(tagsCell);

      const featuredCell = document.createElement('td');
      featuredCell.textContent = entry.featured ? 'Yes' : 'No';
      row.append(featuredCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'admin-table__actions';
      const editButton = createActionButton('Edit', 'ghost', () => startEdit(entry));
      const deleteButton = createActionButton('Delete', 'danger', async () => {
        const confirmed = window.confirm(`Delete “${entry.title}”?`);
        if (!confirmed) return;
        const nextPosts = adminState.blogPosts.filter((item) => item.id !== entry.id);
        try {
          const token = await ensureAdminToken();
          const persisted = await setStoredBlogPosts(nextPosts, { authToken: token });
          adminState.blogPosts = persisted;
          if (adminState.blogEditId === entry.id) {
            resetForm();
          }
          renderList();
          updateFeedback(feedback, `Deleted “${entry.title}”.`, 'success');
        } catch (error) {
          console.error('Failed to delete blog post.', error);
          updateFeedback(feedback, 'Unable to delete this brief. Please try again.', 'error');
        }
      });
      actionsCell.append(editButton, deleteButton);
      row.append(actionsCell);

      tbody.append(row);
    });

    table.append(tbody);
    listWrapper.append(table);
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const titleValue = inputs.title.value.trim();
    if (!titleValue) {
      updateFeedback(feedback, 'A title is required before publishing.', 'error');
      inputs.title.focus();
      return;
    }

    const entry = {
      id: adminState.blogEditId || createId(),
      title: titleValue,
      summary: inputs.summary.value.trim(),
      content: inputs.content.value.trim(),
      author: inputs.author.value.trim(),
      heroImage: inputs.heroImage.value.trim(),
      publishedAt: fromLocalInputValue(inputs.published.value),
      tags: inputs.tags.value.split(',').map((tag) => tag.trim()).filter(Boolean),
      featured: inputs.featured.checked
    };

    let nextPosts = [...adminState.blogPosts];
    if (adminState.blogEditId) {
      const index = adminState.blogPosts.findIndex((item) => item.id === adminState.blogEditId);
      if (index !== -1) {
        nextPosts.splice(index, 1, entry);
      }
      updateFeedback(feedback, `Updated “${entry.title}”.`, 'success');
    } else {
      nextPosts.push(entry);
      updateFeedback(feedback, `Published “${entry.title}”.`, 'success');
    }

    try {
      const token = await ensureAdminToken();
      const persisted = await setStoredBlogPosts(nextPosts, { authToken: token });
      adminState.blogPosts = persisted;
      renderList();
      resetForm();
      inputs.title.focus();
    } catch (error) {
      console.error('Failed to save blog post.', error);
      updateFeedback(feedback, 'We could not save this brief. Please try again.', 'error');
    }
  });

  cancel.addEventListener('click', () => {
    resetForm();
    updateFeedback(feedback, 'Editing cancelled.', 'info');
  });

  const refresh = () => {
    renderList();
    if (adminState.blogEditId) {
      const current = adminState.blogPosts.find((item) => item.id === adminState.blogEditId);
      if (!current) {
        resetForm();
        updateFeedback(feedback, 'The brief you were editing is no longer available.', 'info');
      }
    }
  };

  refresh();

  return {
    element: panel,
    refresh
  };
}

function handleStorageSync(event) {
  if (!event || !event.key) return;
  if (event.key === STORAGE_KEYS.withdrawnRoutes) {
    adminState.withdrawnRoutes = getStoredWithdrawnRoutes();
    adminViews.withdrawn?.refresh();
  }
  if (event.key === STORAGE_KEYS.routeTagOverrides) {
    adminState.routeTagOverrides = getRouteTagOverrides();
    adminViews.tags?.refresh();
  }
  if (event.key === STORAGE_KEYS.blogPosts) {
    adminState.blogPosts = getStoredBlogPosts();
    adminViews.blog?.refresh();
  }
}

async function renderAdminDashboard(user) {
  if (!adminContent) return;
  clearPendingRedirect();
  adminState.user = user;
  setBusy(true);

  try {
    await Promise.all([
      refreshWithdrawnRoutes(),
      refreshRouteTagOverrides(),
      refreshBlogPosts()
    ]);
  } catch (error) {
    console.warn('Admin dashboard: failed to refresh initial data.', error);
  }

  adminState.withdrawnRoutes = getStoredWithdrawnRoutes();
  adminState.routeTagOverrides = getRouteTagOverrides();
  adminState.blogPosts = getStoredBlogPosts();

  const section = document.createElement('section');
  section.className = 'admin-dashboard';

  const heading = document.createElement('h1');
  heading.id = 'adminDashboardHeading';
  heading.textContent = 'Admin Console';

  const welcome = document.createElement('p');
  const displayName = user.displayName || user.email || 'Administrator';
  welcome.textContent = `Welcome, ${displayName}.`;

  const intro = document.createElement('p');
  intro.className = 'admin-dashboard__intro';
  intro.textContent = 'Manage custom data for RouteFlow London. Changes apply instantly in this browser once saved.';

  section.append(heading, welcome, intro);

  if (!storageAvailable) {
    const warning = document.createElement('p');
    warning.className = 'admin-warning';
    warning.setAttribute('role', 'alert');
    warning.textContent = 'Local storage is unavailable. Changes will only last until this page is refreshed.';
    section.append(warning);
  }

  const statsWrapper = document.createElement('div');
  statsWrapper.className = 'admin-dashboard__stats';

  const statMeta = [
    {
      icon: 'fa-solid fa-pen-nib',
      label: 'Blog posts',
      value: adminState.blogPosts.length
    },
    {
      icon: 'fa-solid fa-route',
      label: 'Withdrawn routes',
      value: adminState.withdrawnRoutes.length
    },
    {
      icon: 'fa-solid fa-tags',
      label: 'Tag overrides',
      value: adminState.routeTagOverrides.length
    },
    {
      icon: 'fa-solid fa-user-shield',
      label: 'Administrators',
      value: '…',
      id: 'admins'
    }
  ];

  const statRefs = new Map();
  statMeta.forEach((meta) => {
    const card = document.createElement('article');
    card.className = 'admin-stat';

    const iconWrap = document.createElement('span');
    iconWrap.className = 'admin-stat__icon';
    const icon = document.createElement('i');
    icon.className = meta.icon;
    icon.setAttribute('aria-hidden', 'true');
    iconWrap.append(icon);

    const value = document.createElement('span');
    value.className = 'admin-stat__value';
    value.textContent = String(meta.value);

    const label = document.createElement('span');
    label.className = 'admin-stat__label';
    label.textContent = meta.label;

    card.append(iconWrap, value, label);
    statsWrapper.append(card);
    if (meta.id) {
      statRefs.set(meta.id, value);
    }
  });

  section.append(statsWrapper);

  const panels = document.createElement('div');
  panels.className = 'admin-panels';

  const blogManager = createBlogPanel();
  const withdrawnManager = createWithdrawnPanel();
  const tagManager = createTagOverridePanel();
  const updateAdminCount = (count) => {
    const target = statRefs.get('admins');
    if (!target) {
      return;
    }
    if (count === 'loading') {
      target.textContent = '…';
      return;
    }
    if (typeof count === 'number' && Number.isFinite(count)) {
      target.textContent = String(count);
      return;
    }
    target.textContent = '—';
  };

  updateAdminCount('loading');

  const roleManager = createRolePanel(user, {
    onAdminCountChange: (value) => {
      if (value === 'loading') {
        updateAdminCount('loading');
        return;
      }
      if (typeof value === 'number') {
        updateAdminCount(value);
        return;
      }
      updateAdminCount(null);
    }
  });

  adminViews.blog = blogManager;
  adminViews.withdrawn = withdrawnManager;
  adminViews.tags = tagManager;
  adminViews.roles = roleManager;

  panels.append(roleManager.element, blogManager.element, withdrawnManager.element, tagManager.element);
  section.append(panels);

  replaceContent(section);
  setBusy(false);

  if (!storageListenerRegistered) {
    window.addEventListener('storage', handleStorageSync);
    storageListenerRegistered = true;
  }
}

function ensureAuthInstance() {
  const routeflowAuth = window.RouteflowAuth;
  if (routeflowAuth?.ensure) {
    try {
      return Promise.resolve(routeflowAuth.ensure());
    } catch (error) {
      return Promise.reject(error);
    }
  }
  if (typeof window.ensureFirebaseAuth === 'function') {
    try {
      return Promise.resolve(window.ensureFirebaseAuth());
    } catch (error) {
      return Promise.reject(error);
    }
  }
  const fb = window.firebase;
  if (fb && typeof fb.auth === 'function') {
    try {
      if (!fb.apps.length) {
        const config = getFirebaseConfig();
        if (!config) {
          return Promise.reject(new Error('Firebase configuration not available.'));
        }
        fb.initializeApp(config);
      }
      return Promise.resolve(fb.auth());
    } catch (error) {
      return Promise.reject(error);
    }
  }
  return Promise.resolve(null);
}

if (!adminContent) {
  console.error('Admin content container not found.');
} else {
  showInfo('Checking your administrator access…');
}

const handleAuthUser = async (user) => {
  if (!user) {
    handleUnauthorized('You must be signed in as an administrator to view this page.');
    return;
  }

  showInfo('Verifying your administrator permissions…');

  try {
    const tokenResult = await user.getIdTokenResult();
    if (resolveAdminStatus(user, tokenResult)) {
      await renderAdminDashboard(user);
    } else {
      handleUnauthorized('You are not authorized to access this page.');
    }
  } catch (error) {
    console.error('Failed to retrieve administrator claims:', error);
    showError('We could not verify your administrator permissions. Please try again later.');
  }
};

const routeflowAuth = window.RouteflowAuth;

if (routeflowAuth?.subscribe) {
  routeflowAuth.subscribe(handleAuthUser);
} else {
  ensureAuthInstance()
    .then((auth) => {
      if (!auth || typeof auth.onAuthStateChanged !== 'function') {
        showError('Authentication is currently unavailable. Please try again later.');
        return;
      }
      auth.onAuthStateChanged(handleAuthUser);
    })
    .catch((error) => {
      console.error('Failed to initialise authentication for the admin page:', error);
      showError('Authentication is currently unavailable. Please try again later.');
    });
}

