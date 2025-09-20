const APP_KEY = ''; // ← Add your TfL API key here while testing
const REFRESH_INTERVAL = 120000;

const withAppKey = (url) => {
  if (!APP_KEY) {
    return url;
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}app_key=${encodeURIComponent(APP_KEY)}`;
};

const RAIL_ENDPOINT = () =>
  withAppKey('https://api.tfl.gov.uk/Line/Mode/tube,dlr,overground,elizabeth-line/Status?detail=true');
const BUS_ENDPOINT = () =>
  withAppKey('https://api.tfl.gov.uk/Line/Mode/bus/Status?detail=true');

const elements = {
  railGrid: document.getElementById('railGrid'),
  busGrid: document.getElementById('busGrid'),
  busSearch: document.getElementById('busSearch'),
  filters: document.getElementById('disruptionFilters'),
  stats: {
    active: document.getElementById('disruptionsActive'),
    good: document.getElementById('disruptionsGood'),
    routes: document.getElementById('disruptionsRoutes')
  }
};

const state = {
  rail: [],
  bus: [],
  search: '',
  showIssues: true,
  showGood: false,
  loading: {
    rail: false,
    bus: false
  },
  loaded: {
    rail: false,
    bus: false
  },
  pendingReveal: {
    rail: false,
    bus: false
  }
};

const normalise = (value) => (typeof value === 'string' ? value.trim() : '');

const mapLine = (line) => {
  const status = line.lineStatuses?.[0] || {};
  const statusDescription = status.statusSeverityDescription || 'No data';
  const isGood = statusDescription.toLowerCase() === 'good service';
  const reasons = (line.lineStatuses || [])
    .map((entry) => normalise(entry.reason))
    .filter(Boolean);
  const disruptionNotes = (line.disruptions || []).map((item) => normalise(item.description)).filter(Boolean);

  return {
    id: line.id,
    name: line.name,
    status: statusDescription,
    isGood,
    reasons,
    disruptions: disruptionNotes
  };
};

const createLineCard = (line) => {
  const card = document.createElement('article');
  card.className = 'network-card';
  card.dataset.state = line.isGood ? 'good' : 'issue';

  const title = document.createElement('h3');
  title.className = 'network-card__title';
  title.textContent = line.name;

  const status = document.createElement('p');
  status.className = 'network-card__status';
  status.textContent = line.status;

  card.append(title, status);

  if (line.reasons.length) {
    line.reasons.forEach((reason) => {
      const paragraph = document.createElement('p');
      paragraph.className = 'network-card__meta';
      paragraph.textContent = reason;
      card.appendChild(paragraph);
    });
  }

  if (line.disruptions.length) {
    const list = document.createElement('ul');
    list.className = 'network-card__list';
    line.disruptions.forEach((note) => {
      const item = document.createElement('li');
      item.textContent = note;
      list.appendChild(item);
    });
    card.appendChild(list);
  }

  return card;
};

const renderLines = (target, lines, options = {}) => {
  if (!target) return;
  const { progressive = false } = options;

  target.innerHTML = '';
  target.dataset.loading = 'false';
  target.removeAttribute('aria-busy');

  if (!lines.length) {
    const empty = document.createElement('p');
    empty.className = 'network-empty';
    empty.textContent = 'No services to display.';
    target.appendChild(empty);
    return;
  }

  if (!progressive) {
    const fragment = document.createDocumentFragment();
    lines.forEach((line) => {
      fragment.appendChild(createLineCard(line));
    });
    target.appendChild(fragment);
    return;
  }

  let index = 0;
  const appendNext = () => {
    if (index >= lines.length) return;
    target.appendChild(createLineCard(lines[index]));
    index += 1;
    if (index < lines.length) {
      requestAnimationFrame(appendNext);
    }
  };

  appendNext();
};

const renderLoading = (target) => {
  if (!target) return;
  target.innerHTML = '';
  target.dataset.loading = 'true';
  target.setAttribute('aria-busy', 'true');

  const placeholders = 3;

  for (let index = 0; index < placeholders; index += 1) {
    const card = document.createElement('article');
    card.className = 'network-card network-card--loading';
    card.setAttribute('aria-hidden', 'true');

    const title = document.createElement('span');
    title.className = 'network-loading-block network-loading-block--title';

    const status = document.createElement('span');
    status.className = 'network-loading-block network-loading-block--status';

    const metaPrimary = document.createElement('span');
    metaPrimary.className = 'network-loading-block network-loading-block--meta';

    const metaSecondary = document.createElement('span');
    metaSecondary.className = 'network-loading-block network-loading-block--meta-small';

    card.append(title, status, metaPrimary, metaSecondary);
    target.appendChild(card);
  }
};

const setStatsLoading = () => {
  const placeholder = '…';
  Object.values(elements.stats).forEach((statElement) => {
    if (statElement) {
      statElement.textContent = placeholder;
    }
  });
};

const updateStats = () => {
  const allLines = [...state.rail, ...state.bus];
  const activeIncidents = allLines.filter((line) => !line.isGood).length;
  const goodService = allLines.filter((line) => line.isGood).length;
  const affectedBusRoutes = state.bus.filter((line) => !line.isGood || line.disruptions.length).length;

  if (elements.stats.active) elements.stats.active.textContent = activeIncidents.toString();
  if (elements.stats.good) elements.stats.good.textContent = goodService.toString();
  if (elements.stats.routes) elements.stats.routes.textContent = affectedBusRoutes.toString();
};

const applyFilters = () => {
  const searchTerm = state.search.toLowerCase();

  const filterLines = (collection, applySearch = false) => {
    return collection.filter((line) => {
      const includeIssues = state.showIssues && !line.isGood;
      const includeGood = state.showGood && line.isGood;
      const include = includeIssues || includeGood || (!state.showGood && !state.showIssues);
      if (!include) return false;
      if (!applySearch || !searchTerm) return true;
      return line.name.toLowerCase().includes(searchTerm);
    });
  };

  if (state.loading.rail) {
    renderLoading(elements.railGrid);
  } else {
    const filteredRail = filterLines(state.rail);
    renderLines(elements.railGrid, filteredRail, { progressive: state.pendingReveal.rail });
    state.pendingReveal.rail = false;
  }

  if (state.loading.bus) {
    renderLoading(elements.busGrid);
  } else {
    const filteredBus = filterLines(state.bus, true);
    renderLines(elements.busGrid, filteredBus, { progressive: state.pendingReveal.bus });
    state.pendingReveal.bus = false;
  }

  if (state.loading.rail || state.loading.bus) {
    setStatsLoading();
  } else {
    updateStats();
  }
};

const setFilterState = (button, active) => {
  if (!button) return;
  button.dataset.active = String(active);
};

const handleFilterClick = (event) => {
  const button = event.target.closest('button[data-filter]');
  if (!button) return;
  const filter = button.dataset.filter;
  if (filter === 'issues') {
    state.showIssues = !state.showIssues;
    if (!state.showGood && !state.showIssues) {
      state.showIssues = true;
    }
  } else if (filter === 'good') {
    state.showGood = !state.showGood;
    if (!state.showGood && !state.showIssues) {
      state.showGood = true;
    }
  }

  Array.from(elements.filters?.querySelectorAll('button[data-filter]') || []).forEach((btn) => {
    if (btn.dataset.filter === 'issues') {
      setFilterState(btn, state.showIssues);
    } else if (btn.dataset.filter === 'good') {
      setFilterState(btn, state.showGood);
    }
  });

  applyFilters();
};

const loadLines = async (key, endpoint) => {
  const shouldShowLoader = !state.loaded[key];
  state.loading[key] = true;
  if (shouldShowLoader) {
    applyFilters();
  }

  try {
    const response = await fetch(endpoint());
    if (!response.ok) {
      throw new Error(`Failed to load ${key} disruptions`);
    }
    const payload = await response.json();
    state[key] = Array.isArray(payload) ? payload.map(mapLine) : [];
    state.loaded[key] = true;
    state.pendingReveal[key] = true;
  } catch (error) {
    console.warn(error);
    state[key] = [];
    state.loaded[key] = false;
  } finally {
    state.loading[key] = false;
    applyFilters();
  }
};

const refreshData = () => {
  loadLines('rail', RAIL_ENDPOINT);
  loadLines('bus', BUS_ENDPOINT);
};

const attachEvents = () => {
  elements.busSearch?.addEventListener('input', (event) => {
    state.search = event.target.value;
    applyFilters();
  });

  elements.filters?.addEventListener('click', handleFilterClick);
};

const initialise = () => {
  attachEvents();
  refreshData();
  window.setInterval(refreshData, REFRESH_INTERVAL);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialise, { once: true });
} else {
  initialise();
}
