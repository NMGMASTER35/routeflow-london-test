(function initialiseRouteflowConfig() {
  const existing = window.__ROUTEFLOW_CONFIG__ || {};
  const firebaseConfig = existing.firebase && typeof existing.firebase === 'object'
    ? existing.firebase
    : {};
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
