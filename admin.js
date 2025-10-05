(function () {
  'use strict';

  const qs = (selector) => document.querySelector(selector);
  const qsa = (selector) => Array.from(document.querySelectorAll(selector));

  const root = document.body;
  const nav = qs('#primaryNav');
  const navToggle = qs('.site-nav__toggle');

  if (nav && navToggle) {
    const closeNav = () => {
      nav.dataset.open = 'false';
      navToggle.setAttribute('aria-expanded', 'false');
    };
    const openNav = () => {
      nav.dataset.open = 'true';
      navToggle.setAttribute('aria-expanded', 'true');
    };
    const syncNavToViewport = () => {
      if (window.innerWidth > 720) {
        openNav();
      } else {
        closeNav();
      }
    };
    navToggle.addEventListener('click', () => {
      const isOpen = nav.dataset.open === 'true';
      if (isOpen) {
        closeNav();
      } else {
        openNav();
      }
    });
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a') || event.target.dataset.action === 'signout') {
        if (window.innerWidth <= 720) {
          closeNav();
        }
      }
    });
    window.addEventListener('resize', syncNavToViewport);
    syncNavToViewport();
  }

  const config = {
    projectId: root.dataset.stackProject || 'routeflow-demo',
    clientId: root.dataset.stackClient || 'web',
    teamSlug: root.dataset.stackTeam || 'routeflow-admins',
    teamName: root.dataset.stackTeamName || 'RouteFlow Admins',
    teamDescription: root.dataset.stackTeamDescription || 'Trusted operators who manage the RouteFlow platform.'
  };

  const client = new StackAuth.StackAuthClient(config);

  const ui = {
    guardSignedOut: qs('#adminSignedOut'),
    guardNoTeam: qs('#adminNoTeam'),
    dashboard: qs('#adminDashboard'),
    profileName: qs('#adminProfileName'),
    profileEmail: qs('#adminProfileEmail'),
    teamName: qs('#adminTeamName'),
    teamMembers: qs('#teamMembers'),
    refreshButton: qs('#refreshTeam'),
    signOutButtons: qsa('[data-action="signout"]'),
    status: qs('#adminStatus'),
    inviteForm: qs('#inviteForm'),
    inviteEmail: qs('#inviteEmail'),
    inviteRole: qs('#inviteRole')
  };

  const setStatus = (message, type = 'info') => {
    if (!ui.status) return;
    if (!message) {
      ui.status.hidden = true;
      ui.status.textContent = '';
      ui.status.className = 'admin-status';
      return;
    }
    ui.status.hidden = false;
    ui.status.textContent = message;
    ui.status.className = `admin-status admin-status--${type}`;
  };

  const renderState = (session) => {
    const membership = session?.user?.teams?.[config.teamSlug];
    ui.guardSignedOut.hidden = !!session;
    ui.guardNoTeam.hidden = !session || !!membership;
    ui.dashboard.hidden = !(session && membership);
    ui.signOutButtons.forEach((button) => {
      button.hidden = !session;
    });

    if (!session) {
      setStatus('Sign in to manage your Stack team.', 'info');
      return;
    }

    if (ui.profileName) {
      ui.profileName.textContent = session.user.displayName || 'RouteFlow Admin';
    }
    if (ui.profileEmail) {
      ui.profileEmail.textContent = session.user.email || '';
    }
    if (!membership) {
      setStatus(`You are signed in but not part of ${config.teamName}. Ask an owner to add you.`, 'warning');
      return;
    }
    setStatus(`You are signed in as a ${membership.role} of ${config.teamName}.`, 'success');
    if (ui.teamName) {
      ui.teamName.textContent = config.teamName;
    }
    refreshTeam();
  };

  const renderMembers = (members = []) => {
    if (!ui.teamMembers) return;
    ui.teamMembers.innerHTML = '';
    if (members.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'team-members__empty';
      empty.textContent = 'No team members found yet. Invite someone to get started.';
      ui.teamMembers.appendChild(empty);
      return;
    }
    members.forEach((member) => {
      const item = document.createElement('article');
      item.className = 'team-members__item';
      item.dataset.userId = member.user?.id;

      const info = document.createElement('div');
      info.className = 'team-members__info';
      const name = document.createElement('h3');
      name.textContent = member.user?.displayName || member.user?.email || 'Unknown member';
      const email = document.createElement('p');
      email.textContent = member.user?.email || 'No email provided';
      email.className = 'team-members__email';
      info.appendChild(name);
      info.appendChild(email);

      const roleControls = document.createElement('div');
      roleControls.className = 'team-members__controls';
      const roleLabel = document.createElement('label');
      roleLabel.textContent = 'Role';
      roleLabel.className = 'team-members__label';
      roleLabel.setAttribute('for', `member-role-${member.user?.id}`);
      const select = document.createElement('select');
      select.id = `member-role-${member.user?.id}`;
      select.className = 'team-members__role';
      ['owner', 'admin', 'member'].forEach((role) => {
        const option = document.createElement('option');
        option.value = role;
        option.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        if (role === member.role) {
          option.selected = true;
        }
        select.appendChild(option);
      });
      select.addEventListener('change', async (event) => {
        const role = event.target.value;
        try {
          setStatus(`Updating ${member.user?.displayName || member.user?.email}…`, 'info');
          await client.updateTeamMemberRole(member.user.id, role);
          setStatus('Role updated.', 'success');
          refreshTeam();
        } catch (error) {
          console.error(error);
          setStatus(error.message || 'Unable to update role.', 'error');
        }
      });

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = 'Remove';
      removeButton.className = 'team-members__remove';
      removeButton.addEventListener('click', async () => {
        if (!window.confirm('Remove this member from the team?')) {
          return;
        }
        try {
          setStatus(`Removing ${member.user?.displayName || member.user?.email}…`, 'info');
          await client.removeTeamMember(member.user.id);
          setStatus('Member removed.', 'success');
          refreshTeam();
        } catch (error) {
          console.error(error);
          setStatus(error.message || 'Unable to remove member.', 'error');
        }
      });

      roleControls.appendChild(roleLabel);
      roleControls.appendChild(select);
      roleControls.appendChild(removeButton);

      item.appendChild(info);
      item.appendChild(roleControls);
      ui.teamMembers.appendChild(item);
    });
  };

  async function refreshTeam() {
    if (!client.activeSession) return;
    try {
      const team = await client.getTeam();
      renderMembers(team?.members || []);
    } catch (error) {
      console.error(error);
      setStatus('Unable to load team members.', 'error');
    }
  }

  if (ui.refreshButton) {
    ui.refreshButton.addEventListener('click', () => {
      refreshTeam();
    });
  }

  if (ui.inviteForm && ui.inviteEmail && ui.inviteRole) {
    ui.inviteForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = ui.inviteEmail.value.trim();
      const role = ui.inviteRole.value;
      if (!email) {
        setStatus('Enter an email address to invite.', 'error');
        return;
      }
      try {
        setStatus(`Inviting ${email} as ${role}…`, 'info');
        const existingSession = client.adapter.getUserByEmail ? client.adapter.getUserByEmail(email) : null;
        if (existingSession) {
          await client.adapter.ensureTeamMembership(existingSession.id, role);
        } else {
          await client.adapter.signUp({ email, password: Math.random().toString(36).slice(2, 10), displayName: email.split('@')[0] });
          await client.adapter.ensureTeamMembership(client.adapter.getUserByEmail(email).id, role);
        }
        setStatus('Invitation recorded. The member can now sign in to access the dashboard.', 'success');
        refreshTeam();
        ui.inviteEmail.value = '';
      } catch (error) {
        console.error(error);
        setStatus(error.message || 'Unable to invite member.', 'error');
      }
    });
  }

  ui.signOutButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await client.signOut();
        setStatus('Signed out.', 'info');
      } catch (error) {
        console.error(error);
        setStatus('Unable to sign out right now.', 'error');
      }
    });
  });

  client.onAuthStateChanged((session) => {
    renderState(session);
  });

  renderState(client.activeSession);
})();
