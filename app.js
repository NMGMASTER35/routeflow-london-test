(function () {
  'use strict';

  const qs = (selector) => document.querySelector(selector);
  const qsa = (selector) => Array.from(document.querySelectorAll(selector));

  const html = {
    authPanel: qs('#authPanel'),
    authTabs: qsa('[data-auth-tab]'),
    signInForm: qs('#signInForm'),
    signUpForm: qs('#signUpForm'),
    providerButtons: qsa('[data-provider]'),
    signOutButtons: qsa('[data-action="signout"]'),
    profileSummary: qs('#profileSummary'),
    profileName: qs('#profileName'),
    profileEmail: qs('#profileEmail'),
    profileTeam: qs('#profileTeam'),
    authMessage: qs('#authMessage'),
    teamBanner: qs('#teamBanner'),
    teamCta: qs('#teamCta'),
    onboardingChecklist: qs('#onboardingChecklist'),
    sessionGuard: qs('[data-session-guard]'),
    nav: qs('#primaryNav'),
    navToggle: qs('.site-nav__toggle')
  };

  if (html.nav && html.navToggle) {
    const closeNav = () => {
      html.nav.dataset.open = 'false';
      html.navToggle.setAttribute('aria-expanded', 'false');
    };
    const openNav = () => {
      html.nav.dataset.open = 'true';
      html.navToggle.setAttribute('aria-expanded', 'true');
    };
    const syncNavToViewport = () => {
      if (window.innerWidth > 720) {
        openNav();
      } else {
        closeNav();
      }
    };
    html.navToggle.addEventListener('click', () => {
      const isOpen = html.nav.dataset.open === 'true';
      if (isOpen) {
        closeNav();
      } else {
        openNav();
      }
    });
    html.nav.addEventListener('click', (event) => {
      if (event.target.closest('a') || event.target.dataset.action === 'signout') {
        if (window.innerWidth <= 720) {
          closeNav();
        }
      }
    });
    window.addEventListener('resize', syncNavToViewport);
    syncNavToViewport();
  }

  const config = (() => {
    const root = document.body;
    return {
      projectId: root.dataset.stackProject || 'routeflow-demo',
      clientId: root.dataset.stackClient || 'web',
      teamSlug: root.dataset.stackTeam || 'routeflow-admins',
      teamName: root.dataset.stackTeamName || 'RouteFlow Admins',
      teamDescription: root.dataset.stackTeamDescription || 'Trusted operators who manage the RouteFlow platform.'
    };
  })();

  const client = new StackAuth.StackAuthClient(config);

  const state = {
    session: client.activeSession,
    activeTab: 'signin'
  };

  const setTab = (tab) => {
    state.activeTab = tab;
    html.authTabs.forEach((tabButton) => {
      const isActive = tabButton.dataset.authTab === tab;
      tabButton.classList.toggle('auth-tabs__button--active', isActive);
    });
    if (html.signInForm && html.signUpForm) {
      html.signInForm.toggleAttribute('hidden', tab !== 'signin');
      html.signUpForm.toggleAttribute('hidden', tab !== 'signup');
    }
  };

  const setAuthMessage = (message, type = 'info') => {
    if (!html.authMessage) return;
    if (!message) {
      html.authMessage.textContent = '';
      html.authMessage.className = 'auth-message';
      html.authMessage.hidden = true;
      return;
    }
    html.authMessage.textContent = message;
    html.authMessage.className = `auth-message auth-message--${type}`;
    html.authMessage.hidden = false;
  };

  const renderSession = (session) => {
    const isSignedIn = !!session;
    document.body.classList.toggle('is-signed-in', isSignedIn);
    document.body.classList.toggle('is-signed-out', !isSignedIn);

    html.signOutButtons.forEach((button) => {
      button.hidden = !isSignedIn;
    });

    if (html.profileSummary) {
      html.profileSummary.hidden = !isSignedIn;
    }
    if (html.sessionGuard) {
      html.sessionGuard.hidden = !isSignedIn;
    }

    html.authPanel?.toggleAttribute('hidden', isSignedIn);

    if (!isSignedIn) {
      setAuthMessage(null);
      return;
    }

    const { user } = session;
    if (html.profileName) {
      html.profileName.textContent = user.displayName || 'RouteFlow Explorer';
    }
    if (html.profileEmail) {
      html.profileEmail.textContent = user.email || '';
    }
    if (html.profileTeam) {
      const membership = user.teams?.[config.teamSlug];
      if (membership) {
        html.profileTeam.textContent = `${config.teamName} · ${membership.role}`;
      } else {
        html.profileTeam.textContent = 'No admin team assigned';
      }
    }
    updateTeamBanner(session);
    updateOnboarding(session);
  };

  const updateTeamBanner = (session) => {
    if (!html.teamBanner) return;
    const membership = session?.user?.teams?.[config.teamSlug];
    if (!membership) {
      html.teamBanner.hidden = false;
      html.teamBanner.querySelector('[data-team-message]').textContent = `Join ${config.teamName} to unlock the admin dashboard.`;
      return;
    }
    html.teamBanner.hidden = false;
    html.teamBanner.querySelector('[data-team-message]').textContent = `You are an ${membership.role} of ${config.teamName}. Visit the admin dashboard to manage members.`;
  };

  const updateOnboarding = (session) => {
    if (!html.onboardingChecklist) return;
    const checklist = html.onboardingChecklist.querySelectorAll('[data-checklist-item]');
    checklist.forEach((item) => item.classList.remove('checklist__item--complete'));
    if (!session) return;
    const membership = session.user.teams?.[config.teamSlug];
    checklist.forEach((item) => {
      const key = item.dataset.checklistItem;
      if (key === 'create-account' && session) {
        item.classList.add('checklist__item--complete');
      }
      if (key === 'join-team' && membership) {
        item.classList.add('checklist__item--complete');
      }
    });
  };

  client.onAuthStateChanged((session) => {
    state.session = session;
    renderSession(session);
  });

  html.authTabs.forEach((button) => {
    button.addEventListener('click', () => {
      setTab(button.dataset.authTab);
    });
  });

  if (html.signInForm) {
    html.signInForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(event.target);
      const email = formData.get('email');
      const password = formData.get('password');
      setAuthMessage('Signing you in…', 'info');
      try {
        await client.signIn({ email, password });
        await client.ensureTeamMembership();
        setAuthMessage('Welcome back! You are now signed in.', 'success');
      } catch (error) {
        console.error(error);
        setAuthMessage(error.message || 'Unable to sign in. Please try again.', 'error');
      }
    });
  }

  if (html.signUpForm) {
    html.signUpForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(event.target);
      const displayName = formData.get('displayName');
      const email = formData.get('email');
      const password = formData.get('password');
      if (!displayName || displayName.length < 2) {
        setAuthMessage('Please tell us your name so we can personalise the experience.', 'error');
        return;
      }
      setAuthMessage('Creating your RouteFlow identity…', 'info');
      try {
        await client.signUp({ displayName, email, password });
        await client.ensureTeamMembership();
        setAuthMessage('Account created! You are signed in and ready to explore.', 'success');
      } catch (error) {
        console.error(error);
        setAuthMessage(error.message || 'Unable to create your account right now.', 'error');
      }
    });
  }

  html.providerButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const provider = button.dataset.provider;
      button.disabled = true;
      const original = button.textContent;
      button.textContent = `Connecting with ${button.dataset.providerLabel || provider}…`;
      setAuthMessage(`Connecting to ${button.dataset.providerLabel || provider}…`, 'info');
      try {
        await client.signInWithProvider(provider, {});
        await client.ensureTeamMembership();
        setAuthMessage(`Signed in with ${button.dataset.providerLabel || provider}.`, 'success');
      } catch (error) {
        console.error(error);
        setAuthMessage(error.message || 'Stack Auth sign-in failed. Please try again.', 'error');
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });
  });

  html.signOutButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      const original = button.textContent;
      button.textContent = 'Signing out…';
      try {
        await client.signOut();
        setAuthMessage('You have been signed out.', 'info');
        setTab('signin');
      } catch (error) {
        console.error(error);
        setAuthMessage('Unable to sign out right now. Please try again.', 'error');
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });
  });

  setTab(state.activeTab);
  renderSession(state.session);
})();
