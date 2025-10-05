(function (global) {
  'use strict';

  const DEFAULT_PROVIDERS = Object.freeze({
    google: {
      id: 'google',
      label: 'Google',
      description: 'Sign in with your Google account.',
      color: '#4285f4'
    },
    github: {
      id: 'github',
      label: 'GitHub',
      description: 'Use your GitHub account to access developer tools.',
      color: '#24292f'
    },
    discord: {
      id: 'discord',
      label: 'Discord',
      description: 'Connect your Discord account to join the community.',
      color: '#5865f2'
    }
  });

  const STORAGE_VERSION = 1;

  const nowIso = () => new Date().toISOString();

  const randomId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `id-${Math.random().toString(16).slice(2)}-${Date.now()}`;
  };

  const deepClone = (value) => JSON.parse(JSON.stringify(value));

  class MockStackAuthAdapter {
    constructor(config = {}) {
      this.storageKey = config.storageKey || 'stack-auth';
      this.teamSlug = config.teamSlug || null;
      this.teamName = config.teamName || 'Core Team';
      this.restore();
      if (this.teamSlug && !this.state.teams[this.teamSlug]) {
        this.state.teams[this.teamSlug] = {
          slug: this.teamSlug,
          name: this.teamName,
          description: config.teamDescription || 'Members who administer the RouteFlow experience.',
          createdAt: nowIso(),
          members: {}
        };
        this.persist();
      }
    }

    restore() {
      try {
        const raw = (typeof localStorage !== 'undefined')
          ? localStorage.getItem(`${this.storageKey}:v${STORAGE_VERSION}`)
          : null;
        if (!raw) {
          this.state = { users: {}, sessions: {}, teams: {}, providers: {} };
          return;
        }
        this.state = JSON.parse(raw);
      } catch (error) {
        console.warn('StackAuth: failed to restore state, resetting.', error);
        this.state = { users: {}, sessions: {}, teams: {}, providers: {} };
      }
    }

    persist() {
      try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(`${this.storageKey}:v${STORAGE_VERSION}`, JSON.stringify(this.state));
      } catch (error) {
        console.warn('StackAuth: failed to persist state.', error);
      }
    }

    createSession(userId) {
      const token = randomId();
      const session = {
        token,
        userId,
        createdAt: nowIso(),
        provider: 'password'
      };
      this.state.sessions[token] = session;
      this.persist();
      return deepClone(session);
    }

    getUserByEmail(email) {
      const entries = Object.values(this.state.users);
      return entries.find((user) => user.email.toLowerCase() === email.toLowerCase()) || null;
    }

    ensureTeamMembership(userId, role = 'admin') {
      if (!this.teamSlug) return null;
      const team = this.state.teams[this.teamSlug];
      if (!team.members[userId]) {
        team.members[userId] = {
          userId,
          role,
          joinedAt: nowIso()
        };
      }
      const user = this.state.users[userId];
      user.teams = user.teams || {};
      user.teams[this.teamSlug] = {
        slug: this.teamSlug,
        role: team.members[userId].role,
        joinedAt: team.members[userId].joinedAt
      };
      this.persist();
      return deepClone(team.members[userId]);
    }

    async signUp({ email, password, displayName }) {
      if (!email || !password) {
        throw new Error('Email and password are required.');
      }
      if (this.getUserByEmail(email)) {
        throw new Error('An account with that email already exists.');
      }
      const userId = randomId();
      const user = {
        id: userId,
        email: email.trim(),
        password,
        displayName: displayName?.trim() || email.split('@')[0],
        createdAt: nowIso(),
        updatedAt: nowIso(),
        providers: {},
        teams: {}
      };
      this.state.users[userId] = user;
      const session = this.createSession(userId);
      if (this.teamSlug) {
        const role = Object.keys(this.state.teams[this.teamSlug].members).length === 0 ? 'owner' : 'member';
        this.ensureTeamMembership(userId, role);
      }
      this.persist();
      return {
        user: deepClone(user),
        session
      };
    }

    async signIn({ email, password }) {
      const user = this.getUserByEmail(email);
      if (!user || user.password !== password) {
        throw new Error('Invalid email or password.');
      }
      const session = this.createSession(user.id);
      this.persist();
      return {
        user: deepClone(user),
        session
      };
    }

    async signInWithProvider(providerId, { displayName, email } = {}) {
      const providerKey = providerId.toLowerCase();
      let provider = this.state.providers[providerKey];
      if (!provider) {
        provider = { id: providerKey, identities: {} };
        this.state.providers[providerKey] = provider;
      }
      let identity = provider.identities[email?.toLowerCase()];
      if (!identity) {
        identity = {
          id: randomId(),
          email,
          displayName: displayName || email?.split('@')[0] || providerKey,
          createdAt: nowIso()
        };
        provider.identities[email?.toLowerCase()] = identity;
      }
      let user = null;
      if (email) {
        user = this.getUserByEmail(email);
      }
      if (!user) {
        const result = await this.signUp({
          email: email || `${providerKey}+${identity.id}@stack.local`,
          password: randomId().replace(/-/g, '').slice(0, 18),
          displayName: identity.displayName
        });
        user = this.state.users[result.user.id];
      }
      user.providers = user.providers || {};
      user.providers[providerKey] = {
        id: providerKey,
        identityId: identity.id,
        linkedAt: nowIso()
      };
      const session = this.createSession(user.id);
      session.provider = providerKey;
      this.persist();
      return {
        user: deepClone(user),
        session
      };
    }

    async signOut(token) {
      if (token && this.state.sessions[token]) {
        delete this.state.sessions[token];
        this.persist();
      }
      return true;
    }

    async getSession(token) {
      if (!token) return null;
      const session = this.state.sessions[token];
      if (!session) return null;
      const user = this.state.users[session.userId];
      if (!user) return null;
      return {
        user: deepClone(user),
        session: deepClone(session)
      };
    }

    async getTeam(slug) {
      const team = this.state.teams[slug];
      if (!team) return null;
      const members = Object.values(team.members).map((membership) => {
        const user = this.state.users[membership.userId];
        return {
          ...membership,
          user: user ? {
            id: user.id,
            displayName: user.displayName,
            email: user.email
          } : null
        };
      });
      return {
        slug: team.slug,
        name: team.name,
        description: team.description,
        createdAt: team.createdAt,
        members
      };
    }

    async updateTeamMemberRole(slug, userId, role) {
      const team = this.state.teams[slug];
      if (!team || !team.members[userId]) {
        throw new Error('Member not found.');
      }
      team.members[userId].role = role;
      const user = this.state.users[userId];
      if (user && user.teams[slug]) {
        user.teams[slug].role = role;
      }
      this.persist();
      return deepClone(team.members[userId]);
    }

    async removeTeamMember(slug, userId) {
      const team = this.state.teams[slug];
      if (!team || !team.members[userId]) {
        throw new Error('Member not found.');
      }
      delete team.members[userId];
      const user = this.state.users[userId];
      if (user && user.teams[slug]) {
        delete user.teams[slug];
      }
      this.persist();
      return true;
    }
  }

  class StackAuthClient {
    constructor(config = {}) {
      if (!config.projectId) {
        throw new Error('StackAuthClient requires a projectId.');
      }
      if (!config.clientId) {
        throw new Error('StackAuthClient requires a clientId.');
      }
      this.config = {
        projectId: config.projectId,
        clientId: config.clientId,
        teamSlug: config.teamSlug || null,
        teamName: config.teamName || 'Core Team',
        teamDescription: config.teamDescription || 'Administrators manage the RouteFlow workspace.',
        storageKey: config.storageKey || `stack-auth:${config.projectId}:${config.clientId}`
      };
      this.adapter = config.adapter || new MockStackAuthAdapter({
        storageKey: this.config.storageKey,
        teamSlug: this.config.teamSlug,
        teamName: this.config.teamName,
        teamDescription: this.config.teamDescription
      });
      this.session = null;
      this.listeners = new Set();
      this.restoreSession();
    }

    restoreSession() {
      if (typeof localStorage === 'undefined') return;
      try {
        const raw = localStorage.getItem(`${this.config.storageKey}:session`);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed?.token) return;
        this.adapter.getSession(parsed.token).then((session) => {
          if (session) {
            this.session = session;
            this.emit();
          }
        }).catch((error) => {
          console.warn('StackAuth: unable to restore session.', error);
          localStorage.removeItem(`${this.config.storageKey}:session`);
        });
      } catch (error) {
        console.warn('StackAuth: failed to parse stored session.', error);
        localStorage.removeItem(`${this.config.storageKey}:session`);
      }
    }

    persistSession(session) {
      if (typeof localStorage === 'undefined') return;
      if (!session) {
        localStorage.removeItem(`${this.config.storageKey}:session`);
        return;
      }
      localStorage.setItem(`${this.config.storageKey}:session`, JSON.stringify({ token: session.session.token }));
    }

    onAuthStateChanged(callback) {
      if (typeof callback !== 'function') return () => {};
      this.listeners.add(callback);
      if (this.session) {
        callback(this.session);
      }
      return () => {
        this.listeners.delete(callback);
      };
    }

    emit() {
      this.listeners.forEach((listener) => {
        try {
          listener(this.session ? deepClone(this.session) : null);
        } catch (error) {
          console.error('StackAuth listener error', error);
        }
      });
    }

    async signUp(payload) {
      const session = await this.adapter.signUp(payload);
      this.session = session;
      this.persistSession(session);
      this.emit();
      return session;
    }

    async signIn(payload) {
      const session = await this.adapter.signIn(payload);
      this.session = session;
      this.persistSession(session);
      this.emit();
      return session;
    }

    async signInWithProvider(providerId, options = {}) {
      const session = await this.adapter.signInWithProvider(providerId, options);
      this.session = session;
      this.persistSession(session);
      this.emit();
      return session;
    }

    async signOut() {
      if (this.session?.session?.token) {
        await this.adapter.signOut(this.session.session.token);
      }
      this.session = null;
      this.persistSession(null);
      this.emit();
    }

    async ensureTeamMembership(teamSlug = this.config.teamSlug) {
      if (!this.session) {
        throw new Error('No active session.');
      }
      if (!teamSlug) return null;
      await this.adapter.ensureTeamMembership(this.session.user.id);
      this.session = await this.adapter.getSession(this.session.session.token);
      this.persistSession(this.session);
      this.emit();
      return this.session;
    }

    get activeSession() {
      return this.session ? deepClone(this.session) : null;
    }

    async getTeam(teamSlug = this.config.teamSlug) {
      if (!teamSlug) return null;
      return this.adapter.getTeam(teamSlug);
    }

    async updateTeamMemberRole(userId, role, teamSlug = this.config.teamSlug) {
      if (!teamSlug) return null;
      const membership = await this.adapter.updateTeamMemberRole(teamSlug, userId, role);
      if (this.session?.user?.id === userId) {
        this.session = await this.adapter.getSession(this.session.session.token);
        this.persistSession(this.session);
        this.emit();
      }
      return membership;
    }

    async removeTeamMember(userId, teamSlug = this.config.teamSlug) {
      if (!teamSlug) return null;
      await this.adapter.removeTeamMember(teamSlug, userId);
      if (this.session?.user?.id === userId) {
        await this.signOut();
      }
      return true;
    }
  }

  global.StackAuth = Object.freeze({
    StackAuthClient,
    providers: DEFAULT_PROVIDERS
  });
})(typeof window !== 'undefined' ? window : globalThis);
