const APP_KEY = 'f17d0725d1654338ab02a361fe41abad';
const ROUTE_ENDPOINT = `https://api.tfl.gov.uk/Line/Mode/bus/Route?app_key=${APP_KEY}`;

const fallbackRoutes = [
  {
    id: '25',
    name: '25',
    serviceTypes: ['Regular'],
    origins: ['Ilford'],
    destinations: ['City Thameslink']
  },
  {
    id: 'N25',
    name: 'N25',
    serviceTypes: ['Night'],
    origins: ['Oxford Circus'],
    destinations: ['Ilford']
  },
  {
    id: '68',
    name: '68',
    serviceTypes: ['Regular'],
    origins: ['West Norwood'],
    destinations: ['Euston']
  },
  {
    id: '68X',
    name: '68X',
    serviceTypes: ['School', 'Special'],
    origins: ['West Norwood'],
    destinations: ['Waterloo']
  }
];

const elements = {
  grid: document.getElementById('routesGrid'),
  search: document.getElementById('routeSearch'),
  filters: document.getElementById('routeFilters'),
  stats: {
    total: document.getElementById('routesTotal'),
    night: document.getElementById('routesNight'),
    school: document.getElementById('routesSchool')
  }
};

const state = {
  routes: [],
  filteredRoutes: [],
  searchTerm: '',
  serviceFilters: new Set(['Regular'])
};

const normalise = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const mapRoutes = (data) => {
  const grouped = new Map();

  data.forEach((entry) => {
    const name = entry.name || entry.id;
    if (!name) return;
    const key = name.toUpperCase();
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: entry.id,
        name,
        serviceTypes: new Set(),
        origins: new Set(),
        destinations: new Set()
      });
    }
    const record = grouped.get(key);
    (entry.serviceTypes || []).forEach((type) => {
      const value = type?.name || type?.serviceType || type;
      if (value) record.serviceTypes.add(value);
    });
    (entry.routeSections || []).forEach((section) => {
      if (section?.originationName) {
        record.origins.add(section.originationName);
      }
      if (section?.destinationName) {
        record.destinations.add(section.destinationName);
      }
    });
  });

  return Array.from(grouped.values()).map((route) => ({
    id: route.id,
    name: route.name,
    serviceTypes: Array.from(route.serviceTypes),
    origins: Array.from(route.origins),
    destinations: Array.from(route.destinations)
  }));
};

const updateStats = () => {
  const { routes } = state;
  const nightCount = routes.filter((route) => route.serviceTypes.some((type) => type.toLowerCase().includes('night'))).length;
  const schoolCount = routes.filter((route) => route.serviceTypes.some((type) => type.toLowerCase().includes('school'))).length;
  if (elements.stats.total) elements.stats.total.textContent = routes.length.toString();
  if (elements.stats.night) elements.stats.night.textContent = nightCount.toString();
  if (elements.stats.school) elements.stats.school.textContent = schoolCount.toString();
};

const renderRoutes = () => {
  if (!elements.grid) return;
  elements.grid.innerHTML = '';

  if (!state.filteredRoutes.length) {
    const empty = document.createElement('p');
    empty.className = 'network-empty';
    empty.textContent = 'No routes match your filters just yet.';
    elements.grid.appendChild(empty);
    return;
  }

  state.filteredRoutes.forEach((route) => {
    const card = document.createElement('article');
    card.className = 'network-card';

    const title = document.createElement('h3');
    title.className = 'network-card__title';
    title.textContent = route.name;

    const meta = document.createElement('p');
    meta.className = 'network-card__meta';
    const origin = route.origins?.[0] || 'Origin to be confirmed';
    const destination = route.destinations?.[0] || 'Destination to be confirmed';
    meta.textContent = `${origin} → ${destination}`;

    const tags = document.createElement('div');
    tags.className = 'network-card__tags';
    if (route.serviceTypes?.length) {
      route.serviceTypes.forEach((type) => {
        const tag = document.createElement('span');
        tag.className = 'network-tag';
        tag.textContent = type;
        tags.appendChild(tag);
      });
    }

    const footer = document.createElement('div');
    footer.className = 'network-card__footer';

    const summary = document.createElement('span');
    summary.className = 'network-card__meta';
    const corridorCount = new Set([...(route.origins || []), ...(route.destinations || [])]).size;
    summary.textContent = `${corridorCount} key destinations`;

    const link = document.createElement('a');
    link.className = 'network-card__link';
    link.href = 'tracking.html';
    link.textContent = 'Open in tracker';

    footer.append(summary, link);
    card.append(title, meta);
    if (tags.childElementCount) {
      card.appendChild(tags);
    }
    card.appendChild(footer);

    elements.grid.appendChild(card);
  });
};

const applyFilters = () => {
  const term = normalise(state.searchTerm);
  const activeFilters = state.serviceFilters;

  const matchesFilter = (route) => {
    if (!activeFilters.size) return true;
    if (!route.serviceTypes?.length) return activeFilters.has('Regular');
    return route.serviceTypes.some((type) => activeFilters.has(type) || activeFilters.has(type.replace(/ Service$/i, '')));
  };

  const matchesSearch = (route) => {
    if (!term) return true;
    const fields = [route.name, ...(route.origins || []), ...(route.destinations || [])];
    return fields.some((field) => normalise(field).includes(term));
  };

  state.filteredRoutes = state.routes
    .filter((route) => matchesFilter(route) && matchesSearch(route))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));

  renderRoutes();
};

const setFilterActive = (button, active) => {
  if (!button) return;
  button.dataset.active = String(active);
};

const handleFilterToggle = (event) => {
  const button = event.target.closest('button[data-filter]');
  if (!button) return;
  const filterKey = button.dataset.filter;
  if (!filterKey) return;

  if (state.serviceFilters.has(filterKey)) {
    state.serviceFilters.delete(filterKey);
  } else {
    state.serviceFilters.add(filterKey);
  }

  if (state.serviceFilters.size === 0) {
    state.serviceFilters.add(filterKey);
  }

  Array.from(elements.filters?.querySelectorAll('button[data-filter]') || []).forEach((btn) => {
    setFilterActive(btn, state.serviceFilters.has(btn.dataset.filter));
  });

  applyFilters();
};

const attachEvents = () => {
  elements.search?.addEventListener('input', (event) => {
    state.searchTerm = event.target.value;
    window.requestAnimationFrame(applyFilters);
  });

  elements.filters?.addEventListener('click', handleFilterToggle);
};

const fetchRoutes = () => {
  return fetch(ROUTE_ENDPOINT)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load routes (${response.status})`);
      }
      return response.json();
    })
    .then((data) => mapRoutes(data))
    .catch((error) => {
      console.warn('Falling back to sample route data:', error);
      return fallbackRoutes;
    });
};

const initialise = async () => {
  attachEvents();
  const routes = await fetchRoutes();
  state.routes = routes;
  updateStats();
  applyFilters();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialise, { once: true });
} else {
  initialise();
}
