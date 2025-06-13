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
1. Navigate to `backend/`
2. Install dependencies:
   ```sh
   pip install -r requirements.txt
   ```
3. Run the API server:
   ```sh
   python api.py
   ```

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
