// Journey planning logic for Routeflow London

document.getElementById('journey-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const from = document.getElementById('from').value.trim();
  const to = document.getElementById('to').value.trim();
  const resultsDiv = document.getElementById('results');
  const errorDiv = document.getElementById('error');

  resultsDiv.innerHTML = '';
  errorDiv.textContent = '';

  if (!from || !to) {
    errorDiv.textContent = 'Please enter both origin and destination.';
    return;
  }

  try {
    const url = `https://api.tfl.gov.uk/Journey/JourneyResults/${encodeURIComponent(from)}/to/${encodeURIComponent(to)}`;
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

      const interchanges = journey.legs ? journey.legs.length - 1 : 0;
      const header = document.createElement('h3');
      header.textContent = `Option ${index + 1} – ${journey.duration} mins (${interchanges} interchange${interchanges === 1 ? '' : 's'})`;
      option.appendChild(header);

      const legsList = document.createElement('ol');
      journey.legs.forEach(leg => {
        const li = document.createElement('li');
        const mode = leg.mode?.name || leg.modeName;
        const departure = leg.departurePoint?.commonName || '';
        const arrival = leg.arrivalPoint?.commonName || '';
        const line = leg.routeOptions && leg.routeOptions[0] ? ` (${leg.routeOptions[0].name})` : '';
        li.textContent = `${mode}${line}: ${departure} → ${arrival}`;
        legsList.appendChild(li);
      });
      option.appendChild(legsList);
      resultsDiv.appendChild(option);
    });
  } catch (err) {
    errorDiv.textContent = 'Unable to fetch journeys. Please check your search and try again.';
    console.error(err);
  }
});
