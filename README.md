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
2. Navigate to `backend/`
3. Install dependencies:
   ```sh
   pip install -r requirements.txt
   ```
4. Run the API server:
   ```sh
   python api.py
   ```

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
