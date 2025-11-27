import React, { useEffect, useMemo, useState } from 'react';

const stats = [
  { label: 'Live lines', value: '34', detail: 'Buses, Tube, DLR & rail' },
  { label: 'Fleet records', value: '9,820', detail: 'Vehicle DNA across London' },
  { label: 'Service alerts', value: '126', detail: 'Refreshed every 30 seconds' },
  { label: 'Community posts', value: '418', detail: 'Stories, tips & analyses' }
];

const heroActions = [
  { label: 'Open live dashboard', href: '#live', primary: true },
  { label: 'Browse fleet index', href: '#fleet', primary: false }
];

const appShortcuts = [
  {
    label: 'Live tracking',
    href: 'tracking.html',
    detail: 'Arrivals, route radar, and nearby alerts.',
    icon: '📡'
  },
  {
    label: 'Plan journeys',
    href: 'planning.html',
    detail: 'Mobile-first planner with milestones and sharing.',
    icon: '🧭'
  },
  {
    label: 'Fleet studio',
    href: 'fleet.html',
    detail: 'Depot health, allocations, and VIN history.',
    icon: '🚌'
  },
  {
    label: 'Stories & info',
    href: 'info.html',
    detail: 'Blog posts, badges, and community updates.',
    icon: '📰'
  },
  {
    label: 'Account & privacy',
    href: 'dashboard.html',
    detail: 'Profile, accessibility, and settings unified.',
    icon: '🔐'
  },
  {
    label: 'Policies',
    href: 'privacy.html',
    detail: 'Terms, privacy, and accessibility shortcuts.',
    icon: '📜'
  }
];

const modules = [
  {
    title: 'Live network',
    description:
      'Precision positioning, headways, and route snapshots powered by TfL APIs with latency-aware refreshes.',
    pill: 'Realtime',
    items: ['Multi-mode overlays', 'Predictive ETAs', 'Crowding signals']
  },
  {
    title: 'Journey studio',
    description:
      'Plan, pin, and replay journeys with level-based milestones and badges for ambitious explorers.',
    pill: 'Gamified',
    items: ['Smart routing', 'Milestones & badges', 'Offline handover']
  },
  {
    title: 'Fleet encyclopedia',
    description:
      'Vehicle histories, allocations, refurbs, and fleet health stitched into one responsive library.',
    pill: 'Deep data',
    items: ['VIN trails', 'Allocation tracker', 'Livery gallery']
  },
  {
    title: 'Signals & stories',
    description:
      'An in-product magazine with operations briefs, enthusiast spotlights, and release timelines.',
    pill: 'Community',
    items: ['Field reports', 'Line breakdowns', 'Weekly drops']
  }
];

const liveRoutes = [
  {
    id: 'route89',
    name: 'Route 89',
    status: 'On time',
    load: 'Moderate',
    next: 'Lewisham Station',
    eta: '2m',
    badge: 'Reliability 94%'
  },
  {
    id: 'route25',
    name: 'Route 25',
    status: 'Minor delays',
    load: 'Busy',
    next: 'Stratford City',
    eta: '5m',
    badge: 'Dynamic headway'
  },
  {
    id: 'jubilee',
    name: 'Jubilee line',
    status: 'Good service',
    load: 'Comfortable',
    next: 'Canada Water',
    eta: '1m',
    badge: 'Auto-bunching guard'
  },
  {
    id: 'elizabeth',
    name: 'Elizabeth line',
    status: 'Planned works',
    load: 'Calm',
    next: 'Tottenham Court Road',
    eta: '3m',
    badge: 'Diversion guidance'
  }
];

const alerts = [
  {
    severity: 'High',
    title: 'North Greenwich congestion',
    detail: 'Event traffic slowing buses and Jubilee line platforms. Dynamic rerouting active.',
    time: 'Updated 1m ago'
  },
  {
    severity: 'Medium',
    title: 'Wembley maintenance',
    detail: 'Overnight works on Chiltern & Bakerloo. Rail replacement showing in trip builder.',
    time: 'Updated 7m ago'
  },
  {
    severity: 'Low',
    title: 'Fleet refresh push',
    detail: '30 new electrics added to the fleet index with allocation maps and VIN lineage.',
    time: 'Updated 15m ago'
  }
];

