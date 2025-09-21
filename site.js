(function initialiseSite() {
  const MOBILE_STYLESHEET_ID = 'routeflow-mobile-shell';
  const APP_DOCK_ID = 'routeflow-app-dock';
  const APP_DOCK_ITEMS = [
    {
      href: 'index.html',
      label: 'Home',
      icon: 'fa-solid fa-house',
      matches: ['index.html', 'about.html', 'contact.html']
    },
    {
      href: 'tracking.html',
      label: 'Live',
      icon: 'fa-solid fa-wifi',
      matches: ['tracking.html', 'disruptions.html']
    },
    {
      href: 'planning.html',
      label: 'Plan',
      icon: 'fa-solid fa-route',
      matches: ['planning.html']
    },
    {
      href: 'dashboard.html',
      label: 'Account',
      icon: 'fa-solid fa-circle-user',
      matches: ['dashboard.html', 'profile.html', 'settings.html', 'admin.html', 'privacy.html', 'terms.html', 'password-reset.html']
    }
  ];

  let appDockInitialised = false;

  const MOBILE_DOCK_QUERY = window.matchMedia('(max-width: 900px)');

  const ensureMobileStylesheet = () => {
    if (document.getElementById(MOBILE_STYLESHEET_ID)) {
      return;
    }
    const link = document.createElement('link');
    link.id = MOBILE_STYLESHEET_ID;
    link.rel = 'stylesheet';
    link.href = 'mobile-app.css';
    link.media = 'screen and (max-width: 900px)';
    document.head.appendChild(link);
  };

  const setCurrentYear = () => {
    const year = new Date().getFullYear();
    document.querySelectorAll('[data-current-year]').forEach((node) => {
      node.textContent = year;
    });
  };

  const normalisePath = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    return decodeURIComponent(value.trim().toLowerCase());
  };

  const currentPageName = () => {
    const path = window.location?.pathname || '';
    const segments = path.split('/').filter(Boolean);
    const last = segments.pop();
    if (!last) {
      return 'index.html';
    }
    return normalisePath(last);
  };

  const buildDock = () => {
    if (!document.body) {
      return null;
    }

    const nav = document.createElement('nav');
    nav.id = APP_DOCK_ID;
    nav.className = 'app-dock';
    nav.setAttribute('aria-label', 'RouteFlow quick navigation');
    nav.dataset.appDock = 'true';

    const list = document.createElement('ul');
    list.className = 'app-dock__list';
    list.setAttribute('role', 'list');

    APP_DOCK_ITEMS.forEach((item) => {
      const matches = Array.isArray(item.matches) && item.matches.length
        ? item.matches
        : [item.href];
      const normalisedMatches = Array.from(new Set(matches
        .map((match) => {
          const segment = (match || '').toString().split('/').pop() || match;
          return normalisePath(segment);
        })
        .filter(Boolean)));

      const listItem = document.createElement('li');
      listItem.className = 'app-dock__item';

      const link = document.createElement('a');
      link.className = 'app-dock__link';
      link.href = item.href;
      link.setAttribute('aria-label', item.label);
      link.setAttribute('data-app-dock-link', item.href);
      link.dataset.appDockMatches = normalisedMatches.join(',');

      const iconWrapper = document.createElement('span');
      iconWrapper.className = 'app-dock__icon';
      if (item.icon) {
        const icon = document.createElement('i');
        icon.className = item.icon;
        icon.setAttribute('aria-hidden', 'true');
        iconWrapper.appendChild(icon);
      }

      const label = document.createElement('span');
      label.className = 'app-dock__label';
      label.textContent = item.label;

      link.append(iconWrapper, label);
      listItem.appendChild(link);
      list.appendChild(listItem);
    });

    nav.appendChild(list);
    nav.style.setProperty('--app-dock-count', String(APP_DOCK_ITEMS.length));
    return nav;
  };

  const updateDockActiveState = (dock) => {
    if (!dock) {
      return;
    }
    const current = currentPageName();
    dock.querySelectorAll('[data-app-dock-link]').forEach((link) => {
      const matches = (link.dataset.appDockMatches || '')
        .split(',')
        .map((value) => normalisePath(value))
        .filter(Boolean);
      if (!matches.length) {
        const fallback = normalisePath((link.getAttribute('href') || '').split('/').pop() || '');
        if (fallback) {
          matches.push(fallback);
        }
      }
      const isActive = matches.includes(current);
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };

  const ensureAppDock = () => {
    if (!document.body) {
      return;
    }

    const prefersMobileDock = MOBILE_DOCK_QUERY.matches;

    if (!prefersMobileDock) {
      const existing = document.getElementById(APP_DOCK_ID);
      if (existing) {
        existing.remove();
      }
      delete document.body.dataset.hasAppDock;
      return;
    }

    if (document.body.dataset.disableAppDock === 'true') {
      const existing = document.getElementById(APP_DOCK_ID);
      if (existing) {
        existing.remove();
      }
      delete document.body.dataset.hasAppDock;
      return;
    }

    let dock = document.getElementById(APP_DOCK_ID);
    let created = false;

    if (!dock) {
      dock = buildDock();
      if (!dock) {
        return;
      }
      document.body.appendChild(dock);
      created = true;
    }

    document.body.dataset.hasAppDock = 'true';
    dock.style.setProperty('--app-dock-count', String(APP_DOCK_ITEMS.length));
    updateDockActiveState(dock);

    if (created && !appDockInitialised) {
      appDockInitialised = true;
      try {
        document.dispatchEvent(new CustomEvent('routeflow:app-dock-ready', { detail: { dock } }));
      } catch (error) {
        console.warn('RouteFlow site: failed to announce app dock readiness.', error);
      }
    }
  };

  const handleLocationChange = () => {
    const dock = document.getElementById(APP_DOCK_ID);
    if (!dock) {
      ensureAppDock();
      return;
    }
    updateDockActiveState(dock);
  };

  ensureMobileStylesheet();
  ensureAppDock();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureMobileStylesheet();
      setCurrentYear();
      ensureAppDock();
    }, { once: true });
  } else {
    setCurrentYear();
    ensureAppDock();
  }

  window.addEventListener('hashchange', handleLocationChange);
  window.addEventListener('popstate', handleLocationChange);
  document.addEventListener('routeflow:page-changed', handleLocationChange);

  const handleViewportChange = () => {
    ensureAppDock();
  };

  if (typeof MOBILE_DOCK_QUERY.addEventListener === 'function') {
    MOBILE_DOCK_QUERY.addEventListener('change', handleViewportChange);
  } else if (typeof MOBILE_DOCK_QUERY.addListener === 'function') {
    MOBILE_DOCK_QUERY.addListener(handleViewportChange);
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-app-dock-link]');
    if (!link) {
      return;
    }
    const dock = document.getElementById(APP_DOCK_ID);
    if (!dock) {
      return;
    }
    requestAnimationFrame(() => updateDockActiveState(dock));
  });
})();
