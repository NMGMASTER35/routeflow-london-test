(function initialiseRouteflowConfig() {
  const existing = window.__ROUTEFLOW_CONFIG__ || {};
  const discordConfig = existing.discord && typeof existing.discord === 'object'
    ? existing.discord
    : {};

  const normalisedDiscordScopes = Array.isArray(discordConfig.scopes) && discordConfig.scopes.length
    ? discordConfig.scopes.filter((scope) => typeof scope === 'string' && scope.trim()).map((scope) => scope.trim())
    : ['identify'];

  window.__ROUTEFLOW_CONFIG__ = {
    auth: {
      mode: 'local',
      allowRegistration: existing.auth?.allowRegistration !== false,
      allowGuest: existing.auth?.allowGuest !== false
    },
    firebase: {},
    discord: {
      prompt: discordConfig.prompt || 'consent',
      clientId: discordConfig.clientId || '',
      redirectUri: discordConfig.redirectUri || window.location.origin + window.location.pathname,
      scopes: normalisedDiscordScopes
    }
  };
})();