const achievements = [
  {
    name: 'Urban Explorer',
    progress: 76,
    detail: 'Visit every Zone 1 interchange and log peak/off-peak headways.',
    badge: 'Unlocked'
  },
  {
    name: 'Fleet Archivist',
    progress: 52,
    detail: 'Document 50 unique vehicles with livery notes and passenger comfort ratings.',
    badge: 'In progress'
  },
  {
    name: 'Night Network',
    progress: 34,
    detail: 'Complete 8 night routes with safety markers and share your curated detours.',
    badge: 'Stretch'
  }
];

const posts = [
  {
    title: 'Reading the city through headways',
    tag: 'Ops science',
    read: '6 min read',
    summary:
      'We break down how dynamic headway guardrails keep the Victoria line resilient during surge events.',
    author: 'Ops Lab'
  },
  {
    title: 'Electrics at scale: the next depot upgrade',
    tag: 'Fleet',
    read: '4 min read',
    summary:
      'A look at the newest electric buses, charging choreography, and depot health monitoring.',
    author: 'Fleet Desk'
  },
  {
    title: 'Achievement design that respects commuters',
    tag: 'Product',
    read: '5 min read',
    summary:
      'How RouteFlow London keeps gamification supportive with opt-in journeys and fair play cues.',
    author: 'Product Notes'
  }
];

const plannerSuggestions = [
  {
    name: 'Station to station',
    desc: 'Surface + Underground mix with live escalator statuses and exit heatmaps.',
    chips: ['Fastest', 'Step-free', 'Save as favourite']
  },
  {
    name: 'West End theatre night',
    desc: 'Off-peak routing with crowding guardrails and real-time bus substitutions.',
    chips: ['Night mode', 'Balanced', 'Achievements on']
  },
  {
    name: 'East London loop',
    desc: 'DLR + Elizabeth line loop with side quests to collect fleet stamps.',
    chips: ['Explorer', 'Multi-mode', 'Download pack']
  }
];

const fleetList = [
  {
    code: 'LTE 3912',
    type: 'New Routemaster',
    depot: 'Walworth',
    status: 'In service',
    highlight: 'Hybrid · 2016 refurb · Route 12'
  },
  {
    code: 'EMV 45',
    type: 'Electric Double Deck',
    depot: 'Holloway',
    status: 'Charging',
    highlight: '350kW fast-charge · Route 43'
  },
  {
    code: 'DMO 118',
    type: 'Diesel Mini',
    depot: 'Uxbridge',
    status: 'Service check',
    highlight: 'Depot telemetry online'
  },
  {
    code: 'RFL 020',
    type: 'Rail Replacement',
    depot: 'Willesden',
    status: 'Standby',
    highlight: 'Pre-staged for Sunday closures'
  }
];

const gradients = {
  background:
    'radial-gradient(circle at 20% 20%, rgba(77, 170, 255, 0.2), transparent 25%), radial-gradient(circle at 80% 10%, rgba(255, 84, 112, 0.18), transparent 25%), radial-gradient(circle at 50% 80%, rgba(120, 93, 255, 0.18), transparent 30%)'
};

function Section({ id, title, kicker, children, actions }) {
  return (
    <section id={id} className="section">
      <div className="section-header">
        {kicker && <p className="kicker">{kicker}</p>}
        <div className="section-title-row">
          <h2>{title}</h2>
          {actions}
        </div>
      </div>
      {children}
    </section>
  );
}

