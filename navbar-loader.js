fetch('components/navbar.html')
  .then(res => res.text())
  .then(html => {
    const container = document.getElementById('navbar-container');
    if (!container) return;

    container.innerHTML = html;
    initNavbar(container);
  })
  .catch(err => console.error('Failed to load navbar:', err));

function initNavbar(container) {
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

  if (typeof window.renderDropdown === 'function') {
    const user = window.__lastAuthUser ?? window.firebase?.auth?.currentUser ?? null;
    window.renderDropdown(user);
  }

  window.signOut = window.signOut || function () {
    if (window.firebase?.auth) {
      window.firebase.auth().signOut();
    }
  };
  window.openModal = window.openModal || function () {};
}
