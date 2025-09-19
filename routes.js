import { getRouteTagOverrideMap, normaliseRouteKey, STORAGE_KEYS } from './data-store.js';

const APP_KEY = 'f17d0725d1654338ab02a361fe41abad';

const ROUTE_ENDPOINT = () =>
  `https://api.tfl.gov.uk/Line/Mode/bus/Route?app_key=${APP_KEY}`;
const ROUTE_STOPS_ENDPOINT = (routeId) =>
  `https://api.tfl.gov.uk/Line/${encodeURIComponent(routeId)}/StopPoints?app_key=${APP_KEY}`;
const ROUTE_VEHICLES_ENDPOINT = (routeId) =>
  `https://api.tfl.gov.uk/Line/${encodeURIComponent(routeId)}/Arrivals?app_key=${APP_KEY}`;
const LAST_ROUTE_KEY = 'routeflow.lastRoute';

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
  },
  overlay: {
    container: document.getElementById('routeOverlay'),
    title: document.getElementById('routeOverlayTitle'),
    meta: document.getElementById('routeOverlayMeta'),
    status: document.getElementById('routeOverlayStatus'),
    stops: document.getElementById('routeOverlayStops'),
    vehicles: document.getElementById('routeOverlayVehicles'),
    close: document.getElementById('routeOverlayClose'),
    tracker: document.getElementById('routeOverlayTracker')
  }
};

const state = {
  baseRoutes: [],
  routes: [],
  filteredRoutes: [],
  searchTerm: '',
  serviceFilters: new Set(['Regular']),
  overlay: {
    routeId: null,
    abortController: null
  }
};

const normalise = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const safeLocalStorageSet = (key, value) => {
  if (typeof window === 'undefined' || !('localStorage' in window)) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Ignore storage write issues
  }
};

const setBodyOverlayState = (open) => {
  if (!document?.body) return;
  if (open) {
    document.body.dataset.overlayOpen = 'true';
  } else {
    delete document.body.dataset.overlayOpen;
  }
};

const setOverlayStatus = (message) => {
  const status = elements.overlay.status;
  if (!status) return;
  if (message) {
    status.textContent = message;
    status.hidden = false;
  } else {
    status.textContent = '';
    status.hidden = true;
  }
};

const updateOverlayTrackerLink = (stop) => {
  const link = elements.overlay.tracker;
  if (!link) return;
  if (stop?.id && typeof window !== 'undefined') {
    try {
      const url = new URL('tracking.html', window.location.href);
      url.searchParams.set('stopId', stop.id);
      if (stop.name) {
        url.searchParams.set('stopName', stop.name);
      }
      link.href = url.toString();
      link.textContent = `Open tracker for ${stop.name}`;
      return;
    } catch (error) {
      // Fallback to default link
    }
  }
  link.href = 'tracking.html';
  link.textContent = 'Open tracker';
};

const getAdditionalProperty = (stop, key) => {
  if (!stop?.additionalProperties) return '';
  const match = stop.additionalProperties.find((prop) => prop.key === key);
  return match?.value || '';
};

const mapStops = (collection = []) => {
  const seen = new Set();
  return collection
    .map((stop) => {
      const id = stop?.id || stop?.naptanId || stop?.stationNaptan;
      if (!id || seen.has(id)) return null;
      seen.add(id);
      const name = stop.commonName || stop.name || id;
      const letter = stop.stopLetter || stop.indicator || getAdditionalProperty(stop, 'StopLetter') || '';
      const towards = getAdditionalProperty(stop, 'Towards') || stop.towards || '';
      return { id, name, letter, towards };
    })
    .filter(Boolean);
};

const createStopElement = (stop) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'route-overlay__stop';

  const title = document.createElement('div');
  title.className = 'route-overlay__stop-title';
  const name = document.createElement('span');
  name.textContent = stop.name;
  title.appendChild(name);
  if (stop.letter) {
    const letter = document.createElement('span');
    letter.className = 'route-overlay__stop-letter';
    letter.textContent = stop.letter;
    title.appendChild(letter);
  }

  const meta = document.createElement('p');
  meta.className = 'route-overlay__stop-meta';
  meta.textContent = stop.towards ? `Towards ${stop.towards}` : 'Select to load live times';

  button.append(title, meta);
  button.addEventListener('click', () => openStopInTracker(stop));
  return button;
};

const renderOverlayStops = (stops) => {
  const container = elements.overlay.stops;
  if (!container) return;
  container.innerHTML = '';
  if (!stops.length) {
    const empty = document.createElement('p');
    empty.className = 'route-overlay__empty';
    empty.textContent = 'Stop list unavailable right now.';
    container.appendChild(empty);
    updateOverlayTrackerLink(null);
    return;
  }
  stops.forEach((stop) => container.appendChild(createStopElement(stop)));
  updateOverlayTrackerLink(stops[0]);
};

const formatEta = (seconds) => {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.round(seconds / 60);
  if (minutes <= 0) return 'Due';
  return `${minutes} min`;
};

