(function initialiseSite() {
  window.__ROUTEFLOW_PUBLIC_MODE__ = true;
  const XP_PROGRESS_KEY = 'routeflow:xp-progress';
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
  const PREFERS_REDUCED_MOTION = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
  const POINTER_QUERY = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: fine)')
    : null;

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

  const readXpProgress = () => {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    try {
      const raw = localStorage.getItem(XP_PROGRESS_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      const level = Number(parsed.level) || 1;
      const progress = Math.min(1, Math.max(0, Number(parsed.progress) || 0));
      return { level, progress };
    } catch (error) {
      console.warn('RouteFlow XP: failed to parse stored progress.', error);
      return null;
    }
  };

  const seedXpProgress = () => {
    const now = new Date();
    const hours = now.getHours();
    const baseline = 0.32 + ((hours % 5) * 0.09);
    return {
      level: 5 + (hours % 4),
      progress: Math.min(1, Math.max(0.18, baseline))
    };
  };

  const writeXpProgress = (value) => {
    if (typeof localStorage === 'undefined') {
      return value;
    }
    try {
      localStorage.setItem(XP_PROGRESS_KEY, JSON.stringify(value));
    } catch (error) {
      console.warn('RouteFlow XP: failed to persist progress.', error);
    }
    return value;
  };

  const ensureXpProgress = () => {
    const stored = readXpProgress();
    if (stored) {
      return stored;
    }
    return writeXpProgress(seedXpProgress());
  };

  const notifyXpProgress = (xp) => {
    try {
      document.dispatchEvent(new CustomEvent('routeflow:xp-update', { detail: xp }));
    } catch (error) {
      console.warn('RouteFlow XP: unable to broadcast update.', error);
    }
  };

  const grantXpForAction = (amount = 0.04) => {
    const current = ensureXpProgress();
    const added = Math.min(1.2, Math.max(0, current.progress + amount));
    const didLevelUp = added >= 1;
    const normalised = didLevelUp ? added - 1 : added;
    const next = writeXpProgress({
      level: didLevelUp ? current.level + 1 : current.level,
      progress: Number(normalised.toFixed(3))
    });
    notifyXpProgress(next);
  };

  const initialiseXp = () => {
    const xp = ensureXpProgress();
    notifyXpProgress(xp);
    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-xp-action]');
      if (!trigger) {
        return;
      }
      const amount = Number(trigger.dataset.xpAction) || 0.05;
      grantXpForAction(amount);
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

  const initScrollState = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    let ticking = false;

    const updateScrollState = () => {
      const scrolled = window.scrollY > 24;
      document.body?.classList.toggle('is-scrolled', scrolled);
      ticking = false;
    };

    updateScrollState();

    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateScrollState);
    }, { passive: true });
  };

  const initRevealObserver = () => {
    if (typeof IntersectionObserver === 'undefined') {
      document.querySelectorAll('[data-reveal]').forEach((node) => {
        node.classList.add('is-visible');
      });
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '0px 0px -10% 0px',
      threshold: 0.2
    });

    document.querySelectorAll('[data-reveal]').forEach((node) => {
      observer.observe(node);
    });
  };

  const onReady = () => {
    ensureMobileStylesheet();
    setCurrentYear();
    initialiseXp();
    ensureAppDock();
    initScrollState();
    initRevealObserver();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
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

  const initialiseAmbientPointer = () => {
    if (PREFERS_REDUCED_MOTION) {
      return;
    }
    if (POINTER_QUERY && typeof POINTER_QUERY.matches === 'boolean' && !POINTER_QUERY.matches) {
      return;
    }

    const root = document.documentElement;
    if (!root) {
      return;
    }

    let rafId = null;
    let pending = null;

    const commit = () => {
      if (!pending) {
        rafId = null;
        return;
      }
      const { x, y, opacity } = pending;
      root.style.setProperty('--pointer-x', `${x}px`);
      root.style.setProperty('--pointer-y', `${y}px`);
      root.style.setProperty('--pointer-opacity', opacity);
      pending = null;
      rafId = null;
    };

    const schedule = (x, y, active) => {
      const opacity = active ? '0.85' : '0';
      pending = { x, y, opacity };
      if (rafId !== null) {
        return;
      }
      rafId = requestAnimationFrame(commit);
    };

    const handleMove = (event) => {
      if (event.pointerType === 'touch') {
        schedule(event.clientX, event.clientY, false);
        return;
      }
      schedule(event.clientX, event.clientY, true);
    };

    const reset = () => {
      const x = window.innerWidth / 2;
      const y = window.innerHeight / 2;
      schedule(x, y, false);
    };

    window.addEventListener('pointermove', handleMove, { passive: true });
    window.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    reset();
  };

  initialiseAmbientPointer();
})();
