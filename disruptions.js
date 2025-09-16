const APP_KEY = 'f17d0725d1654338ab02a361fe41abad';
const REFRESH_INTERVAL = 120000;
const RAIL_ENDPOINT = `https://api.tfl.gov.uk/Line/Mode/tube,dlr,overground,elizabeth-line/Status?detail=true&app_key=${APP_KEY}`;
const BUS_ENDPOINT = `https://api.tfl.gov.uk/Line/Mode/bus/Status?detail=true&app_key=${APP_KEY}`;

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
  showGood: false
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

  const filteredRail = filterLines(state.rail);
  const filteredBus = filterLines(state.bus, true);

  renderLines(elements.railGrid, filteredRail);
  renderLines(elements.busGrid, filteredBus);
  updateStats();
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

const fetchStatusData = () => {
  const fetchRail = fetch(RAIL_ENDPOINT).then((response) => {
    if (!response.ok) throw new Error('Failed to load rail disruptions');
    return response.json();
  });
  const fetchBus = fetch(BUS_ENDPOINT).then((response) => {
    if (!response.ok) throw new Error('Failed to load bus disruptions');
    return response.json();
  });

  return Promise.allSettled([fetchRail, fetchBus]).then((results) => {
    const [railResult, busResult] = results;
    if (railResult.status === 'fulfilled') {
      state.rail = railResult.value.map(mapLine);
    } else {
      console.warn(railResult.reason);
      state.rail = [];
    }
    if (busResult.status === 'fulfilled') {
      state.bus = busResult.value.map(mapLine);
    } else {
      console.warn(busResult.reason);
      state.bus = [];
    }
  });
};

const refreshData = () => {
  fetchStatusData()
    .then(() => applyFilters())
    .catch((error) => {
      console.error('Unable to refresh disruption data:', error);
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
