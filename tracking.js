(function initialiseLiveConsole() {
  const MAP_ID = 'liveMap';
  const AUTO_ADVANCE_MS = 8000;
  const STATUS_UPDATE_MS = 25000;
  const RESULTS_LIMIT = 12;

  const vehicles = [
    {
      id: 'LTZ1234',
      route: '15',
      mode: 'bus',
      operator: 'Go-Ahead',
      registration: 'LTZ1234',
      fleetNumber: 'LT432',
      direction: 'Tower Hill → Trafalgar Square',
      eta: 'Due',
      position: [51.5106, -0.0767],
      history: ['Ludgate Hill', 'St Paul’s Cathedral', 'Bank'],
      nextStops: ['Monument', 'Tower Hill', 'Aldwych']
    },
    {
      id: 'LTZ2045',
      route: '23',
      mode: 'bus',
      operator: 'RATP',
      registration: 'LTZ2045',
      fleetNumber: 'VHR45231',
      direction: 'Paddington → Aldwych',
      eta: '3 min',
      position: [51.5142, -0.1552],
      history: ['Westbourne Terrace', 'Paddington Station'],
      nextStops: ['Marble Arch', 'Oxford Circus', 'Piccadilly Circus']
    },
    {
      id: 'NE012',
      route: 'N8',
      mode: 'night',
      operator: 'Stagecoach',
      registration: 'BX17UYT',
      fleetNumber: '12345',
      direction: 'Oxford Circus → Hainault',
      eta: '6 min',
      position: [51.5155, -0.1412],
      history: ['Tottenham Court Road'],
      nextStops: ['Holborn', 'St Paul’s', 'Liverpool Street']
    },
    {
      id: 'EL345',
      route: 'Elizabeth line',
      mode: 'tube',
      operator: 'TfL Rail',
      registration: 'Unit 345',
      fleetNumber: '345011',
      direction: 'Paddington → Abbey Wood',
      eta: '1 min',
      position: [51.5162, -0.1761],
      history: ['Westbourne Park'],
      nextStops: ['Paddington', 'Bond Street', 'Tottenham Court Road']
    }
  ];

  const mapContainer = document.getElementById(MAP_ID);
  let mapInstance = null;
  const markerById = new Map();
  let currentFilter = 'all';
  let statusTimer = null;
  let advanceTimer = null;

  function initialiseMap() {
    if (!mapContainer || typeof L === 'undefined') {
      return;
    }
    mapInstance = L.map(MAP_ID, {
      zoomControl: false,
      attributionControl: false
    }).setView([51.5074, -0.1278], 12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(mapInstance);

    vehicles.forEach((vehicle) => {
      const icon = L.divIcon({
        className: 'live-marker',
        html: `<span data-route="${vehicle.route}" data-mode="${vehicle.mode}"></span>`
      });
      const marker = L.marker(vehicle.position, { icon }).addTo(mapInstance);
      marker.on('click', () => focusVehicle(vehicle));
      markerById.set(vehicle.id, marker);
    });
  }

  function focusVehicle(vehicle) {
    if (mapInstance) {
      mapInstance.setView(vehicle.position, 14, { animate: true });
    }
    renderDetails([vehicle]);
  }

  function filterVehicles(keyword = '') {
    const value = keyword.trim().toLowerCase();
    return vehicles.filter((vehicle) => {
      if (currentFilter !== 'all' && vehicle.mode !== currentFilter) {
        if (!(currentFilter === 'night' && vehicle.mode === 'night')) {
          return false;
        }
      }
      if (!value) return true;
      return [vehicle.route, vehicle.registration, vehicle.operator, vehicle.direction]
        .join(' ')
        .toLowerCase()
        .includes(value);
    });
  }

  function createDepartureRow(vehicle) {
    const row = document.createElement('article');
    row.className = 'live-board__row';
    row.innerHTML = `
      <header>
        <span class="live-board__badge" data-mode="${vehicle.mode}">${vehicle.route}</span>
        <div>
          <strong>${vehicle.direction}</strong>
          <small>${vehicle.operator}</small>
        </div>
        <span class="live-board__eta">${vehicle.eta}</span>
      </header>
      <div class="live-board__meta">
        <span><i class="fa-solid fa-bus" aria-hidden="true"></i>${vehicle.registration}</span>
        <span><i class="fa-solid fa-id-card" aria-hidden="true"></i>${vehicle.fleetNumber}</span>
      </div>
      <div class="live-board__timeline">
        <div>
          <span>Previous</span>
          <ul>${vehicle.history.map((stop) => `<li>${stop}</li>`).join('')}</ul>
        </div>
        <div>
          <span>Next</span>
          <ul>${vehicle.nextStops.map((stop) => `<li>${stop}</li>`).join('')}</ul>
        </div>
      </div>
    `;
    row.addEventListener('click', () => focusVehicle(vehicle));
    return row;
  }

  function renderDetails(list) {
    const board = document.getElementById('trackingRows');
    if (!board) return;
    board.innerHTML = '';
    if (!list.length) {
      board.innerHTML = '<div class="empty">No services match your filters yet.</div>';
      return;
    }
    list.slice(0, RESULTS_LIMIT).forEach((vehicle) => {
      board.appendChild(createDepartureRow(vehicle));
    });
  }

  function updateStatusTimestamp() {
    const label = document.getElementById('trackingTimestamp');
    if (!label) return;
    const now = new Date();
    label.textContent = `Updated ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  function cycleHighlights() {
    const filtered = filterVehicles(document.getElementById('trackingSearch')?.value || '');
    if (!filtered.length) {
      return;
    }
    const next = filtered[Math.floor(Math.random() * filtered.length)];
    focusVehicle(next);
  }

  function applyFilterButtons() {
    document.querySelectorAll('[data-mode-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        currentFilter = button.dataset.modeFilter || 'all';
        document.querySelectorAll('[data-mode-filter]').forEach((btn) => {
          btn.classList.toggle('is-active', btn === button);
        });
        renderDetails(filterVehicles(document.getElementById('trackingSearch')?.value || ''));
      });
    });
  }

  function initialiseSearch() {
    const input = document.getElementById('trackingSearch');
    const resultsList = document.getElementById('trackingResultsList');
    if (!input || !resultsList) return;

    const updateSuggestions = () => {
      const value = input.value.trim();
      resultsList.innerHTML = '';
      if (value.length < 2) {
        resultsList.classList.remove('is-visible');
        return;
      }
      const matches = filterVehicles(value).slice(0, 5);
      if (!matches.length) {
        resultsList.classList.remove('is-visible');
        return;
      }
      matches.forEach((vehicle) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'live-suggestion';
        option.innerHTML = `<strong>${vehicle.route}</strong><span>${vehicle.direction}</span>`;
        option.addEventListener('click', () => {
          input.value = `${vehicle.route} ${vehicle.registration}`;
          resultsList.classList.remove('is-visible');
          focusVehicle(vehicle);
        });
        resultsList.appendChild(option);
      });
      resultsList.classList.add('is-visible');
    };

    input.addEventListener('input', () => {
      renderDetails(filterVehicles(input.value));
      updateSuggestions();
    });

    input.addEventListener('focus', updateSuggestions);
    const button = document.querySelector('.tracking-search__field button');
    button?.addEventListener('click', () => {
      renderDetails(filterVehicles(input.value));
      resultsList.classList.remove('is-visible');
    });
    document.addEventListener('click', (event) => {
      if (!resultsList.contains(event.target) && event.target !== input) {
        resultsList.classList.remove('is-visible');
      }
    });
  }

  function initialiseTimers() {
    updateStatusTimestamp();
    statusTimer = window.setInterval(updateStatusTimestamp, STATUS_UPDATE_MS);
    advanceTimer = window.setInterval(cycleHighlights, AUTO_ADVANCE_MS);
  }

  function init() {
    initialiseMap();
    renderDetails(filterVehicles());
    applyFilterButtons();
    initialiseSearch();
    initialiseTimers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('beforeunload', () => {
    if (statusTimer) window.clearInterval(statusTimer);
    if (advanceTimer) window.clearInterval(advanceTimer);
  });
})();
