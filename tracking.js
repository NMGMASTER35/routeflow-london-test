(function initialiseTrackingBoard() {
  'use strict';

  const AUTO_REFRESH_INTERVAL = 30000;
  const MIN_QUERY_LENGTH = 2;
  const SEARCH_DEBOUNCE_MS = 250;

  const MODE_COLOR_MAP = {
    bus: 'var(--bus)',
    tube: 'var(--tube)',
    dlr: 'var(--dlr)',
    tram: 'var(--tram)',
    overground: 'var(--overground)',
    'elizabeth-line': 'var(--elizabeth-line)',
    'river-bus': 'var(--river-bus)',
    river: 'var(--river-bus)',
    'national-rail': 'var(--national-rail)'
  };

  const API_PROXY_BASE = '/api/tfl';
  const TFL_API_BASE = 'https://api.tfl.gov.uk';

  const elements = {
    searchInput: document.getElementById('trackingSearch'),
    searchButton: document.querySelector('.tracking-search__field button'),
    resultsList: document.getElementById('trackingResultsList'),
    rows: document.getElementById('trackingRows'),
    timestamp: document.getElementById('trackingTimestamp'),
    refreshButton: document.querySelector('.tracking-board__actions .tracking-chip'),
    searchField: document.querySelector('.tracking-search__field')
  };

  if (!elements.searchInput || !elements.resultsList || !elements.rows) {
    return;
  }

  const state = {
    suggestions: [],
    suggestionById: new Map(),
    selectedStop: null,
    refreshTimer: null,
    lastSearchToken: 0
  };

  let searchDebounceTimer = null;

  elements.rows.setAttribute('aria-live', 'polite');
  if (elements.refreshButton) {
    elements.refreshButton.disabled = true;
  }

  const normaliseString = (value) => (typeof value === 'string' ? value.trim() : '');

  const capitalise = (value) => {
    const text = normaliseString(value);
    if (!text) return '';
    return text.toLowerCase().replace(/(^|\s|[-/])(\p{L})/gu, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
  };

  const pickModeColour = (mode) => {
    const key = normaliseString(mode).toLowerCase();
    return MODE_COLOR_MAP[key] || 'var(--accent-blue)';
  };

  const stopRefreshTimer = () => {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
  };

  const startRefreshTimer = () => {
    stopRefreshTimer();
    if (!state.selectedStop) return;
    state.refreshTimer = setInterval(() => {
      if (state.selectedStop) {
        loadDepartures(state.selectedStop, { silent: true });
      }
    }, AUTO_REFRESH_INTERVAL);
  };

  const updateTimestamp = (stop) => {
    if (!elements.timestamp) return;
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const stopLabel = stop ? `${stop.name}${stop.indicator ? ` (${stop.indicator})` : ''}` : '';
    elements.timestamp.textContent = stopLabel ? `Updated ${time} · ${stopLabel}` : `Updated ${time}`;
  };

  const setRefreshEnabled = (enabled) => {
    if (!elements.refreshButton) return;
    elements.refreshButton.disabled = !enabled;
    elements.refreshButton.setAttribute('aria-disabled', String(!enabled));
  };

  const setBoardMessage = (message) => {
    elements.rows.innerHTML = '';
    const placeholder = document.createElement('div');
    placeholder.className = 'empty';
    placeholder.setAttribute('aria-live', 'polite');
    placeholder.textContent = message;
    elements.rows.appendChild(placeholder);
  };

  const setBoardLoading = (message = 'Loading live departures…') => {
    setRefreshEnabled(false);
    setBoardMessage(message);
  };

  const formatEta = (seconds) => {
    if (typeof seconds !== 'number' || Number.isNaN(seconds)) {
      return '—';
    }
    const minutes = Math.round(seconds / 60);
    if (minutes <= 0) return 'Due';
    return minutes === 1 ? '1 min' : `${minutes} mins`;
  };

  const formatAbsoluteTime = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderDepartures = (departures, stop) => {
    elements.rows.innerHTML = '';
    if (!Array.isArray(departures) || !departures.length) {
      setBoardMessage('No live departures right now for this stop.');
      return;
    }

    departures.forEach((departure) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.mode = departure.modeName || '';

      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = departure.lineName || '—';
      badge.style.background = pickModeColour(departure.modeName);

      const destination = document.createElement('div');
      destination.className = 'dest';

      const primary = document.createElement('b');
      primary.textContent = departure.destinationName || departure.towards || 'Destination TBC';
      destination.appendChild(primary);

      const subParts = [];
      if (departure.platformName) subParts.push(departure.platformName);
      if (departure.towards && departure.towards !== departure.destinationName) {
        subParts.push(`Towards ${departure.towards}`);
      }
      if (departure.expectedTimeText) {
        subParts.push(`Due ${departure.expectedTimeText}`);
      }
      if (departure.vehicleId) {
        subParts.push(departure.vehicleId);
      }

      if (subParts.length) {
        const secondary = document.createElement('small');
        secondary.textContent = subParts.join(' • ');
        destination.appendChild(secondary);
      }

      const eta = document.createElement('span');
      eta.className = 'eta';
      eta.textContent = formatEta(departure.timeToStation);

      row.append(badge, destination, eta);
      elements.rows.appendChild(row);
    });

    updateTimestamp(stop);
    setRefreshEnabled(true);
  };

  const mapDeparture = (item) => {
    if (!item || typeof item !== 'object') return null;
    const expectedArrival = item.expectedArrival ? new Date(item.expectedArrival) : null;
    const modeName = normaliseString(item.modeName).toLowerCase();

    return {
      id: item.id || item.naptanId || item.vehicleId || '',
      lineId: item.lineId || '',
      lineName: item.lineName || item.lineId || '',
      destinationName: normaliseString(item.destinationName),
      towards: normaliseString(item.towards),
      platformName: normaliseString(item.platformName),
      vehicleId: normaliseString(item.vehicleId),
      modeName,
      expectedArrival,
      expectedTimeText: formatAbsoluteTime(expectedArrival),
      timeToStation: typeof item.timeToStation === 'number' ? item.timeToStation : Number(item.timeToStation)
    };
  };

  const sortDepartures = (collection) => {
    const getSortValue = (departure) => {
      if (typeof departure.timeToStation === 'number' && !Number.isNaN(departure.timeToStation)) {
        return departure.timeToStation;
      }
      if (departure.expectedArrival instanceof Date && !Number.isNaN(departure.expectedArrival.getTime())) {
        return departure.expectedArrival.getTime();
      }
      return Number.MAX_SAFE_INTEGER;
    };

    return collection.slice().sort((a, b) => getSortValue(a) - getSortValue(b));
  };

  const runFetch = async (url, options = {}) => {
    const response = await fetch(url, options);
    if (!response.ok) {
      const error = new Error(`Request failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  };

  const shouldFallback = (error) => {
    if (!error || typeof error.status !== 'number') {
      return true;
    }
    if (error.status >= 500) {
      return true;
    }
    return [401, 403, 404, 429].includes(error.status);
  };

  const buildProxyUrl = (path) => `${API_PROXY_BASE}${path}`;
  const buildTfLUrl = (path) => `${TFL_API_BASE}${path}`;

  const fetchJson = async (url, { fallbackUrl = null } = {}) => {
    try {
      return await runFetch(url, { credentials: 'same-origin' });
    } catch (error) {
      if (!fallbackUrl || !shouldFallback(error)) {
        throw error;
      }
      try {
        return await runFetch(fallbackUrl, { mode: 'cors', credentials: 'omit' });
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
  };

  const loadDepartures = async (stop, { silent = false } = {}) => {
    if (!stop) return;

    stopRefreshTimer();
    if (!silent) {
      setBoardLoading();
    }

    try {
      const path = `/StopPoint/${encodeURIComponent(stop.id)}/Arrivals`;
      const data = await fetchJson(buildProxyUrl(path), { fallbackUrl: buildTfLUrl(path) });
      const departures = Array.isArray(data)
        ? sortDepartures(data.map(mapDeparture).filter(Boolean))
        : [];
      renderDepartures(departures, stop);
    } catch (error) {
      console.error('Failed to load live departures:', error);
      setBoardMessage('Unable to load live departures right now. Please try again shortly.');
      if (elements.timestamp) {
        elements.timestamp.textContent = 'Last update failed';
      }
    } finally {
      if (state.selectedStop && state.selectedStop.id === stop.id) {
        startRefreshTimer();
      }
      setRefreshEnabled(Boolean(state.selectedStop));
    }
  };

  const hideSuggestions = () => {
    state.suggestions = [];
    state.suggestionById.clear();
    elements.resultsList.innerHTML = '';
    elements.resultsList.style.display = 'none';
  };

  const buildSubtitle = (stop) => {
    const parts = [];
    if (stop.indicator) parts.push(stop.indicator);
    if (stop.locality) parts.push(stop.locality);
    if (stop.modes && stop.modes.length) {
      const formatted = stop.modes
        .map((mode) => capitalise(mode.replace(/-/g, ' ')))
        .join(', ');
      if (formatted) parts.push(formatted);
    }
    if (stop.lines && stop.lines.length) {
      parts.push(`Routes ${stop.lines.join(', ')}`);
    }
    return parts.join(' • ');
  };

  const renderSuggestions = (suggestions) => {
    if (!Array.isArray(suggestions) || !suggestions.length) {
      hideSuggestions();
      return;
    }

    state.suggestions = suggestions;
    state.suggestionById = new Map(suggestions.map((suggestion) => [suggestion.id, suggestion]));

    elements.resultsList.innerHTML = '';

    suggestions.forEach((suggestion) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'result';
      item.dataset.stopId = suggestion.id;

      const main = document.createElement('div');
      main.className = 'r-main';

      const title = document.createElement('div');
      title.className = 'r-title';
      title.textContent = suggestion.name;

      const subtitleText = buildSubtitle(suggestion);
      main.appendChild(title);
      if (subtitleText) {
        const subtitle = document.createElement('div');
        subtitle.className = 'r-sub';
        subtitle.textContent = subtitleText;
        main.appendChild(subtitle);
      }

      item.appendChild(main);
      elements.resultsList.appendChild(item);
    });

    elements.resultsList.style.display = 'block';
  };

  const extractLocality = (match) => {
    if (!match || typeof match !== 'object') return '';
    const { additionalProperties } = match;
    if (Array.isArray(additionalProperties)) {
      const nearest = additionalProperties.find((prop) => normaliseString(prop?.key).toLowerCase() === 'neareststation');
      if (nearest) {
        const value = normaliseString(nearest.value);
        if (value) return value;
      }
    }
    return normaliseString(match.matchedName) || normaliseString(match.locality);
  };

  const mapStopMatch = (match) => {
    if (!match || typeof match !== 'object') return null;
    const id = match.id || match.naptanId || match.icsId;
    if (!id) return null;

    const lines = Array.isArray(match.lines)
      ? match.lines.map((line) => normaliseString(line.name || line.id)).filter(Boolean)
      : [];

    return {
      id,
      name: normaliseString(match.name) || id,
      indicator: normaliseString(match.indicator || match.stopLetter),
      locality: extractLocality(match),
      modes: Array.isArray(match.modes) ? match.modes.map((mode) => normaliseString(mode)).filter(Boolean) : [],
      lines
    };
  };

  const searchStops = async (query) => {
    const trimmed = normaliseString(query);
    if (trimmed.length < MIN_QUERY_LENGTH) {
      hideSuggestions();
      return [];
    }

    const searchToken = ++state.lastSearchToken;
    try {
      const params = new URLSearchParams({
        modes: 'bus,tube,dlr,tram,overground,elizabeth-line,river-bus',
        maxResults: '12',
        query: trimmed
      });
      const path = `/StopPoint/Search?${params.toString()}`;
      const response = await fetchJson(buildProxyUrl(path), { fallbackUrl: buildTfLUrl(path) });
      if (searchToken !== state.lastSearchToken) {
        return [];
      }
      const matches = Array.isArray(response?.matches) ? response.matches : [];
      const mapped = matches
        .map(mapStopMatch)
        .filter(Boolean)
        .slice(0, 12);
      renderSuggestions(mapped);
      return mapped;
    } catch (error) {
      if (searchToken === state.lastSearchToken) {
        console.error('Failed to search StopPoints:', error);
        hideSuggestions();
        setBoardMessage('Unable to search for stops right now. Please try again later.');
      }
      return [];
    }
  };

  const selectStop = (stop) => {
    if (!stop) return;
    state.selectedStop = stop;
    elements.searchInput.value = stop.indicator ? `${stop.name} (${stop.indicator})` : stop.name;
    hideSuggestions();
    loadDepartures(stop);
  };

  const scheduleSearch = (query) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchStops(query);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleInput = (event) => {
    const value = event.target.value;
    state.lastSearchToken += 1; // invalidate pending results if user keeps typing
    if (normaliseString(value).length >= MIN_QUERY_LENGTH) {
      scheduleSearch(value);
    } else {
      hideSuggestions();
    }
  };

  const handleSubmit = () => {
    const currentQuery = normaliseString(elements.searchInput.value);
    if (!currentQuery) return;

    if (state.suggestions.length) {
      selectStop(state.suggestions[0]);
      return;
    }

    searchStops(currentQuery).then((results) => {
      if (results.length) {
        selectStop(results[0]);
      } else {
        setBoardMessage(`No stops found matching “${currentQuery}”.`);
      }
    });
  };

  elements.searchInput.addEventListener('input', handleInput);
  elements.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSubmit();
    } else if (event.key === 'Escape') {
      hideSuggestions();
    }
  });

  if (elements.searchButton) {
    elements.searchButton.addEventListener('click', (event) => {
      event.preventDefault();
      handleSubmit();
    });
  }

  elements.resultsList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-stop-id]');
    if (!button) return;
    const stop = state.suggestionById.get(button.dataset.stopId);
    if (stop) {
      selectStop(stop);
    }
  });

  document.addEventListener('click', (event) => {
    if (!elements.searchField) return;
    if (!elements.searchField.contains(event.target)) {
      hideSuggestions();
    }
  });

  if (elements.searchInput) {
    elements.searchInput.addEventListener('focus', () => {
      if (state.suggestions.length) {
        elements.resultsList.style.display = 'block';
      }
    });
  }

  if (elements.refreshButton) {
    elements.refreshButton.addEventListener('click', () => {
      if (!state.selectedStop) return;
      loadDepartures(state.selectedStop);
    });
  }
})();
