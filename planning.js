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
      const interchanges = journey.legs ? journey.legs.length - 1 : 0;
      option.textContent = `Option ${index + 1}: ${journey.duration} mins, ${interchanges} interchange${interchanges === 1 ? '' : 's'}`;
      resultsDiv.appendChild(option);
    });
  } catch (err) {
    errorDiv.textContent = 'Unable to fetch journeys. Please check your search and try again.';
    console.error(err);
  }
});
