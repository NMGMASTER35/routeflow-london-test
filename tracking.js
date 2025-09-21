(function initTrackingBoard() {
  'use strict';

  const AUTO_REFRESH_MS = 25000;
  const MIN_QUERY_LENGTH = 2;
  const MAX_SUGGESTIONS = 12;
  const MAX_DETAIL_REQUESTS = 8;
  const MAX_LINE_BADGES = 6;
  const SEARCH_DEBOUNCE_MS = 250;
  const STOP_ID_PATTERN = /^\d{8,}[A-Z]?$/i;
  const MODES = 'bus,tube,overground,dlr,tram,river-bus,national-rail,elizabeth-line';

  const API_PROXY_BASE = '/api/tfl';
  const TFL_API_BASE = 'https://api.tfl.gov.uk';

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
  const DEFAULT_BADGE_COLOR = 'var(--accent-blue)';

  const MODE_LABEL_MAP = {
    bus: 'Bus',
    tube: 'Tube',
    dlr: 'DLR',
    tram: 'Tram',
    overground: 'Overground',
    'river-bus': 'River Bus',
    river: 'River',
    'national-rail': 'National Rail',
    'elizabeth-line': 'Elizabeth line'
  };

  const HIGHLIGHT_LABELS = {
    indicator: 'Stop letter',
    locality: 'Locality',
    towards: 'Destination',
    id: 'Stop ID',
    line: 'Line'
  };

  const elements = {
    searchInput: document.getElementById('trackingSearch'),
    searchButton: document.querySelector('.tracking-search__field button'),
    resultsList: document.getElementById('trackingResultsList'),
    rows: document.getElementById('trackingRows'),
    timestamp: document.getElementById('trackingTimestamp'),
    refreshButton: document.querySelector('.tracking-board__actions .tracking-chip'),
    searchField: document.querySelector('.tracking-search__field'),
    boardTitle: document.querySelector('.tracking-board__header h2'),
    boardDescription: document.querySelector('.tracking-board__header p')
  };

  if (!elements.searchInput || !elements.rows) {
    return;
  }

  const defaultBoardTitle = elements.boardTitle?.textContent || 'Live departures';
  const defaultBoardDescription = elements.boardDescription?.textContent || '';

  if (elements.resultsList) {
    elements.resultsList.setAttribute('role', 'listbox');
    elements.resultsList.setAttribute('aria-live', 'polite');
  }

  const state = {
    suggestions: [],
    suggestionById: new Map(),
    selectedStop: null,
    refreshTimer: null,
    searchToken: 0,
    activeSuggestionIndex: -1
  };

  const debounce = (fn, delay) => {
    let timer = null;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), delay);
    };
  };

  const normalise = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

  const uniqueModes = (modes) => {
    if (!Array.isArray(modes)) return [];
    const seen = new Map();
    modes.forEach((mode) => {
      const key = normalise(mode);
      if (!key) return;
      if (!seen.has(key)) {
        seen.set(key, mode);
      }
    });
    return Array.from(seen.values());
  };

  const toTitleCase = (value) =>
    value.replace(/(^|\s|-)([a-z])/g, (_, prefix, char) => `${prefix}${char.toUpperCase()}`);

  const formatModeLabel = (mode) => {
    const key = normalise(mode);
    if (!key) return '';
    if (MODE_LABEL_MAP[key]) {
      return MODE_LABEL_MAP[key];
    }
    return toTitleCase(key.replace(/-/g, ' '));
  };

  const collectLineCandidates = (entity) => {
    if (!entity || typeof entity !== 'object') return [];
    const candidates = [];

    const pushLine = (line) => {
      if (!line) return;
      if (typeof line === 'string') {
        candidates.push(line);
      } else if (typeof line === 'object') {
        if (line.name) candidates.push(line.name);
        if (line.id) candidates.push(line.id);
      }
    };

    if (Array.isArray(entity.lines)) {
      entity.lines.forEach(pushLine);
    }

    if (Array.isArray(entity.lineGroup)) {
      entity.lineGroup.forEach((group) => {
        if (Array.isArray(group?.lineIdentifier)) {
          group.lineIdentifier.forEach(pushLine);
        }
      });
    }

    if (Array.isArray(entity.lineModeGroups)) {
      entity.lineModeGroups.forEach((group) => {
        if (Array.isArray(group?.lineIds)) {
          group.lineIds.forEach(pushLine);
        }
      });
    }

    if (Array.isArray(entity.routeSections)) {
      entity.routeSections.forEach((section) => {
        pushLine(section?.lineName);
        pushLine(section?.lineId);
      });
    }

    pushLine(entity.lineName);
    pushLine(entity.lineId);

    return candidates;
  };

  const buildLineList = (...sources) => {
    const seen = new Map();
    sources.forEach((source) => {
      collectLineCandidates(source).forEach((candidate) => {
        const value = typeof candidate === 'string' ? candidate.trim() : '';
        if (!value) return;
        const key = value.toLowerCase();
        if (!seen.has(key)) {
          seen.set(key, value);
        }
      });
    });
    const lines = Array.from(seen.values());
    return lines.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  };

  const buildProxyUrl = (path) => {
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${API_PROXY_BASE}${suffix}`;
  };

  const buildTfLUrl = (path) => {
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${TFL_API_BASE.replace(/\/$/, '')}${suffix}`;
  };

  const fetchJson = async (url, { fallbackUrl = null } = {}) => {
    try {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (!fallbackUrl) {
        throw error;
      }
      const fallbackResponse = await fetch(fallbackUrl, { mode: 'cors', credentials: 'omit' });
      if (!fallbackResponse.ok) {
        throw new Error(`Fallback request failed with status ${fallbackResponse.status}`);
      }
      return fallbackResponse.json();
    }
  };

  const fetchStopDetail = async (stopId) => {
    if (!stopId) return null;
    const path = `/StopPoint/${encodeURIComponent(stopId)}`;
    try {
      return await fetchJson(buildProxyUrl(path), { fallbackUrl: buildTfLUrl(path) });
    } catch (error) {
      console.warn('Failed to load stop detail', error);
      return null;
    }
  };

  const setRefreshEnabled = (enabled) => {
    if (!elements.refreshButton) return;
    elements.refreshButton.disabled = !enabled;
    elements.refreshButton.setAttribute('aria-disabled', String(!enabled));
  };

  const stopRefreshTimer = () => {
    if (state.refreshTimer) {
      window.clearTimeout(state.refreshTimer);
      state.refreshTimer = null;
    }
  };

  const startRefreshTimer = () => {
    stopRefreshTimer();
    if (!state.selectedStop) {
      return;
    }
    state.refreshTimer = window.setTimeout(() => {
      if (state.selectedStop) {
        loadArrivals(state.selectedStop, { silent: true });
      }
    }, AUTO_REFRESH_MS);
  };

  const setBoardMessage = (message) => {
    elements.rows.innerHTML = '';
    const placeholder = document.createElement('div');
    placeholder.className = 'empty';
    placeholder.setAttribute('role', 'status');
    placeholder.textContent = message;
    elements.rows.appendChild(placeholder);
  };

  const setBoardLoading = (message = 'Loading live departures…') => {
    setRefreshEnabled(false);
    setBoardMessage(message);
  };

  const formatEta = (seconds) => {
    if (!Number.isFinite(seconds)) return '—';
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

  const pickModeColour = (mode) => {
    const key = normalise(mode);
    return MODE_COLOR_MAP[key] || DEFAULT_BADGE_COLOR;
  };

  const highlightText = (text, query) => {
    const container = document.createElement('span');
    if (!text) {
      return container;
    }
    const trimmedQuery = normalise(query);
    if (!trimmedQuery) {
      container.textContent = text;
      return container;
    }
    const lowerText = text.toLowerCase();
    const lowerQuery = trimmedQuery;
    let cursor = 0;
    const rawLength = query.trim().length || trimmedQuery.length || 0;
    while (cursor < text.length) {
      const index = lowerText.indexOf(lowerQuery, cursor);
      if (index === -1) {
        container.appendChild(document.createTextNode(text.slice(cursor)));
        break;
      }
      if (index > cursor) {
        container.appendChild(document.createTextNode(text.slice(cursor, index)));
      }
      const match = document.createElement('span');
      match.className = 'tracking-match';
      match.textContent = text.slice(index, index + rawLength);
      container.appendChild(match);
      cursor = index + rawLength;
    }
    if (!container.childNodes.length) {
      container.textContent = text;
    }
    return container;
  };

  const buildStopSubtitle = (stop) => {
    const parts = [];
    if (stop?.indicator) {
      parts.push(`Stop ${stop.indicator}`);
    }
    if (stop?.locality) {
      parts.push(stop.locality);
    }
    if (stop?.towards) {
      parts.push(`Towards ${stop.towards}`);
    }
    return parts.join(' • ');
  };

  const updateBoardHeader = (stop) => {
    if (!elements.boardTitle || !elements.boardDescription) return;
    if (!stop) {
      elements.boardTitle.textContent = defaultBoardTitle;
      elements.boardDescription.textContent = defaultBoardDescription;
      return;
    }
    elements.boardTitle.textContent = stop.name || defaultBoardTitle;
    const subtitle = buildStopSubtitle(stop);
    elements.boardDescription.textContent = subtitle || defaultBoardDescription;
  };

  const updateTimestamp = (stop) => {
    if (!elements.timestamp) return;
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (stop?.name) {
      const indicator = stop.indicator ? ` (${stop.indicator})` : '';
      elements.timestamp.textContent = `Updated ${time} · ${stop.name}${indicator}`;
    } else {
      elements.timestamp.textContent = `Updated ${time}`;
    }
  };

  const levenshtein = (a, b) => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const previous = new Array(b.length + 1);
    const current = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = j;
    }
    for (let i = 1; i <= a.length; i += 1) {
      current[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        if (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) {
          current[j] = previous[j - 1];
        } else {
          current[j] = Math.min(previous[j - 1], previous[j], current[j - 1]) + 1;
        }
      }
      for (let j = 0; j <= b.length; j += 1) {
        previous[j] = current[j];
      }
    }
    return current[b.length];
  };

  const getAdditionalProperty = (stop, key) => {
    if (!Array.isArray(stop?.additionalProperties)) return '';
    const match = stop.additionalProperties.find((prop) => normalise(prop?.key) === normalise(key));
    return match?.value || '';
  };

  const mapStopToSuggestion = (stop, parent = null) => {
    if (!stop) return null;
    const id = stop.id || stop.naptanId || stop.stationNaptan;
    if (!id) return null;
    const name = stop.commonName || stop.name || id;
    const indicator = stop.stopLetter || stop.indicator || getAdditionalProperty(stop, 'StopLetter') || '';
    const locality = stop.locality || getAdditionalProperty(stop, 'NearestStation') || parent?.locality || '';
    const towards = stop.towards || getAdditionalProperty(stop, 'Towards') || '';
    const modes = Array.isArray(stop.modes) && stop.modes.length
      ? stop.modes
      : Array.isArray(parent?.modes) ? parent.modes : [];

    return {
      id,
      name,
      indicator,
      locality,
      towards,
      modes: uniqueModes(modes),
      lines: buildLineList(stop, parent).slice(0, MAX_LINE_BADGES),
      score: 1,
      exact: false,
      highlightField: null,
      highlightValue: null
    };
  };

  const mapMatchToSuggestion = (match) => {
    if (!match || !match.id) return null;
    const fromAdditional = (key) => {
      if (!Array.isArray(match.additionalProperties)) return '';
      const property = match.additionalProperties.find((prop) => normalise(prop?.key) === normalise(key));
      return property?.value || '';
    };
    return {
      id: match.id,
      name: match.name || match.matchedName || match.id,
      indicator: match.indicator || match.stopLetter || fromAdditional('StopLetter') || '',
      locality: match.locality || match.matchedName || fromAdditional('NearestStation') || '',
      towards: match.towards || fromAdditional('Towards') || '',
      modes: uniqueModes(match.modes),
      lines: buildLineList(match).slice(0, MAX_LINE_BADGES),
      score: 1,
      exact: false,
      highlightField: null,
      highlightValue: null
    };
  };

  const computeSuggestionScore = (query, suggestion) => {
    const searchValue = normalise(query);
    if (!searchValue) {
      suggestion.score = 1;
      suggestion.exact = false;
      suggestion.highlightField = null;
      suggestion.highlightValue = null;
      return suggestion.score;
    }
    const fields = [
      { key: 'name', value: suggestion.name },
      { key: 'indicator', value: suggestion.indicator },
      { key: 'locality', value: suggestion.locality },
      { key: 'towards', value: suggestion.towards },
      { key: 'id', value: suggestion.id }
    ];

    if (Array.isArray(suggestion.lines)) {
      suggestion.lines.forEach((line) => {
        fields.push({ key: 'line', value: line });
      });
    }

    let bestScore = 1;
    let highlightField = null;
    let highlightValue = null;

    for (const field of fields) {
      const text = normalise(field.value);
      if (!text) continue;
      if (text === searchValue) {
        bestScore = 0;
        highlightField = field.key;
        highlightValue = field.value;
        break;
      }
      const substringIndex = text.indexOf(searchValue);
      if (substringIndex !== -1) {
        const weight = 0.05 + (substringIndex / Math.max(text.length, 1)) * 0.05;
        if (weight < bestScore) {
          bestScore = weight;
          highlightField = field.key;
          highlightValue = field.value;
        }
      }
      const distance = levenshtein(searchValue, text);
      const ratio = distance / Math.max(searchValue.length, text.length);
      if (ratio < bestScore) {
        bestScore = ratio;
        highlightField = field.key;
        highlightValue = field.value;
      }
    }

    suggestion.score = Number.isFinite(bestScore) ? bestScore : 1;
    suggestion.exact = suggestion.score === 0;
    suggestion.highlightField = highlightField;
    suggestion.highlightValue = highlightValue;
    return suggestion.score;
  };

  const prepareSuggestions = (query, matches, detailMap) => {
    const results = [];
    const seen = new Set();

    const addSuggestion = (candidate) => {
      if (!candidate || !candidate.id || seen.has(candidate.id)) return;
      computeSuggestionScore(query, candidate);
      seen.add(candidate.id);
      results.push(candidate);
    };

    matches.forEach((match) => {
      const detail = match?.id ? detailMap.get(match.id) : null;
      if (detail) {
        const children = Array.isArray(detail.children) ? detail.children : [];
        if (children.length) {
          children.forEach((child) => {
            const suggestion = mapStopToSuggestion(child, detail);
            addSuggestion(suggestion);
          });
        } else {
          addSuggestion(mapStopToSuggestion(detail, detail));
        }
      } else {
        addSuggestion(mapMatchToSuggestion(match));
      }
    });

    if (!results.length) {
      matches.forEach((match) => addSuggestion(mapMatchToSuggestion(match)));
    }

    results.sort((a, b) => {
      if (a.exact && !b.exact) return -1;
      if (!a.exact && b.exact) return 1;
      if (a.score !== b.score) return a.score - b.score;
      return (a.name || '').localeCompare(b.name || '');
    });

    return results;
  };

  const showSuggestionsMessage = (message) => {
    if (!elements.resultsList) return;
    elements.resultsList.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'tracking-search__empty';
    empty.textContent = message;
    elements.resultsList.appendChild(empty);
    elements.resultsList.style.display = 'block';
    state.activeSuggestionIndex = -1;
  };

  const hideSuggestions = () => {
    if (!elements.resultsList) return;
    elements.resultsList.innerHTML = '';
    elements.resultsList.style.display = 'none';
    state.activeSuggestionIndex = -1;
    state.suggestions = [];
    state.suggestionById.clear();
  };

  const renderSuggestions = (suggestions, query) => {
    if (!elements.resultsList) return;
    elements.resultsList.innerHTML = '';
    state.activeSuggestionIndex = -1;
    if (!Array.isArray(suggestions) || !suggestions.length) {
      showSuggestionsMessage('No stops found. Try refining your search.');
      return;
    }

    const fragment = document.createDocumentFragment();

    suggestions.forEach((suggestion, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'tracking-result';
      item.dataset.stopId = suggestion.id;
      item.dataset.index = String(index);
      item.setAttribute('role', 'option');
      item.tabIndex = -1;

      const main = document.createElement('div');
      main.className = 'tracking-result__main';

      const title = document.createElement('div');
      title.className = 'tracking-result__title';
      title.appendChild(highlightText(suggestion.name, query));
      main.appendChild(title);

      const metaParts = [];
      if (suggestion.indicator) metaParts.push(`Stop ${suggestion.indicator}`);
      if (suggestion.locality) metaParts.push(suggestion.locality);
      if (suggestion.towards) metaParts.push(`Towards ${suggestion.towards}`);
      if (metaParts.length) {
        const meta = document.createElement('div');
        meta.className = 'tracking-result__meta';
        meta.appendChild(highlightText(metaParts.join(' • '), query));
        main.appendChild(meta);
      }

      const lines = Array.isArray(suggestion.lines) ? suggestion.lines.slice(0, MAX_LINE_BADGES) : [];
      if (lines.length) {
        const linesContainer = document.createElement('div');
        linesContainer.className = 'tracking-result__lines';
        linesContainer.setAttribute('aria-label', `Lines served: ${lines.join(', ')}`);
        linesContainer.setAttribute('role', 'list');
        lines.forEach((line) => {
          const chip = document.createElement('span');
          chip.className = 'tracking-result__line';
          chip.setAttribute('role', 'listitem');
          chip.appendChild(highlightText(line, query));
          linesContainer.appendChild(chip);
        });
        main.appendChild(linesContainer);
      }

      const highlightLabel = HIGHLIGHT_LABELS[suggestion.highlightField];
      if (highlightLabel && suggestion.highlightValue) {
        const reason = document.createElement('div');
        reason.className = 'tracking-result__reason';

        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-magnifying-glass';
        icon.setAttribute('aria-hidden', 'true');
        reason.appendChild(icon);

        const description = document.createElement('span');
        description.append(`Matches ${highlightLabel}: `);
        const highlighted = highlightText(String(suggestion.highlightValue), query);
        description.appendChild(highlighted);
        reason.appendChild(description);

        main.appendChild(reason);
      }

      item.appendChild(main);

      if (suggestion.modes && suggestion.modes.length) {
        const badge = document.createElement('span');
        badge.className = 'tracking-result__badge';
        const [primaryMode, ...otherModes] = suggestion.modes;
        const label = formatModeLabel(primaryMode) || 'Mode';
        badge.textContent = otherModes.length ? `${label} +${otherModes.length}` : label;
        const fullLabel = suggestion.modes
          .map((mode) => formatModeLabel(mode) || 'Mode')
          .filter(Boolean)
          .join(', ');
        if (fullLabel) {
          badge.setAttribute('aria-label', fullLabel);
          badge.setAttribute('title', fullLabel);
        }
        badge.style.background = pickModeColour(primaryMode);
        badge.style.color = '#fff';
        item.appendChild(badge);
      }

      fragment.appendChild(item);
    });

    elements.resultsList.appendChild(fragment);
    elements.resultsList.style.display = 'block';
    elements.resultsList.scrollTop = 0;
  };

  const suggestionsVisible = () => elements.resultsList && elements.resultsList.style.display === 'block';

  const setSearchButtonState = () => {
    if (!elements.searchButton) return;
    const rawValue = elements.searchInput.value.trim();
    const enabled = STOP_ID_PATTERN.test(rawValue) || normalise(rawValue).length >= MIN_QUERY_LENGTH;
    elements.searchButton.disabled = !enabled;
    elements.searchButton.setAttribute('aria-disabled', String(!enabled));
  };

  const handleSuggestionNavigation = (direction) => {
    if (!suggestionsVisible()) return;
    const items = elements.resultsList.querySelectorAll('.tracking-result');
    if (!items.length) return;
    const maxIndex = items.length - 1;
    let nextIndex = state.activeSuggestionIndex + direction;
    if (nextIndex < 0) nextIndex = maxIndex;
    if (nextIndex > maxIndex) nextIndex = 0;
    state.activeSuggestionIndex = nextIndex;
    items[nextIndex].focus();
  };

  const mapArrival = (item) => {
    if (!item) return null;
    const expectedArrival = item.expectedArrival ? new Date(item.expectedArrival) : null;
    const timeToStation = typeof item.timeToStation === 'number' ? item.timeToStation : Number(item.timeToStation);
    return {
      id: item.id || item.vehicleId || '',
      lineName: item.lineName || item.lineId || '',
      destinationName: item.destinationName || item.towards || '',
      towards: item.towards || '',
      platformName: item.platformName || '',
      vehicleId: item.vehicleId || '',
      modeName: normalise(item.modeName),
      expectedArrival,
      expectedTimeText: formatAbsoluteTime(expectedArrival),
      timeToStation: Number.isFinite(timeToStation) ? timeToStation : null
    };
  };

  const sortDepartures = (departures) => {
    return departures.slice().sort((a, b) => {
      const aTime = Number.isFinite(a.timeToStation) ? a.timeToStation : Number.POSITIVE_INFINITY;
      const bTime = Number.isFinite(b.timeToStation) ? b.timeToStation : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    });
  };

  const renderDepartures = (departures, stop) => {
    elements.rows.innerHTML = '';
    if (!Array.isArray(departures) || !departures.length) {
      setBoardMessage('No live departures right now.');
      updateTimestamp(stop);
      return;
    }

    departures.forEach((departure) => {
      const row = document.createElement('div');
      row.className = 'row';

      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = departure.lineName || '—';
      badge.style.background = pickModeColour(departure.modeName);

      const destination = document.createElement('div');
      destination.className = 'dest';

      const primary = document.createElement('b');
      primary.textContent = departure.destinationName || 'Destination TBC';
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

      const eta = document.createElement('div');
      eta.className = 'eta';
      eta.textContent = formatEta(departure.timeToStation);

      row.append(badge, destination, eta);
      elements.rows.appendChild(row);
    });

    updateTimestamp(stop);
    setRefreshEnabled(true);
  };

  const loadArrivals = async (stop, { silent = false } = {}) => {
    if (!stop?.id) return;
    stopRefreshTimer();
    if (!silent) {
      setBoardLoading();
    }

    try {
      const path = `/StopPoint/${encodeURIComponent(stop.id)}/Arrivals`;
      let data = await fetchJson(buildProxyUrl(path), { fallbackUrl: buildTfLUrl(path) });

      if (!Array.isArray(data) || !data.length) {
        const detail = await fetchStopDetail(stop.id);
        if (detail && Array.isArray(detail.children) && detail.children.length) {
          const childRequests = detail.children.map((child) => {
            const childPath = `/StopPoint/${encodeURIComponent(child.id || child.naptanId)}/Arrivals`;
            return fetchJson(buildProxyUrl(childPath), { fallbackUrl: buildTfLUrl(childPath) }).catch(() => []);
          });
          const childData = await Promise.all(childRequests);
          data = childData.flat();
        }
      }

      const departures = Array.isArray(data) ? sortDepartures(data.map(mapArrival).filter(Boolean)) : [];
      if (!departures.length) {
        setBoardMessage('No live departures right now.');
        updateTimestamp(stop);
        setRefreshEnabled(true);
        return;
      }

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

  const selectStop = async (stop) => {
    if (!stop || !stop.id) return;
    hideSuggestions();
    setBoardLoading();

    let enrichedStop = { ...stop };
    if (!enrichedStop.name || enrichedStop.name === enrichedStop.id) {
      const detail = await fetchStopDetail(stop.id);
      if (detail) {
        const suggestion = mapStopToSuggestion(detail, detail);
        if (suggestion) {
          enrichedStop = { ...enrichedStop, ...suggestion };
        }
      }
    }

    state.selectedStop = enrichedStop;
    updateBoardHeader(enrichedStop);
    if (elements.searchInput) {
      const displayName = enrichedStop.indicator
        ? `${enrichedStop.name} (${enrichedStop.indicator})`
        : enrichedStop.name || enrichedStop.id;
      elements.searchInput.value = displayName;
    }

    await loadArrivals(enrichedStop);
  };

  const showSearchingState = () => {
    showSuggestionsMessage('Searching for stops…');
  };

  const searchStops = async (rawQuery) => {
    const trimmed = rawQuery.trim();
    state.searchToken += 1;
    const token = state.searchToken;

    if (STOP_ID_PATTERN.test(trimmed)) {
      hideSuggestions();
      selectStop({ id: trimmed, name: trimmed });
      return [];
    }

    if (normalise(trimmed).length < MIN_QUERY_LENGTH) {
      hideSuggestions();
      return [];
    }

    showSearchingState();

    const searchPath = `/StopPoint/Search/${encodeURIComponent(trimmed)}?modes=${encodeURIComponent(MODES)}&maxResults=20`;
    let response;
    try {
      response = await fetchJson(buildProxyUrl(searchPath), { fallbackUrl: buildTfLUrl(searchPath) });
    } catch (error) {
      console.error('Failed to search for stops:', error);
      if (token === state.searchToken) {
        showSuggestionsMessage('Search failed. Please check your connection.');
      }
      return [];
    }

    if (token !== state.searchToken) {
      return [];
    }

    const matches = Array.isArray(response?.matches) ? response.matches : [];
    if (!matches.length) {
      showSuggestionsMessage('No stops found. Try refining your search.');
      return [];
    }

    const detailTargets = matches
      .map((match) => match.id)
      .filter(Boolean)
      .slice(0, MAX_DETAIL_REQUESTS);

    const detailResults = await Promise.allSettled(detailTargets.map((id) => fetchStopDetail(id)));
    const detailMap = new Map();
    detailResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        detailMap.set(detailTargets[index], result.value);
      }
    });

    const suggestions = prepareSuggestions(trimmed, matches, detailMap).slice(0, MAX_SUGGESTIONS);

    if (token !== state.searchToken) {
      return suggestions;
    }

    state.suggestions = suggestions;
    state.suggestionById = new Map(suggestions.map((suggestion) => [suggestion.id, suggestion]));
    renderSuggestions(suggestions, trimmed);
    return suggestions;
  };

  const handleSubmit = () => {
    const query = elements.searchInput.value.trim();
    if (!query) return;
    if (STOP_ID_PATTERN.test(query)) {
      selectStop({ id: query, name: query });
      return;
    }
    if (state.suggestions.length) {
      selectStop(state.suggestions[0]);
      return;
    }
    searchStops(query).then((results) => {
      if (results.length) {
        selectStop(results[0]);
      }
    });
  };

  const handleInput = () => {
    setSearchButtonState();
    const value = elements.searchInput.value;
    if (normalise(value).length >= MIN_QUERY_LENGTH || STOP_ID_PATTERN.test(value.trim())) {
      debouncedSearch(value);
    } else {
      hideSuggestions();
    }
  };

  const debouncedSearch = debounce(searchStops, SEARCH_DEBOUNCE_MS);

  elements.searchInput.addEventListener('input', handleInput);
  elements.searchInput.addEventListener('focus', () => {
    if (state.suggestions.length) {
      elements.resultsList.style.display = 'block';
    }
  });
  elements.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      handleSuggestionNavigation(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      handleSuggestionNavigation(-1);
    } else if (event.key === 'Enter') {
      if (suggestionsVisible() && state.suggestions.length) {
        event.preventDefault();
        const index = state.activeSuggestionIndex >= 0 ? state.activeSuggestionIndex : 0;
        const choice = state.suggestions[index];
        if (choice) {
          selectStop(choice);
        }
      } else {
        handleSubmit();
      }
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

  if (elements.resultsList) {
    elements.resultsList.addEventListener('click', (event) => {
      const button = event.target.closest('.tracking-result');
      if (!button) return;
      const stop = state.suggestionById.get(button.dataset.stopId);
      if (stop) {
        selectStop(stop);
      }
    });
  }

  document.addEventListener('click', (event) => {
    if (!elements.searchField) return;
    if (!elements.searchField.contains(event.target)) {
      hideSuggestions();
    }
  });

  if (elements.refreshButton) {
    elements.refreshButton.addEventListener('click', () => {
      if (state.selectedStop) {
        loadArrivals(state.selectedStop);
      }
    });
  }

  const bootstrapFromUrl = async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const stopId = params.get('stopId');
      if (stopId) {
        const stopName = params.get('stopName');
        await selectStop({ id: stopId, name: stopName || stopId });
      }
    } catch (error) {
      console.warn('Unable to initialise stop from URL', error);
    }
  };

  setSearchButtonState();
  bootstrapFromUrl();
})();

