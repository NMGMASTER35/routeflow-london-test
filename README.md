# RouteFlow London · Stack Auth Edition

This repository contains a rebuilt RouteFlow London experience that focuses on Stack Auth sign-in and the new
team-powered admin dashboard. The legacy files have been replaced with a streamlined static site that you can deploy
anywhere, now accompanied by redesigned content pages that tell the full RouteFlow story.

## Features

- **Stack Auth single sign-on** – Email/password, Google, GitHub and Discord provider flows handled in a unified client.
- **Team-scoped admin dashboard** – Only members of the configured Stack team can access admin tools.
- **Glassmorphism UI** – A modern interface built with responsive CSS, ready for mobile and desktop.
- **Multi-page storytelling** – Fresh layouts for routes, fleet, disruptions, passenger info, legal policies and more,
  all sharing the same navigation and visual language.
- **Local-first mock adapter** – The default implementation persists accounts and teams to `localStorage`, making it easy
  to demo or extend without backend dependencies. Swap in a real Stack Auth API adapter when you are ready.

## Project structure

```
index.html            # Marketing page with sign-in/sign-up flows
about.html            # About RouteFlow London mission and teams
routes.html           # Curated route highlights and rare workings
fleet.html            # Active fleet overview with health stats
withdrawn.html        # Heritage stories from the withdrawn archive
withdrawn table.html  # Structured archive table for heritage vehicles
planning.html         # Scenario planning modules
disruptions.html      # Live incident stream and upcoming works
tracking.html         # Control tower style service board
dashboard.html        # On-shift snapshot for signed-in operators
profile.html          # Account overview for Stack Auth users
settings.html         # Notification and theme preferences
info.html             # Passenger information hub
contact.html          # Enquiry form and contact methods
privacy.html          # Privacy notice
terms.html            # Terms of use
password-reset.html   # Stack Auth password recovery entry point
admin.html            # Team management dashboard
style.css             # Global styles shared by every page
stack-auth.js         # StackAuthClient implementation with local mock adapter
app.js                # Shared navigation and auth helpers
admin.js              # Admin dashboard behaviour
```

## Configuration

Both pages include `data-*` attributes on the `<body>` element to configure the Stack Auth client:

- `data-stack-project` – Stack project identifier
- `data-stack-client` – Client identifier for the web app
- `data-stack-team` – Slug for the Stack team that gates admin access
- `data-stack-team-name` – Human readable team name
- `data-stack-team-description` – Optional description used in UI copy

If you want to connect to a live Stack Auth deployment, replace the mock adapter in `stack-auth.js` with a class that
calls your API. The `StackAuthClient` constructor accepts an `adapter` object that exposes the same methods as
`MockStackAuthAdapter`.

## Development

Open `index.html` in your browser to explore the sign-in experience. Use the admin dashboard to manage team members –
changes are persisted in `localStorage`, so refreshing the page will keep your session intact.

To reset the local data, clear the `localStorage` keys that start with `stack-auth:`.

## Deployment

Because everything is static, you can deploy this site to GitHub Pages, Netlify, Vercel or any static hosting platform.