const mapVehicles = (arrivals = []) => {
  const grouped = new Map();
  arrivals.forEach((entry) => {
    const vehicleId = entry?.vehicleId || entry?.vehicleRegistrationNumber || entry?.vehicleNumber;
    if (!vehicleId) return;
    const timeToStation = Number(entry.timeToStation);
    const existing = grouped.get(vehicleId);
    if (existing && Number.isFinite(timeToStation) && existing.timeToStation <= timeToStation) {
      return;
    }
    grouped.set(vehicleId, {
      id: vehicleId,
      line: entry?.lineName || entry?.lineId || '',
      destination: entry?.destinationName || entry?.towards || '',
      currentStopId: entry?.naptanId || '',
      currentStopName: entry?.stationName || entry?.currentLocation || '',
      timeToStation: Number.isFinite(timeToStation) ? timeToStation : null
    });
  });
  return Array.from(grouped.values()).sort((a, b) => {
    const aTime = Number.isFinite(a.timeToStation) ? a.timeToStation : Number.POSITIVE_INFINITY;
    const bTime = Number.isFinite(b.timeToStation) ? b.timeToStation : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });
};

const createVehicleElement = (vehicle) => {
  const item = document.createElement('article');
  item.className = 'route-overlay__vehicle';

  const title = document.createElement('div');
  title.className = 'route-overlay__vehicle-title';
  const reg = document.createElement('span');
  reg.className = 'route-overlay__vehicle-reg';
  reg.textContent = vehicle.id;
  title.appendChild(reg);
  if (vehicle.line) {
    const routeLabel = document.createElement('span');
    routeLabel.className = 'route-overlay__vehicle-route';
    routeLabel.textContent = `Route ${vehicle.line}`;
    title.appendChild(routeLabel);
  }
  item.appendChild(title);

  if (vehicle.destination) {
    const destination = document.createElement('p');
    destination.className = 'route-overlay__vehicle-destination';
    destination.textContent = vehicle.destination;
    item.appendChild(destination);
  }

  const details = [];
  if (Number.isFinite(vehicle.timeToStation)) {
    details.push(formatEta(vehicle.timeToStation));
  }
  if (vehicle.currentStopName) {
    details.push(vehicle.currentStopName);
  }
  if (details.length) {
    const meta = document.createElement('p');
    meta.className = 'route-overlay__vehicle-meta';
    meta.textContent = details.join(' • ');
    item.appendChild(meta);
  }

  if (vehicle.currentStopId) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'route-overlay__vehicle-action';
    action.textContent = 'Track this stop';
    action.addEventListener('click', () => {
      openStopInTracker({
        id: vehicle.currentStopId,
        name: vehicle.currentStopName || vehicle.destination || `Route ${vehicle.line}`
      });
    });
    item.appendChild(action);
  }

  return item;
};

const renderOverlayVehicles = (vehicles) => {
  const container = elements.overlay.vehicles;
  if (!container) return;
  container.innerHTML = '';
  if (!vehicles.length) {
    const empty = document.createElement('p');
    empty.className = 'route-overlay__empty';
    empty.textContent = 'No active buses on this route right now.';
    container.appendChild(empty);
    return;
  }
  vehicles.forEach((vehicle) => container.appendChild(createVehicleElement(vehicle)));
};

const openStopInTracker = (stop) => {
  if (!stop?.id || typeof window === 'undefined') return;
  let target = 'tracking.html';
  try {
    const url = new URL('tracking.html', window.location.href);
    url.searchParams.set('stopId', stop.id);
    if (stop.name) {
      url.searchParams.set('stopName', stop.name);
    }
    target = url.toString();
  } catch (error) {
    target = 'tracking.html';
  }
  closeOverlay();
  window.location.href = target;
};

const storeLastRoute = (route) => {
  if (!route) return;
  const payload = {
    id: route.id || route.name,
    name: route.name,
    origins: route.origins || [],
    destinations: route.destinations || [],
    serviceTypes: route.serviceTypes || [],
    timestamp: Date.now()
  };
  safeLocalStorageSet(LAST_ROUTE_KEY, payload);
};

const closeOverlay = () => {
  if (state.overlay.abortController) {
    state.overlay.abortController.abort();
    state.overlay.abortController = null;
  }
  state.overlay.routeId = null;
  if (elements.overlay.container) {
    elements.overlay.container.setAttribute('hidden', '');
  }
  setBodyOverlayState(false);
  setOverlayStatus('');
};

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

