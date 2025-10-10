(function () {
  const NAVBAR_SOURCE = 'components/navbar.html';
  const AUTH_MODAL_SOURCE = 'components/auth-modal.html';
  const PUBLIC_MODE = window.__ROUTEFLOW_PUBLIC_MODE__ !== false;
  const AUTH_SCRIPTS = PUBLIC_MODE
    ? ['config.js', 'main.js']
    : ['config.js', 'stack-auth.js', 'main.js'];

  const stylesheetPromises = new Map();

  const LAST_USER_SUMMARY_KEY = 'routeflow:auth:last-user';
  const XP_PROGRESS_KEY = 'routeflow:xp-progress';

  const scriptPromises = new Map();
  let authModalLoaded = false;
  let authModalPromise = null;

  const toAbsoluteUrl = (src) => new URL(src, document.baseURI).href;

  function ensureScript(src) {
    const absolute = toAbsoluteUrl(src);
    if (Array.from(document.scripts).some(script => script.src === absolute)) {
      return Promise.resolve();
    }
    if (scriptPromises.has(absolute)) {
      return scriptPromises.get(absolute);
    }
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
    scriptPromises.set(absolute, promise);
    return promise;
  }

  function ensureStylesheet(href) {
    if (!href) {
      return Promise.resolve();
    }
    const absolute = toAbsoluteUrl(href);
    const existingLink = Array.from(document.querySelectorAll('link[rel~="stylesheet"]'))
      .find(link => link.href === absolute);
    if (existingLink) {
      return Promise.resolve();
    }
    if (stylesheetPromises.has(absolute)) {
      return stylesheetPromises.get(absolute);
    }
    const promise = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Failed to load stylesheet: ${href}`));
      document.head.appendChild(link);
    });
    stylesheetPromises.set(absolute, promise);
    return promise;
  }

  function ensureDependencies() {
    return AUTH_SCRIPTS.reduce(
      (chain, src) => chain.then(() => ensureScript(src)),
      Promise.resolve()
    );
  }

  function readStoredUserSummary() {
    if (PUBLIC_MODE) {
      return {
        displayName: 'Guest Explorer',
        providerId: 'public',
        uid: 'public-guest',
        timestamp: Date.now()
      };
    }
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(LAST_USER_SUMMARY_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      console.warn('RouteFlow navbar: failed to parse cached auth summary.', error);
      return null;
    }
  }

  function applySummaryToNavbar(navRoot, summary) {
    if (!navRoot) return;
    const email = typeof summary?.email === 'string' ? summary.email.trim() : '';
    const preferredName = summary?.displayName?.trim();
    const fallbackName = email ? email.split('@')[0] : '';
    const rawName = preferredName || fallbackName;
    const displayName = rawName || 'Explorer';
    const greeting = `Welcome, ${displayName}`;

    navRoot.querySelectorAll('[data-profile-label]').forEach((label) => {
      label.textContent = greeting;
    });

    navRoot.querySelectorAll('[data-profile-name]').forEach((label) => {
      label.textContent = greeting;
    });

    navRoot.querySelectorAll('[data-profile-email]').forEach((emailEl) => {
      if (!emailEl) return;
      if (summary?.email && summary.email !== displayName) {
        emailEl.textContent = summary.email;
        emailEl.removeAttribute('hidden');
        emailEl.setAttribute('aria-hidden', 'false');
      } else {
        emailEl.textContent = '';
        emailEl.setAttribute('hidden', '');
        emailEl.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function readXpProgress() {
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
      console.warn('RouteFlow navbar: failed to parse XP progress.', error);
      return null;
    }
  }

  function deriveXpFallback() {
    const now = new Date();
    const seed = now.getDate() + now.getMonth();
    const progress = ((seed % 7) + 3) / 10;
    return {
      level: 5 + (seed % 3),
      progress: Math.min(1, Math.max(0, progress))
    };
  }

  function applyXpProgress(navRoot, override) {
    if (!navRoot) return;
    const xp = override || readXpProgress() || deriveXpFallback();
    const progress = Math.min(1, Math.max(0, Number(xp?.progress) || 0));
    const level = Math.max(1, Number(xp?.level) || 1);

    navRoot.querySelectorAll('[data-xp-label]').forEach((label) => {
      label.textContent = `Level ${level}`;
    });

    navRoot.querySelectorAll('[data-xp-fill]').forEach((fill) => {
      if (!fill) return;
      fill.style.setProperty('--xp-progress', progress.toFixed(4));
      const meter = fill.closest('[role="meter"]');
      if (meter) {
        meter.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
      }
    });
  }

  function deriveSummaryFromAuth(user, summary) {
    if (summary && typeof summary === 'object') {
      return summary;
    }
    if (!user) {
      return null;
    }
    const email = typeof user.email === 'string' ? user.email : null;
    const displayName = typeof user.displayName === 'string' && user.displayName
      ? user.displayName
      : (email || 'Account');
    return {
      uid: user.uid || null,
      email,
      displayName,
      providerId: user.providerId || null,
      timestamp: Date.now()
    };
  }

  function dispatchAuthModalReady(detail = {}) {
    try {
      document.dispatchEvent(new CustomEvent('auth-modal:ready', { detail }));
    } catch (error) {
      console.error('Failed to notify auth modal readiness:', error);
    }
  }

  function ensureAuthModal() {
    if (PUBLIC_MODE) {
      authModalLoaded = true;
      dispatchAuthModalReady({ source: 'disabled' });
      return Promise.resolve();
    }
    const existingModal = document.getElementById('authModal');
    if (existingModal) {
      authModalLoaded = true;
      dispatchAuthModalReady({ source: 'existing' });
      return Promise.resolve();
    }
    if (authModalLoaded) {
      authModalLoaded = false;
    }
    if (authModalPromise) {
      return authModalPromise;
    }
    authModalPromise = fetch(AUTH_MODAL_SOURCE)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load authentication modal (${response.status})`);
        }
        return response.text();
      })
      .then(html => {
        const template = document.createElement('template');
        template.innerHTML = html.trim();
        document.body.appendChild(template.content);
        authModalLoaded = true;
        dispatchAuthModalReady({ source: 'fetched' });
      })
      .finally(() => {
        authModalPromise = null;
      });
    return authModalPromise;
  }

  function bootstrapNavbar() {
    const dependenciesReady = ensureDependencies().catch(error => {
      console.error('Failed to load authentication scripts:', error);
    });

    if (!PUBLIC_MODE) {
      ensureAuthModal().catch(error => {
        console.error('Failed to load authentication modal:', error);
      });
    } else {
      authModalLoaded = true;
    }

    let container = document.getElementById('navbar-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'navbar-container';
      document.body.insertBefore(container, document.body.firstChild);
    }

    document.querySelectorAll('header.navbar, nav.navbar').forEach(el => el.remove());
    document.getElementById('authModal')?.remove();
    document.querySelector('.mobile-drawer')?.remove();
    document.querySelector('.drawer-backdrop')?.remove();

    fetch(NAVBAR_SOURCE)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load navbar (${response.status})`);
        }
        return response.text();
      })
      .then((html) => {
        const template = document.createElement('template');
        template.innerHTML = html;

        const links = Array.from(template.content.querySelectorAll('link[rel~="stylesheet"]'));
        const stylesheetLoads = links.map((link) => {
          const href = link.getAttribute('href') || link.href;
          link.remove();
          return { href, promise: ensureStylesheet(href) };
        });

        return Promise.allSettled(stylesheetLoads.map(item => item.promise))
          .then((results) => {
            results.forEach((result, index) => {
              if (result.status === 'rejected') {
                console.error('Failed to load navbar stylesheet:', stylesheetLoads[index].href, result.reason);
              }
            });
          })
          .finally(() => {
            const fragment = document.createDocumentFragment();
            fragment.appendChild(template.content);
            container.innerHTML = '';
            container.appendChild(fragment);
            initNavbar(container, dependenciesReady);
          });
      })
      .catch(error => {
        console.error('Failed to load navbar:', error);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapNavbar);
  } else {
    bootstrapNavbar();
  }

  function initNavbar(container, dependenciesReadyPromise = Promise.resolve()) {
    const navRoot = container.querySelector('.navbar');
    if (!navRoot) return;

    const stateStore = container;
    if (stateStore.__navbarAuthEventHandler) {
      document.removeEventListener('routeflow:auth-state', stateStore.__navbarAuthEventHandler);
      stateStore.__navbarAuthEventHandler = null;
    }
    if (typeof stateStore.__navbarAuthUnsubscribe === 'function') {
      try {
        stateStore.__navbarAuthUnsubscribe();
      } catch (error) {
        console.warn('RouteFlow navbar: failed to clean up previous auth subscription.', error);
      }
      stateStore.__navbarAuthUnsubscribe = null;
    }

    applySummaryToNavbar(navRoot, readStoredUserSummary());

    const toggleButton = navRoot.querySelector('#navbarToggle');
    const drawer = navRoot.querySelector('#navbarDrawer');
    const drawerClose = navRoot.querySelector('#navbarDrawerClose');
    const backdrop = navRoot.querySelector('#navbarBackdrop');

    const lockScroll = (shouldLock) => {
      document.body.style.overflow = shouldLock ? 'hidden' : '';
    };

    const setDrawerOpen = (open) => {
      if (!drawer || !toggleButton || !backdrop) return;
      const wasOpen = drawer.getAttribute('data-open') === 'true';
      toggleButton.setAttribute('aria-expanded', String(open));
      drawer.setAttribute('data-open', String(open));
      drawer.setAttribute('aria-hidden', String(!open));
      backdrop.setAttribute('data-visible', String(open));
      lockScroll(open);
      if (open) {
        drawer.focus({ preventScroll: true });
      } else if (wasOpen) {
        toggleButton?.focus({ preventScroll: true });
      }
    };

    const closeDrawer = () => setDrawerOpen(false);

    toggleButton?.addEventListener('click', () => {
      const expanded = toggleButton.getAttribute('aria-expanded') === 'true';
      setDrawerOpen(!expanded);
    });

    drawerClose?.addEventListener('click', closeDrawer);
    backdrop?.addEventListener('click', closeDrawer);

    const closeProfileMenus = () => {
      navRoot.querySelectorAll('[data-profile-toggle]').forEach(btn => {
        btn.setAttribute('aria-expanded', 'false');
      });
      navRoot.querySelectorAll('[data-profile-menu]').forEach(menu => {
        menu.setAttribute('data-open', 'false');
        menu.setAttribute('aria-hidden', 'true');
        menu.setAttribute('hidden', '');
      });
    };

    const openProfileMenu = (menu) => {
      menu.setAttribute('data-open', 'true');
      menu.setAttribute('aria-hidden', 'false');
      menu.removeAttribute('hidden');
    };

    navRoot.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-profile-toggle]');
      if (!toggle) return;
      event.preventDefault();
      const profile = toggle.closest('[data-auth-state="signed-in"]');
      const menu = profile?.querySelector('[data-profile-menu]');
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      closeProfileMenus();
      if (!isExpanded && menu) {
        toggle.setAttribute('aria-expanded', 'true');
        openProfileMenu(menu);
      }
    });

    document.addEventListener('click', (event) => {
      if (!navRoot.contains(event.target)) {
        closeProfileMenus();
      }
    });

    navRoot.addEventListener('focusout', (event) => {
      if (!navRoot.contains(event.relatedTarget)) {
        closeProfileMenus();
      }
    });

    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      closeProfileMenus();
      closeDrawer();
    };

    document.addEventListener('keydown', handleEscape);

    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    navRoot.querySelectorAll('[data-nav-link]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href) return;
      const linkPath = href.split('/').pop();
      const isActive = linkPath === currentPath;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    navRoot.addEventListener('click', (event) => {
      const drawerLink = event.target.closest('.navbar__drawer-link');
      if (drawerLink) {
        closeDrawer();
      }
    });

    navRoot.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-auth-action]');
      if (!trigger) return;
      const action = trigger.dataset.authAction;
      if (!action) return;
      event.preventDefault();
      closeProfileMenus();
      closeDrawer();
      trigger.dispatchEvent(new CustomEvent('navbar:auth-action', {
        bubbles: true,
        detail: { action }
      }));
    });

    navRoot.addEventListener('click', (event) => {
      const quickLink = event.target.closest('[data-profile-nav]');
      if (!quickLink) return;
      closeProfileMenus();
      closeDrawer();
    });

    window.addEventListener('navbar:close-overlays', () => {
      closeProfileMenus();
      closeDrawer();
    });

    window.addEventListener('storage', (event) => {
      if (event.key === LAST_USER_SUMMARY_KEY) {
        applySummaryToNavbar(navRoot, readStoredUserSummary());
      }
      if (event.key === XP_PROGRESS_KEY) {
        applyXpProgress(navRoot);
      }
    });

    window.addEventListener('routeflow:xp-update', (event) => {
      if (!event?.detail) {
        applyXpProgress(navRoot);
        return;
      }
      applyXpProgress(navRoot, event.detail);
    });

    const refreshAuthState = () => {
      if (typeof window.renderDropdown === 'function') {
        const routeflowAuth = window.RouteflowAuth;
        const user = window.__lastAuthUser
          ?? (routeflowAuth && typeof routeflowAuth.getCurrentUser === 'function'
            ? routeflowAuth.getCurrentUser()
            : null);
        window.renderDropdown(user);
      }
    };

    if (dependenciesReadyPromise && typeof dependenciesReadyPromise.then === 'function') {
      dependenciesReadyPromise
        .then(() => {
          refreshAuthState();
          const routeflowAuth = window.RouteflowAuth;
          const applyFromApi = () => {
            const api = window.RouteflowAuth;
            if (!api) return;
            const summary = (typeof api.getLastKnownSummary === 'function'
              ? api.getLastKnownSummary()
              : (typeof api.getStoredSummary === 'function' ? api.getStoredSummary() : null))
              || null;
            if (summary) {
              applySummaryToNavbar(navRoot, summary);
            }
          };
          const subscribe = () => {
            const api = window.RouteflowAuth;
            if (!api?.subscribe || typeof stateStore.__navbarAuthUnsubscribe === 'function') {
              return;
            }
            try {
              const unsubscribe = api.subscribe((user, summary) => {
                const nextSummary = (typeof api.getLastKnownSummary === 'function'
                  ? api.getLastKnownSummary()
                  : deriveSummaryFromAuth(user, summary));
                applySummaryToNavbar(navRoot, nextSummary);
              });
              if (typeof unsubscribe === 'function') {
                stateStore.__navbarAuthUnsubscribe = () => {
                  try {
                    unsubscribe();
                  } catch (error) {
                    console.warn('RouteFlow navbar: failed to remove auth subscription.', error);
                  } finally {
                    stateStore.__navbarAuthUnsubscribe = null;
                  }
                };
              }
            } catch (error) {
              console.warn('RouteFlow navbar: failed to subscribe to RouteflowAuth updates.', error);
            }
          };
          applyFromApi();
          subscribe();
          if (routeflowAuth?.ready && typeof routeflowAuth.ready.then === 'function') {
            routeflowAuth.ready
              .then(() => {
                applyFromApi();
                subscribe();
              })
              .catch(() => {
                subscribe();
              });
          } else {
            subscribe();
          }
        })
        .catch((error) => {
          console.warn('RouteFlow navbar: failed to synchronise auth state.', error);
        });
    } else {
      refreshAuthState();
    }

    ensureAuthModal().catch(() => {});

    applyXpProgress(navRoot);

    document.dispatchEvent(new CustomEvent('routeflow:navbar-ready', {
      detail: { root: navRoot }
    }));

    const handleAuthEvent = (event) => {
      const detail = event?.detail || {};
      const summary = detail.summary
        || deriveSummaryFromAuth(detail.user, detail.user?.summary)
        || null;
      if (summary || detail.state === 'signed-out') {
        applySummaryToNavbar(navRoot, summary);
      }
    };
    document.addEventListener('routeflow:auth-state', handleAuthEvent);
    stateStore.__navbarAuthEventHandler = handleAuthEvent;

    window.signOut = window.signOut || function () {
      const routeflowAuth = window.RouteflowAuth;
      const ensure = routeflowAuth?.ensure || window.ensureFirebaseAuth;
      if (typeof ensure === 'function') {
        ensure()
          .then((authInstance) => {
            if (authInstance?.signOut) {
              return authInstance.signOut();
            }
            return null;
          })
          .catch((error) => {
            console.error('RouteFlow navbar: failed to sign out via ensure helper.', error);
          });
        return;
      }
      if (routeflowAuth?.ensure) {
        try {
          const maybePromise = routeflowAuth.ensure();
          const handleInstance = (authInstance) => {
            if (authInstance?.signOut) {
              Promise.resolve(authInstance.signOut()).catch((error) => {
                console.error('RouteFlow navbar: failed to sign out via RouteflowAuth instance.', error);
              });
            }
          };
          if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.then(handleInstance).catch((error) => {
              console.error('RouteFlow navbar: async sign-out fallback failed.', error);
            });
          } else {
            handleInstance(maybePromise);
          }
        } catch (error) {
          console.error('RouteFlow navbar: sign-out fallback failed.', error);
        }
      }
    };
    window.openModal = window.openModal || function () {};
  }
})();
