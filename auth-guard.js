(function () {
  'use strict';

  const DEFAULT_LOCK_MESSAGE = 'Sign in to unlock this area.';
  const DEFAULT_ERROR_MESSAGE = 'Authentication is unavailable right now. Please try again later.';

  function getLoginButton(overlay) {
    return overlay ? overlay.querySelector('[data-auth-gate-login]') : null;
  }

  function updateMessage(overlay, meta, options) {
    if (!overlay) return;
    const target = overlay.querySelector('[data-auth-gate-message]');
    if (!target) return;
    if (meta?.message) {
      target.textContent = meta.message;
      return;
    }
    if (meta?.reason === 'auth-missing') {
      target.textContent = options.errorMessage || DEFAULT_ERROR_MESSAGE;
      return;
    }
    target.textContent = options.lockedMessage || DEFAULT_LOCK_MESSAGE;
  }

  function showOverlay(overlay, shouldShow) {
    if (!overlay) return;
    if (shouldShow) {
      overlay.removeAttribute('hidden');
      overlay.setAttribute('aria-hidden', 'false');
    } else {
      overlay.setAttribute('hidden', '');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function toggleLockedState(root, sections, locked, options = {}) {
    const { softLock = false } = options;
    if (root && !softLock) {
      if (locked) {
        root.setAttribute('data-auth-locked', 'true');
      } else {
        root.removeAttribute('data-auth-locked');
      }
    }
    if (Array.isArray(sections)) {
      sections.forEach((section) => {
        if (!section) return;
        if (locked && !softLock) {
          section.setAttribute('data-locked', 'true');
        } else {
          section.removeAttribute('data-locked');
        }
      });
    }
  }

  function ensureLoginHandler(overlay) {
    if (!overlay) return;
    overlay.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-auth-gate-login]');
      if (!trigger) return;
      event.preventDefault();
      if (typeof window.openModal === 'function') {
        window.openModal('login');
      } else {
        window.location.href = 'index.html#login';
      }
    });
  }

  function createAuthGate(options = {}) {
    const root = options.root || document.body;
    const overlay = options.overlay || null;
    const lockedSections = Array.from(options.lockedSections || []);
    const onLock = typeof options.onLock === 'function' ? options.onLock : null;
    const onUnlock = typeof options.onUnlock === 'function' ? options.onUnlock : null;
    const overlayMode = options.overlayMode || 'soft';
    const lockStyle = options.lockStyle || 'soft';

    ensureLoginHandler(overlay);

    let lastState = null;

    const api = {
      lock(meta = {}) {
        if (lastState === true && !meta.force) {
          updateMessage(overlay, meta, options);
          return;
        }
        lastState = true;
        toggleLockedState(root, lockedSections, true, { softLock: lockStyle === 'soft' });
        updateMessage(overlay, meta, options);
        showOverlay(overlay, overlayMode === 'modal');
        const loginButton = getLoginButton(overlay);
        if (loginButton) {
          setTimeout(() => {
            if (typeof loginButton.focus === 'function') {
              loginButton.focus();
            }
          }, 16);
        }
        if (onLock) {
          try {
            onLock(meta);
          } catch (error) {
            console.warn('Auth gate onLock handler failed', error);
          }
        }
      },
      unlock(meta = {}) {
        if (lastState === false && !meta.force) {
          return;
        }
        lastState = false;
        toggleLockedState(root, lockedSections, false, { softLock: lockStyle === 'soft' });
        showOverlay(overlay, false);
        if (onUnlock) {
          try {
            onUnlock(meta.user || meta);
          } catch (error) {
            console.warn('Auth gate onUnlock handler failed', error);
          }
        }
      }
    };

    return api;
  }

  window.RouteflowAuthGate = Object.freeze({
    create: createAuthGate
  });
})();
