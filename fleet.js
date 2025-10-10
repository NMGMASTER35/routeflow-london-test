(function initialiseFleetGrid() {
  const authOverlay = document.getElementById('fleetAuthGate');
  if (authOverlay) {
    authOverlay.remove();
  }
  document.body?.removeAttribute('data-auth-locked');
  document.querySelectorAll('[data-locked]').forEach((section) => {
    section.removeAttribute('data-locked');
    section.removeAttribute('data-lock-label');
  });

  const DATA = [
    {
      id: 'LTZ1234',
      registration: 'LTZ1234',
      fleetNumber: 'LT432',
      operator: 'Go-Ahead London',
      garage: 'River Road',
      status: 'active',
      tags: ['rare'],
      image: 'bus1.jpg',
      vehicleType: 'BYD ADL Enviro400EV',
      chassis: 'Alexander Dennis',
      body: 'Enviro400 City',
      engine: 'Electric',
      history: ['Route 15', 'Route N15', 'Route 23'],
      notes: 'Seen on Tower Hill commemorative wrap in May 2025.'
    },
    {
      id: 'BX17UYT',
      registration: 'BX17UYT',
      fleetNumber: '12345',
      operator: 'Stagecoach London',
      garage: 'Leyton',
      status: 'active',
      tags: ['night'],
      image: 'bus2.jpg',
      vehicleType: 'Alexander Dennis Enviro200 MMC',
      chassis: 'Alexander Dennis',
      body: 'Enviro200 MMC',
      engine: 'Hybrid',
      history: ['Route N8', 'Route 55'],
      notes: 'Night service refit with mood lighting and USB charging.'
    },
    {
      id: 'SN21ABC',
      registration: 'SN21ABC',
      fleetNumber: 'EH221',
      operator: 'Go-Ahead London',
      garage: 'Peckham',
      status: 'new',
      tags: ['electric'],
      image: 'bus3.jpg',
      vehicleType: 'Wright StreetDeck Electroliner',
      chassis: 'Wrightbus',
      body: 'StreetDeck',
      engine: 'Electric',
      history: ['Route 63', 'Route 363'],
      notes: 'Brand-new Electroliner entering service on Route 63 with comfort+ interior.'
    },
    {
      id: 'RML2760',
      registration: 'JJD560D',
      fleetNumber: 'RML2760',
      operator: 'Heritage',
      garage: 'Heritage Fleet',
      status: 'withdrawn',
      tags: ['heritage', 'rare'],
      image: 'bus1.jpg',
      vehicleType: 'AEC Routemaster',
      chassis: 'AEC',
      body: 'Park Royal',
      engine: 'Leyland O.600',
      history: ['Route 15H', 'Heritage events'],
      notes: 'Stored for special workings and events across central London.'
    }
  ];

  const grid = document.getElementById('fleetGrid');
  const searchInput = document.getElementById('fleetSearch');
  const searchButton = document.getElementById('fleetSearchButton');
  const filterButtons = document.querySelectorAll('[data-fleet-filter]');
  const profile = document.getElementById('fleetProfile');
  const closeProfile = document.getElementById('fleetProfileClose');
  const profileTitle = document.getElementById('fleetProfileTitle');
  const profileSubtitle = document.getElementById('fleetProfileSubtitle');
  const profileStatus = document.getElementById('fleetProfileStatus');
  const profileImage = document.getElementById('fleetProfileImage');
  const profileDetails = document.getElementById('fleetProfileDetails');
  const profileHistory = document.getElementById('fleetProfileHistory');
  const profileNotes = document.getElementById('fleetProfileNotes');

  let currentFilter = 'all';

  function badgeTone(status) {
    switch (status) {
      case 'new':
        return 'badge--new';
      case 'withdrawn':
        return 'badge--withdrawn';
      case 'active':
      default:
        return 'badge--active';
    }
  }

  function renderCard(vehicle) {
    const card = document.createElement('article');
    card.className = 'fleet-card';
    card.dataset.fleetId = vehicle.id;
    card.innerHTML = `
      <div class="fleet-card__media">
        <img src="${vehicle.image}" alt="${vehicle.registration}" loading="lazy" />
        <span class="fleet-card__status ${badgeTone(vehicle.status)}">${vehicle.status}</span>
      </div>
      <div class="fleet-card__body">
        <h3>${vehicle.registration}</h3>
        <p>${vehicle.fleetNumber} • ${vehicle.operator}</p>
        <p class="fleet-card__garage">${vehicle.garage}</p>
      </div>
      <button type="button" class="fleet-card__cta" aria-label="View profile for ${vehicle.registration}">View profile</button>
    `;
    card.addEventListener('click', () => openProfile(vehicle));
    return card;
  }

  function renderGrid(list) {
    if (!grid) return;
    grid.innerHTML = '';
    if (!list.length) {
      grid.innerHTML = '<p class="fleet-grid__empty">No vehicles match your filters yet.</p>';
      return;
    }
    list.forEach((vehicle) => grid.appendChild(renderCard(vehicle)));
  }

  function formatDetails(vehicle) {
    const fields = [
      ['Registration', vehicle.registration],
      ['Fleet number', vehicle.fleetNumber],
      ['Operator', vehicle.operator],
      ['Garage', vehicle.garage],
      ['Vehicle', vehicle.vehicleType],
      ['Chassis', vehicle.chassis],
      ['Body', vehicle.body],
      ['Engine', vehicle.engine]
    ];
    profileDetails.innerHTML = fields
      .filter(([, value]) => Boolean(value))
      .map(([label, value]) => `
        <div>
          <dt>${label}</dt>
          <dd>${value}</dd>
        </div>
      `)
      .join('');
  }

  function openProfile(vehicle) {
    profileTitle.textContent = `${vehicle.registration} • ${vehicle.fleetNumber}`;
    profileSubtitle.textContent = `${vehicle.operator} — ${vehicle.garage}`;
    profileStatus.textContent = vehicle.status === 'active' ? 'Active' : vehicle.status;
    profileStatus.className = `fleet-profile__tag ${badgeTone(vehicle.status)}`;
    profileImage.src = vehicle.image;
    profileImage.alt = vehicle.registration;
    formatDetails(vehicle);
    profileHistory.innerHTML = vehicle.history.map((item) => `<li>${item}</li>`).join('');
    profileNotes.textContent = vehicle.notes;
    profile.removeAttribute('aria-hidden');
    profile.dataset.open = 'true';
    document.body.style.overflow = 'hidden';
    document.dispatchEvent(new CustomEvent('routeflow:xp-update', { detail: { level: 9, progress: 0.72 } }));
  }

  function closeProfilePanel() {
    profile.setAttribute('aria-hidden', 'true');
    profile.dataset.open = 'false';
    document.body.style.overflow = '';
  }

  closeProfile?.addEventListener('click', closeProfilePanel);
  profile?.addEventListener('click', (event) => {
    if (event.target === profile) {
      closeProfilePanel();
    }
  });

  function applyFilter(value) {
    currentFilter = value;
    filterButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.fleetFilter === value);
    });
    const query = searchInput?.value || '';
    renderGrid(filterDataset(query));
  }

  function filterDataset(query) {
    const keyword = query.trim().toLowerCase();
    return DATA.filter((vehicle) => {
      if (currentFilter !== 'all') {
        if (currentFilter === 'rare') {
          if (!vehicle.tags.includes('rare')) return false;
        } else if (vehicle.status !== currentFilter) {
          return false;
        }
      }
      if (!keyword) return true;
      return [
        vehicle.registration,
        vehicle.fleetNumber,
        vehicle.operator,
        vehicle.garage,
        vehicle.vehicleType
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }

  const performSearch = () => {
    renderGrid(filterDataset(searchInput?.value || ''));
  };

  searchInput?.addEventListener('input', performSearch);
  searchButton?.addEventListener('click', performSearch);

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      applyFilter(button.dataset.fleetFilter || 'all');
    });
  });

  if (grid) {
    renderGrid(DATA);
  }
})();