function Badge({ children, tone = 'accent' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function App() {
  const [highlightedRoute, setHighlightedRoute] = useState(liveRoutes[0].id);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshState, setRefreshState] = useState('idle');
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setBooting(false), 450);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isDrawerOpen) {
      setIsDrawerOpen(true);
    }
  }, [highlightedRoute, isDrawerOpen]);

  const handleRouteSelect = (routeId) => {
    setHighlightedRoute(routeId);
    setIsModalOpen(true);
  };

  const handleRefresh = () => {
    if (refreshState === 'refreshing') return;
    setRefreshState('refreshing');
    setTimeout(() => setRefreshState('synced'), 520);
    setTimeout(() => setRefreshState('idle'), 1400);
  };

  const closeModal = () => setIsModalOpen(false);

  const selectedRoute = useMemo(
    () => liveRoutes.find((route) => route.id === highlightedRoute),
    [highlightedRoute]
  );

  return (
    <div className="app" style={{ backgroundImage: gradients.background }}>
      {booting && (
        <div className="boot-screen" aria-live="polite">
          <div className="boot-screen__glow" />
          <p className="boot-screen__label">RouteFlow London is loading live signals…</p>
        </div>
      )}

      <div className="floating-nav shell">
        <div className="brand">
          <div className="brand-mark">RF</div>
          <div>
            <p className="eyebrow">RouteFlow London</p>
            <p className="brand-sub">Transport intelligence platform</p>
          </div>
        </div>
        <nav className="floating-nav__links" aria-label="Primary">
          <a href="#live">Live</a>
          <a href="#plan">Plan</a>
          <a href="#fleet">Fleet</a>
          <a href="#alerts">Alerts</a>
          <a href="#stories">Stories</a>
        </nav>
        <div className="floating-nav__actions">
          <a className="ghost" href="dashboard.html">Dashboard</a>
          <a className="primary" href="#live">Launch app</a>
        </div>
      </div>

      <header className="shell hero-wrap">
        <div className="hero">
          <div className="hero-copy">
            <Badge>Powered by TfL APIs</Badge>
            <h1>
              Transport intelligence with <span className="highlight">live flow</span>, gamified
              journeys, and fleet depth.
            </h1>
            <p className="lede">
              RouteFlow London blends live route telemetry, fleet encyclopaedia depth, and
              achievement-driven exploration into a single responsive application. Pin your routes,
              collect milestones, and keep a pulse on the city in one interface.
            </p>
            <div className="actions">
              {heroActions.map((action) => (
                <a
                  key={action.label}
                  className={action.primary ? 'btn primary' : 'btn ghost'}
                  href={action.href}
                >
                  {action.label}
                </a>
              ))}
            </div>
            <div className="refresh-control">
              <button className="ghost" onClick={handleRefresh} aria-live="polite">
                {refreshState === 'refreshing' ? 'Refreshing live data…' : 'Pull to refresh'}
              </button>
              <p className={`refresh-status refresh-${refreshState}`}>
                {refreshState === 'idle' && 'Live arrivals sync automatically every 30 seconds.'}
                {refreshState === 'refreshing' && 'Syncing telemetry, arrivals, and headways…'}
                {refreshState === 'synced' && 'Latest vehicles pinned. Tap a card to open the drawer.'}
              </p>
            </div>
            <div className="hero-stats">
              {stats.map((stat) => (
                <div key={stat.label} className="hero-stat">
                  <p className="hero-stat-value">{stat.value}</p>
                  <p className="hero-stat-label">{stat.label}</p>
                  <p className="hero-stat-detail">{stat.detail}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="hero-panel">
            <div className="panel-title">
              <div>
                <p className="kicker">Live snapshot</p>
                <h3>City flow monitor</h3>
              </div>
              <Badge tone="ghost">Low latency</Badge>
            </div>
            <div className="panel-grid" aria-label="Swipe through live routes" role="list">
              {liveRoutes.map((route) => (
                <button
                  key={route.id}
                  onClick={() => handleRouteSelect(route.id)}
                  className={`panel-card ${highlightedRoute === route.id ? 'panel-card-active' : ''}`}
                  role="listitem"
                >
                  <div className="panel-card-top">
                    <div>
                      <p className="eyebrow">{route.status}</p>
                      <p className="panel-card-title">{route.name}</p>
                    </div>
                    <Badge tone={route.status.includes('delay') || route.status.includes('works') ? 'warn' : 'accent'}>
                      {route.eta}
                    </Badge>
                  </div>
                  <p className="panel-meta">Next stop • {route.next}</p>
                  <p className="panel-meta">Load {route.load}</p>
                  <p className="panel-foot">{route.badge}</p>
                </button>
              ))}
            </div>
            {selectedRoute && (
              <div className="panel-focus">
                <div>
                  <p className="kicker">Pinned focus</p>
                  <h4>{selectedRoute.name}</h4>
                  <p className="panel-meta">{selectedRoute.status} · {selectedRoute.load}</p>
                </div>
                <div className="focus-path">
                  <div className="path-node active">Now</div>
                  <div className="path-line" />
                  <div className="path-node">{selectedRoute.next}</div>
                  <div className="path-line" />
                  <div className="path-node">ETA {selectedRoute.eta}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="shortcut-dock" aria-label="RouteFlow apps">
          {appShortcuts.map((shortcut) => (
            <a key={shortcut.label} className="shortcut-card" href={shortcut.href}>
              <div className="shortcut-icon" aria-hidden="true">{shortcut.icon}</div>
              <div>
                <p className="shortcut-label">{shortcut.label}</p>
                <p className="shortcut-detail">{shortcut.detail}</p>
              </div>
              <span className="shortcut-arrow" aria-hidden="true">→</span>
            </a>
          ))}
        </div>
      </header>

      <main className="shell">
        <Section id="live" title="Live network intelligence" kicker="Realtime overlays">
          <div className="module-grid">
            {modules.map((module) => (
              <div key={module.title} className="card">
                <div className="card-top">
                  <Badge>{module.pill}</Badge>
                  <h3>{module.title}</h3>
                  <p>{module.description}</p>
                </div>
                <div className="chip-row">
                  {module.items.map((item) => (
                    <span key={item} className="chip">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          id="plan"
          title="Journey studio with milestones"
          kicker="Plan, pin, progress"
          actions={<button className="ghost">Open planner</button>}
        >
          <div className="planner">
            <div className="planner-hero">
              <div className="planner-header">
                <div>
                  <p className="eyebrow">Adaptive routing</p>
                  <h3>Resilient routes that follow the city pulse</h3>
                </div>
                <Badge tone="accent">Milestones on</Badge>
              </div>
              <p>
                Build itineraries that adapt to live service changes with reroute hints, headway
                balancing, and clear accessibility cues. Keep progression switched on to collect
                achievements without compromising arrival times.
              </p>
              <div className="planner-grid">
                {plannerSuggestions.map((plan) => (
                  <div key={plan.name} className="planner-card">
                    <div className="planner-card-head">
                      <h4>{plan.name}</h4>
                      <Badge tone="ghost">Suggested</Badge>
                    </div>
                    <p className="planner-desc">{plan.desc}</p>
                    <div className="chip-row">
                      {plan.chips.map((chip) => (
                        <span key={chip} className="chip chip-ghost">
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="planner-sidebar">
              <div className="stacked-card">
                <p className="kicker">Progress</p>
                <h4>Route completion milestones</h4>
                <ul className="progress-list">
                  {achievements.map((achievement) => (
                    <li key={achievement.name}>
                      <div className="progress-row">
                        <div>
                          <p className="progress-title">{achievement.name}</p>
                          <p className="progress-meta">{achievement.detail}</p>
                        </div>
                        <Badge tone="ghost">{achievement.badge}</Badge>
                      </div>
                      <div className="progress-bar">
                        <span style={{ width: `${achievement.progress}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="stacked-card">
                <p className="kicker">Companions</p>
                <h4>Co-traveller safety & sharing</h4>
                <p>
                  Share live traces with trusted contacts and swap to night mode for higher contrast,
                  clearer stop signage, and quick-help actions.
                </p>
                <div className="chip-row">
                  <span className="chip">Night mode</span>
                  <span className="chip">Share trace</span>
                  <span className="chip">Step-free</span>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section
          id="fleet"
          title="Fleet encyclopedia"
          kicker="Vehicles with lineage"
          actions={<button className="ghost">Open index</button>}
        >
          <div className="fleet">
            <div className="fleet-list">
              {fleetList.map((vehicle) => (
                <div key={vehicle.code} className="fleet-card">
                  <div className="fleet-row">
                    <div>
                      <p className="eyebrow">{vehicle.status}</p>
                      <h4>{vehicle.code}</h4>
                    </div>
                    <Badge tone="accent">{vehicle.type}</Badge>
                  </div>
                  <p className="fleet-meta">{vehicle.depot} depot</p>
                  <p className="fleet-meta">{vehicle.highlight}</p>
                </div>
              ))}
            </div>
            <div className="fleet-panel">
              <p className="kicker">Deep dives</p>
              <h3>Depot intelligence + VIN lineage</h3>
              <p>
                Drill into allocations, depot health, energy usage, and refurbishment history. Pair
                with live telemetry to see how vehicles perform against route promises.
              </p>
              <div className="chip-row">
                <span className="chip">Allocation heatmaps</span>
                <span className="chip">Maintenance windows</span>
                <span className="chip">Livery archive</span>
              </div>
            </div>
          </div>
        </Section>

        <Section id="alerts" title="Network signals" kicker="Service awareness">
          <div className="alert-grid">
            {alerts.map((alert) => (
              <div key={alert.title} className={`alert-card alert-${alert.severity.toLowerCase()}`}>
                <div className="alert-head">
                  <Badge tone={alert.severity === 'High' ? 'warn' : 'accent'}>{alert.severity}</Badge>
                  <p className="alert-time">{alert.time}</p>
                </div>
                <h4>{alert.title}</h4>
                <p>{alert.detail}</p>
                <div className="chip-row">
                  <span className="chip chip-ghost">Push</span>
                  <span className="chip chip-ghost">Email</span>
                  <span className="chip chip-ghost">Dashboard</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="stories" title="Signals & stories" kicker="Built-in magazine">
          <div className="post-grid">
            {posts.map((post) => (
              <article key={post.title} className="post-card">
                <div className="post-top">
                  <Badge tone="ghost">{post.tag}</Badge>
                  <p className="post-read">{post.read}</p>
                </div>
                <h3>{post.title}</h3>
                <p>{post.summary}</p>
                <div className="post-footer">
                  <span className="chip">{post.author}</span>
                  <span className="chip chip-ghost">Save</span>
                </div>
              </article>
            ))}
          </div>
        </Section>
      </main>

      {selectedRoute && (
        <aside
          className={`route-drawer ${isDrawerOpen ? 'route-drawer-open' : ''}`}
          aria-label="Route details drawer"
        >
          <div className="route-drawer__handle" aria-hidden="true" />
          <div className="route-drawer__header">
            <div>
              <p className="eyebrow">Sliding drawer</p>
              <h3>{selectedRoute.name}</h3>
              <p className="panel-meta">{selectedRoute.status} · {selectedRoute.load}</p>
            </div>
            <Badge tone="accent">Tap cards to update</Badge>
          </div>
          <div className="route-drawer__body">
            <div className="drawer-line">
              <span>Next stop</span>
              <strong>{selectedRoute.next}</strong>
            </div>
            <div className="drawer-line">
              <span>ETA</span>
              <strong>{selectedRoute.eta}</strong>
            </div>
            <div className="drawer-line">
              <span>Route action</span>
              <a className="chip" href={`tracking.html#${selectedRoute.id}`}>Open in live tracking</a>
            </div>
          </div>
        </aside>
      )}

      {isModalOpen && selectedRoute && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Live vehicle preview">
          <div className="modal__backdrop" onClick={closeModal} />
          <div className="modal__content">
            <header className="modal__header">
              <div>
                <p className="eyebrow">Live vehicle</p>
                <h3>{selectedRoute.name} on the map</h3>
              </div>
              <button className="ghost" type="button" onClick={closeModal} aria-label="Close modal">
                Close
              </button>
            </header>
            <p className="panel-meta">View live vehicle locations and arrivals without leaving the app shell.</p>
            <div className="modal__map">
              <div className="map-line" aria-hidden="true" />
              <div className="map-dot" aria-label="Current vehicle" />
              <div className="map-dot map-dot-secondary" aria-label="Next vehicle" />
            </div>
            <div className="modal__actions">
              <a className="primary" href={`tracking.html#${selectedRoute.id}`}>Open live tracking</a>
              <button className="ghost" type="button" onClick={closeModal}>Keep browsing</button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer shell">
        <div>
          <div className="brand">
            <div className="brand-mark">RF</div>
            <div>
              <p className="eyebrow">RouteFlow London</p>
              <p className="brand-sub">Live transport intelligence</p>
            </div>
          </div>
          <p className="foot-note">
            Crafted for London commuters and enthusiasts. Live data, fleet lineage, progression,
            and storytelling in one application.
          </p>
        </div>
        <div className="foot-links">
          <a href="#live">Network</a>
          <a href="#plan">Journeys</a>
          <a href="#fleet">Fleet</a>
          <a href="#alerts">Alerts</a>
          <a href="#stories">Magazine</a>
        </div>
      </footer>
    </div>
  );
}

export default App;
