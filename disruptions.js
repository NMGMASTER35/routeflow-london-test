const REFRESH_INTERVAL = 120000;

const TFL_API_BASE = '/api/tfl';

const RAIL_ENDPOINT = () =>
  `${TFL_API_BASE}/Line/Mode/tube,dlr,overground,elizabeth-line/Status?detail=true`;
const BUS_ENDPOINT = () => `${TFL_API_BASE}/Line/Mode/bus/Status?detail=true`;

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

const renderLines = (target, lines) => {
  if (!target) return;
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

  lines.forEach((line) => {
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

  target.appendChild(card);
  });
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
    renderLines(elements.railGrid, filteredRail);
  }

  if (state.loading.bus) {
    renderLoading(elements.busGrid);
  } else {
    const filteredBus = filterLines(state.bus, true);
    renderLines(elements.busGrid, filteredBus);
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

const fetchStatusData = async () => {
  const fetchRail = fetch(RAIL_ENDPOINT()).then((response) => {
    if (!response.ok) throw new Error('Failed to load rail disruptions');
    return response.json();
  });
  const fetchBus = fetch(BUS_ENDPOINT()).then((response) => {
    if (!response.ok) throw new Error('Failed to load bus disruptions');
    return response.json();
  });

  const [railResult, busResult] = await Promise.allSettled([fetchRail, fetchBus]);

  if (railResult.status === 'fulfilled') {
    state.rail = railResult.value.map(mapLine);
    state.loaded.rail = true;
  } else {
    console.warn(railResult.reason);
    state.rail = [];
    state.loaded.rail = false;
  }

  if (busResult.status === 'fulfilled') {
    state.bus = busResult.value.map(mapLine);
    state.loaded.bus = true;
  } else {
    console.warn(busResult.reason);
    state.bus = [];
    state.loaded.bus = false;
  }
};

const refreshData = () => {
  const shouldShowRailLoader = !state.loaded.rail;
  const shouldShowBusLoader = !state.loaded.bus;

  if (shouldShowRailLoader || shouldShowBusLoader) {
    state.loading.rail = shouldShowRailLoader;
    state.loading.bus = shouldShowBusLoader;
    applyFilters();
  }

  fetchStatusData()
    .catch((error) => {
      console.error('Unable to refresh disruption data:', error);
    })
    .finally(() => {
      state.loading.rail = false;
      state.loading.bus = false;
      applyFilters();
    });
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
