(function () {
  const NAVBAR_SOURCE = 'components/navbar.html';
  const AUTH_MODAL_SOURCE = 'components/auth-modal.html';
  const AUTH_SCRIPTS = [
    'config.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js',
    'main.js'
  ];

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

  function ensureDependencies() {
    return AUTH_SCRIPTS.reduce(
      (chain, src) => chain.then(() => ensureScript(src)),
      Promise.resolve()
    );
  }

  function dispatchAuthModalReady(detail = {}) {
    try {
      document.dispatchEvent(new CustomEvent('auth-modal:ready', { detail }));
    } catch (error) {
      console.error('Failed to notify auth modal readiness:', error);
    }
  }

  function ensureAuthModal() {
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

    ensureAuthModal().catch(error => {
      console.error('Failed to load authentication modal:', error);
    });

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
      .then(html => {
        container.innerHTML = html;
        initNavbar(container, dependenciesReady);
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

    window.addEventListener('navbar:close-overlays', () => {
      closeProfileMenus();
      closeDrawer();
    });

    const refreshAuthState = () => {
      if (typeof window.renderDropdown === 'function') {
        const user = window.__lastAuthUser ?? window.firebase?.auth?.currentUser ?? null;
        window.renderDropdown(user);
      }
    };

    if (dependenciesReadyPromise && typeof dependenciesReadyPromise.then === 'function') {
      dependenciesReadyPromise.then(refreshAuthState);
    } else {
      refreshAuthState();
    }

    ensureAuthModal().catch(() => {});

    window.signOut = window.signOut || function () {
      if (window.firebase?.auth) {
        window.firebase.auth().signOut();
      }
    };
    window.openModal = window.openModal || function () {};
  }
})();
