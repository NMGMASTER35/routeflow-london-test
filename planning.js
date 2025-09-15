// Journey planning logic for Routeflow London

let map;
let journeyLayers = [];

function initMap() {
  if (!map) {
    map = L.map('map').setView([51.505, -0.09], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
  }
}

function drawJourney(journey) {
  initMap();
  journeyLayers.forEach((layer) => map.removeLayer(layer));
  journeyLayers = [];
  const bounds = [];
  if (Array.isArray(journey.legs)) {
    journey.legs.forEach((leg) => {
      if (leg.path && leg.path.lineString) {
        const coords = leg.path.lineString.split(' ').map((p) => {
          const [lng, lat] = p.split(',').map(Number);
          const c = [lat, lng];
          bounds.push(c);
          return c;
        });
        journeyLayers.push(
          L.polyline(coords, { color: '#2979ff' }).addTo(map)
        );
      }
    });
  }
  if (bounds.length) map.fitBounds(bounds);
}

document.getElementById('journey-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const from = document.getElementById('from').value.trim();
  const to = document.getElementById('to').value.trim();
  const resultsDiv = document.getElementById('results');
  const errorDiv = document.getElementById('error');
  const mode = Array.from(
    document.querySelectorAll('input[name="mode"]:checked')
  ).map((cb) => cb.value);
  const accessibility = Array.from(
    document.querySelectorAll('input[name="accessibility"]:checked')
  ).map((cb) => cb.value);
  const walkingSpeed = document.getElementById('walking-speed').value;
  const maxWalking = document.getElementById('max-walking').value;

  resultsDiv.innerHTML = '';
  errorDiv.textContent = '';

  if (!from || !to) {
    errorDiv.textContent = 'Please enter both origin and destination.';
    return;
  }

  try {
    const params = new URLSearchParams();
    if (mode.length) params.append('mode', mode.join(','));
    accessibility.forEach((pref) =>
      params.append('accessibilityPreference', pref)
    );
    if (walkingSpeed) params.append('walkingSpeed', walkingSpeed);
    if (maxWalking) params.append('maxWalkingMinutes', maxWalking);

    let url = `https://api.tfl.gov.uk/Journey/JourneyResults/${encodeURIComponent(from)}/to/${encodeURIComponent(to)}`;
    if (params.toString()) url += `?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('Locations not found.');
      }
      throw new Error('Server returned an error.');
    }

    const data = await res.json();
    if (!data.journeys || data.journeys.length === 0) {
      errorDiv.textContent = 'No journeys found. Try different locations.';
      return;
    }

    data.journeys.forEach((journey, index) => {
      const option = document.createElement('div');
      option.className = 'journey-option';

      const interchanges = Array.isArray(journey.legs)
        ? journey.legs.length - 1
        : 0;
      const header = document.createElement('h3');
      const plural = interchanges === 1 ? '' : 's';
      header.textContent = `Option ${index + 1} – ${journey.duration} mins (${interchanges} interchange${plural})`;
      option.appendChild(header);

      if (Array.isArray(journey.legs)) {
        const legsList = document.createElement('ol');
        journey.legs.forEach((leg) => {
          const li = document.createElement('li');
          const modeName = leg.mode?.name || leg.modeName;
          const departure = leg.departurePoint?.commonName || '';
          const arrival = leg.arrivalPoint?.commonName || '';
          const line =
            leg.routeOptions && leg.routeOptions[0]
              ? ` (${leg.routeOptions[0].name})`
              : '';
          const departTime = leg.departureTime
            ? new Date(leg.departureTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '';
          const arriveTime = leg.arrivalTime
            ? new Date(leg.arrivalTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '';
          const timeStr = departTime && arriveTime ? ` (${departTime}–${arriveTime})` : '';
          li.textContent = `${modeName}${line}: ${departure} → ${arrival}${timeStr}`;
          legsList.appendChild(li);
        });
        option.appendChild(legsList);
      }
      option.addEventListener('click', () => drawJourney(journey));
      resultsDiv.appendChild(option);
    });
    drawJourney(data.journeys[0]);
  } catch (err) {
    errorDiv.textContent = 'Unable to fetch journeys. Please check your search and try again.';
    console.error(err);
  }
});
