(function initialiseRouteflowConfig() {
  const existing = window.__ROUTEFLOW_CONFIG__ || {};
  const defaultFirebaseConfig = {
    apiKey: 'AIzaSyDuedLuagA4IXc9ZMG9wvoak-sRrhtFZfo',
    authDomain: 'routeflow-london.firebaseapp.com',
    projectId: 'routeflow-london',
    storageBucket: 'routeflow-london.firebasestorage.app',
    messagingSenderId: '368346241440',
    appId: '1:368346241440:web:7cc87d551420459251ecc5'
  };

  const firebaseConfig = existing.firebase && typeof existing.firebase === 'object'
    ? { ...defaultFirebaseConfig, ...existing.firebase }
    : { ...defaultFirebaseConfig };
  const discordConfig = existing.discord && typeof existing.discord === 'object'
    ? existing.discord
    : {};

  const normalisedDiscordScopes = Array.isArray(discordConfig.scopes) && discordConfig.scopes.length
    ? discordConfig.scopes.filter((scope) => typeof scope === 'string' && scope.trim()).map((scope) => scope.trim())
    : ['identify'];

  window.__ROUTEFLOW_CONFIG__ = {
    firebase: { ...firebaseConfig },
    discord: {
      prompt: discordConfig.prompt || 'consent',
      clientId: discordConfig.clientId || '',
      redirectUri: discordConfig.redirectUri || window.location.origin + window.location.pathname,
      scopes: normalisedDiscordScopes
    }
  };
})();
