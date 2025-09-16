const adminContent = document.getElementById('adminContent');
const firebaseConfig = {
  apiKey: "AIzaSyDuedLuagA4IXc9ZMG9wvoak-sRrhtFZfo",
  authDomain: "routeflow-london.firebaseapp.com",
  projectId: "routeflow-london",
  storageBucket: "routeflow-london.firebasestorage.app",
  messagingSenderId: "368346241440",
  appId: "1:368346241440:web:7cc87d551420459251ecc5"
};

const FIREBASE_WAIT_TIMEOUT = 10000;
const FIREBASE_POLL_INTERVAL = 100;
const REDIRECT_DELAY = 4000;
let redirectTimer = null;

function replaceContent(...nodes) {
  if (!adminContent) return;
  adminContent.replaceChildren(...nodes);
}

function createMessageSection(text, role = 'status', modifier = '') {
  const section = document.createElement('section');
  section.className = ['admin-message', modifier ? `admin-message--${modifier}` : ''].filter(Boolean).join(' ');
  if (role) {
    section.setAttribute('role', role);
  }
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  section.append(paragraph);
  return section;
}

function setBusy(isBusy) {
  if (!adminContent) return;
  if (isBusy) {
    adminContent.setAttribute('aria-busy', 'true');
  } else {
    adminContent.removeAttribute('aria-busy');
  }
}

function showInfo(message) {
  setBusy(true);
  if (!adminContent) return;
  clearPendingRedirect();
  replaceContent(createMessageSection(message, 'status', 'info'));
}

function showError(message) {
  setBusy(false);
  if (!adminContent) return;
  clearPendingRedirect();
  replaceContent(createMessageSection(message, 'alert', 'error'));
}

function clearPendingRedirect() {
  if (redirectTimer !== null) {
    window.clearTimeout(redirectTimer);
    redirectTimer = null;
  }
}

function renderUnauthorized(message, options = {}) {
  const { showLoginButton = false, redirectToHome = false, hint = '' } = options;
  setBusy(false);
  if (!adminContent) return;
  clearPendingRedirect();

  const section = createMessageSection(message, 'alert', 'error');

  if (hint) {
    const hintParagraph = document.createElement('p');
    hintParagraph.className = 'admin-message__hint';
    hintParagraph.textContent = hint;
    section.append(hintParagraph);
  }

  const actions = document.createElement('div');
  actions.className = 'admin-message__actions';

  if (showLoginButton) {
    const loginButton = document.createElement('button');
    loginButton.type = 'button';
    loginButton.className = 'admin-message__action';
    loginButton.dataset.authAction = 'login';
    loginButton.textContent = 'Admin login';
    actions.append(loginButton);
  }

  if (redirectToHome) {
    const homeLink = document.createElement('a');
    homeLink.href = 'index.html';
    homeLink.className = 'admin-message__action admin-message__action--ghost';
    homeLink.textContent = 'Go back home';
    actions.append(homeLink);
  }

  if (actions.childElementCount > 0) {
    section.append(actions);
  }

  replaceContent(section);

  if (redirectToHome) {
    redirectTimer = window.setTimeout(() => {
      window.location.href = 'index.html';
    }, REDIRECT_DELAY);
  }
}

function renderAdminDashboard(user) {
  if (!adminContent) return;
  clearPendingRedirect();
  setBusy(false);
  const section = document.createElement('section');
  section.className = 'admin-dashboard';

  const heading = document.createElement('h1');
  heading.id = 'adminDashboardHeading';
  heading.textContent = 'Admin Console';
  section.append(heading);

  const welcome = document.createElement('p');
  const displayName = user.displayName || user.email || 'Administrator';
  welcome.textContent = `Welcome, ${displayName}.`;
  section.append(welcome);

  const placeholder = document.createElement('p');
  placeholder.textContent = 'Administrative tools will appear here when they are available.';
  section.append(placeholder);

  replaceContent(section);
}

function ensureFirebaseAuth() {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const attempt = () => {
      const fb = window.firebase;
      if (fb && typeof fb.auth === 'function') {
        try {
          if (!fb.apps.length) {
            fb.initializeApp(firebaseConfig);
          }
          const authInstance = fb.auth();
          resolve(authInstance);
        } catch (error) {
          reject(error);
        }
        return;
      }

      if (Date.now() - start >= FIREBASE_WAIT_TIMEOUT) {
        reject(new Error('Timed out waiting for Firebase Auth to load.'));
        return;
      }

      window.setTimeout(attempt, FIREBASE_POLL_INTERVAL);
    };

    attempt();
  });
}

if (!adminContent) {
  console.error('Admin content container not found.');
} else {
  showInfo('Checking your administrator access…');
}

ensureFirebaseAuth()
  .then((auth) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        renderUnauthorized(
          'You must be signed in as an administrator to view this page.',
          {
            showLoginButton: true,
            hint: 'Select “Admin login” to sign in with an administrator account.',
          }
        );
        return;
      }

      showInfo('Verifying your administrator permissions…');

      try {
        const tokenResult = await user.getIdTokenResult();
        if (tokenResult?.claims?.admin) {
          renderAdminDashboard(user);
        } else {
          renderUnauthorized(
            'You are not authorized to access this page. You will be redirected to the homepage shortly.',
            {
              redirectToHome: true,
              hint: 'If you believe this is an error, please contact your RouteFlow London administrator.',
            }
          );
        }
      } catch (error) {
        console.error('Failed to retrieve administrator claims:', error);
        showError('We could not verify your administrator permissions. Please try again later.');
      }
    });
  })
  .catch((error) => {
    console.error('Failed to initialise Firebase authentication for the admin page:', error);
    showError('Authentication is currently unavailable. Please try again later.');
  });

