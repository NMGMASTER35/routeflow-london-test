# RouteFlow London

A unified platform for tracking, planning, and exploring London transport routes, disruptions, and fleet information.

## Project Structure

- **/tfl-bus-tracker-app/**: React frontend app (TypeScript)
- **/backend/**: Python backend API
- **/*.html**: Standalone static HTML pages
- **/components/navbar.html**: Shared navigation bar
- **/style.css, /withdrawn-table.css**: Stylesheets
- **/images/**: Logos and images

## Setup

### Frontend (React)
1. Navigate to `tfl-bus-tracker-app/`
2. Install dependencies:
   ```sh
   npm install
   ```
3. Start the development server:
   ```sh
   npm start
   ```

### Backend (Python)
1. Copy the example environment file and update it with your secrets:
   ```sh
   cp .env.example .env
   ```
   At a minimum you must provide values for `DATABASE_URL` and `FIREBASE_API_KEY`.
   Provide `TFL_APP_KEY` so that the backend can authenticate outgoing TfL requests
   on behalf of the static pages (routes, disruptions, tracker) without hitting
   anonymous rate limits.
   Optionally provide `TFL_REGISTRATION_ENDPOINTS` (comma or newline separated)
   to extend the automatic fleet sync to other TfL endpoints that expose vehicle
   registrations.
2. Navigate to `backend/`
3. Install dependencies:
   ```sh
   pip install -r requirements.txt
   ```
4. Run the API server:
   ```sh
   python api.py
   ```

#### Fleet database & live tracking

The Flask API now maintains the fleet database directly in Postgres. A Netlify
scheduled function or any external job can stream TfL sightings into
`/api/fleet/sightings` and the backend will:

- Normalise registrations, ensure operators exist, and create/update a single
  row per bus in the `buses` table.
- Append every observation to `bus_sightings` and record lifecycle events in
  `bus_history`.
- Rebuild each vehicle's rolling 90-day `usual_routes` distribution and compute
  live badge state (New Bus, Rare Working, Loan/Guest, Withdrawn) with the
  diversion-aware rare-working rules.

Key endpoints:

- `GET /api/fleet/<reg>` – full bus profile, timeline and sparkline.
- `GET /api/fleet/<reg>/sightings` & `/api/fleet/<reg>/history` – raw data
  streams for charts or moderation.
- `GET /api/fleet/search?q=` – deterministic cursor-friendly search.
- `GET /api/fleet/rare` – current rare workings snapshot.
- `POST /api/fleet/sightings` – idempotent ingestion hook used by the Netlify
  scheduled job.
- `GET /api/operators` and `GET /api/operators/<id>` – operator dashboards.
- `GET/POST /api/edits` plus approve/reject endpoints – moderator overrides for
  badge pinning with full audit history.

#### Automatic live arrivals poller

Set `FLEET_LIVE_TRACKING_ENABLED=true` to start the background poller that keeps
the fleet database in sync with TfL's live arrivals feed. The worker:

- requests the `/Line/Mode/bus` list, then rate-limits concurrent
  `/Line/{lineId}/Arrivals` calls (defaults: 6 threads, 150ms launch delay),
- deduplicates vehicles by `vehicleId`, keeping the newest timestamp per bus,
- upserts each sighting via `record_bus_sighting` so badges, histories and
  `bus_sightings` stay current, and
- exposes the current snapshot at `GET /api/fleet/live`.

Tuning knobs:

- `FLEET_LIVE_TRACKING_INTERVAL_SECONDS` (default `20`)
- `FLEET_LIVE_TRACKING_CONCURRENCY` (default `6`)
- `FLEET_LIVE_TRACKING_LAUNCH_DELAY_MS` (default `150`)
- `FLEET_LIVE_TRACKING_STALE_SECONDS` (default `90`)

Ensure the backend has `TFL_APP_KEY` configured so these requests use your TfL
API credentials rather than hitting anonymous rate limits.

Tables created during `init_database()` include `operators`, `buses`,
`bus_sightings`, `bus_history`, `edit_requests` and `planned_diversions` so the
database is ready for Neon/Render style deployments.

### TfL API proxy endpoints

- The backend exposes a read-only proxy at `/api/tfl/<path>` that forwards
  requests to the official TfL API and injects any configured credentials.
- Set `TFL_APP_KEY` (and optionally `TFL_APP_ID` or `TFL_SUBSCRIPTION_KEY`) in
  your deployment environment so that browser-based pages can call `/api/tfl/...`
  without exposing secrets.

## Deployment

### Free Hosting Recommendations
- **Frontend**: [Vercel](https://vercel.com/) or [Netlify](https://netlify.com/) (free for static/React apps)
- **Backend**: [Render](https://render.com/), [Railway](https://railway.app/), or [Fly.io](https://fly.io/) (all have free Python hosting tiers)

### Deploying Static HTML Pages
- Use GitHub Pages, Netlify, or Vercel for free static hosting.

## Improving Navigation
To avoid duplicating the navbar, use JavaScript to load `components/navbar.html` into each page:

```html
<!-- Add this where you want the navbar to appear -->
<div id="navbar-container"></div>
<script>
  fetch('components/navbar.html')
    .then(res => res.text())
    .then(html => { document.getElementById('navbar-container').innerHTML = html; });
</script>
```

## Contributing
Pull requests are welcome. For major changes, open an issue first to discuss what you would like to change.

## License
[MIT](LICENSE)