const openRouteOverlay = (route) => {
  if (!route) return;
  const routeId = route.id || route.name;
  if (!routeId || !elements.overlay.container) return;

  if (state.overlay.abortController) {
    state.overlay.abortController.abort();
  }

  state.overlay.routeId = routeId;
  const controller = new AbortController();
  state.overlay.abortController = controller;

  if (elements.overlay.title) {
    elements.overlay.title.textContent = route.name || `Route ${routeId}`;
  }
  if (elements.overlay.meta) {
    const endpoints = [route.origins?.[0], route.destinations?.[0]].filter(Boolean).join(' → ');
    const types = (route.serviceTypes || []).join(' · ');
    const parts = [];
    if (endpoints) parts.push(endpoints);
    if (types) parts.push(types);
    elements.overlay.meta.textContent = parts.join(' • ');
  }

  renderOverlayStops([]);
  renderOverlayVehicles([]);
  updateOverlayTrackerLink(null);
  setOverlayStatus('Loading stops and vehicles…');

  elements.overlay.container.removeAttribute('hidden');
  setBodyOverlayState(true);
  elements.overlay.close?.focus?.({ preventScroll: true });

  storeLastRoute(route);

  const fetchStops = fetch(ROUTE_STOPS_ENDPOINT(routeId), { signal: controller.signal })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load stops (${response.status})`);
      }
      return response.json();
    })
    .catch((error) => {
      if (error.name === 'AbortError') throw error;
      console.warn(`Unable to fetch stop list for ${routeId}:`, error);
      return [];
    });

  const fetchVehicles = fetch(ROUTE_VEHICLES_ENDPOINT(routeId), { signal: controller.signal })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load vehicles (${response.status})`);
      }
      return response.json();
    })
    .catch((error) => {
      if (error.name === 'AbortError') throw error;
      console.warn(`Unable to fetch vehicles for ${routeId}:`, error);
      return [];
    });

  Promise.allSettled([fetchStops, fetchVehicles])
    .then(([stopsResult, vehiclesResult]) => {
      if (state.overlay.routeId !== routeId) return;
      const stops = mapStops(stopsResult.status === 'fulfilled' ? stopsResult.value : []);
      const vehicles = mapVehicles(vehiclesResult.status === 'fulfilled' ? vehiclesResult.value : []);
      renderOverlayStops(stops);
      renderOverlayVehicles(vehicles);
      if (stops.length || vehicles.length) {
        setOverlayStatus('Select a stop to open live tracking.');
      } else {
        setOverlayStatus('No live data available right now.');
      }
    })
    .catch((error) => {
      if (error.name === 'AbortError') return;
      console.error('Failed to load route preview:', error);
      if (state.overlay.routeId === routeId) {
        renderOverlayStops([]);
        renderOverlayVehicles([]);
        setOverlayStatus('Unable to load route details right now.');
      }
    })
    .finally(() => {
      if (state.overlay.routeId === routeId) {
        state.overlay.abortController = null;
      }
    });
};

const updateStats = () => {
  const { routes } = state;
  const nightCount = routes.filter((route) => route.serviceTypes.some((type) => type.toLowerCase().includes('night'))).length;
  const schoolCount = routes.filter((route) => route.serviceTypes.some((type) => type.toLowerCase().includes('school'))).length;
  if (elements.stats.total) elements.stats.total.textContent = routes.length.toString();
  if (elements.stats.night) elements.stats.night.textContent = nightCount.toString();
  if (elements.stats.school) elements.stats.school.textContent = schoolCount.toString();
};

const applyServiceTypeOverrides = (routes) => {
  const overrides = getRouteTagOverrideMap();
  if (!overrides.size) {
    return routes.map((route) => ({ ...route, serviceTypes: [...(route.serviceTypes || [])] }));
  }

  return routes.map((route) => {
    const key = normaliseRouteKey(route.name || route.id);
    if (key && overrides.has(key)) {
      return {
        ...route,
        serviceTypes: [...overrides.get(key)]
      };
    }

    return {
      ...route,
      serviceTypes: [...(route.serviceTypes || [])]
    };
  });
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
    card.className = 'network-card network-card--action';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');

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

    const info = document.createElement('div');
    info.className = 'network-card__info';

    const summary = document.createElement('span');
    summary.className = 'network-card__meta';
    const corridorCount = new Set([...(route.origins || []), ...(route.destinations || [])]).size;
    summary.textContent = `${corridorCount} key destinations`;

    const hint = document.createElement('span');
    hint.className = 'network-card__hint';
    hint.textContent = 'Tap to view stops & vehicles';

    info.append(summary, hint);

    const link = document.createElement('a');
    link.className = 'network-card__link';
    link.href = 'tracking.html';
    link.textContent = 'Open in tracker';
    link.addEventListener('click', (event) => event.stopPropagation());

    footer.append(info, link);

    const activateCard = () => openRouteOverlay(route);
    card.addEventListener('click', (event) => {
      if (event.target.closest('a')) return;
      activateCard();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateCard();
      }
    });

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
  return fetch(ROUTE_ENDPOINT())
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

const refreshServiceOverrides = () => {
  if (!state.baseRoutes.length) return;
  state.routes = applyServiceTypeOverrides(state.baseRoutes);
  updateStats();
  applyFilters();
};

const initialise = async () => {
  attachEvents();
  const routes = await fetchRoutes();
  state.baseRoutes = routes;
  state.routes = applyServiceTypeOverrides(routes);
  updateStats();
  applyFilters();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialise, { once: true });
} else {
  initialise();
}

elements.overlay.close?.addEventListener('click', closeOverlay);
elements.overlay.container?.addEventListener('click', (event) => {
  if (event.target?.dataset?.routeOverlayDismiss !== undefined) {
    closeOverlay();
  }
});

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.overlay.routeId) {
      closeOverlay();
    }
  });
}

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEYS.routeTagOverrides) {
    refreshServiceOverrides();
  }
});
