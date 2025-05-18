// --- Utility Functions ---
function openModal(id) {
  document.getElementById(id).style.display = 'flex';
}
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// --- Saving Settings ---
function saveSetting(key) {
  let value;
  switch (key) {
    case 'username':
      value = document.getElementById('username').value;
      break;
    case 'email':
      value = document.getElementById('email').value;
      break;
    case 'twofa':
      value = document.getElementById('twofa').value;
      break;
    case 'theme':
      value = document.getElementById('theme').value;
      document.body.setAttribute('data-theme', value);
      break;
    case 'mapStyle':
      value = document.getElementById('map-style').value;
      break;
    case 'landingPage':
      value = document.getElementById('landing-page').value;
      break;
    case 'homeStop':
      value = document.getElementById('home-stop').value;
      break;
    case 'alertRare':
      value = document.getElementById('alert-rare').checked;
      break;
    case 'alertRoute':
      value = document.getElementById('alert-route').checked;
      break;
    case 'alertAchievements':
      value = document.getElementById('alert-achievements').checked;
      break;
    case 'alertFriend':
      value = document.getElementById('alert-friend').checked;
      break;
    case 'delivery':
      value = document.querySelector('input[name="delivery"]:checked')?.value || '';
      break;
    case 'transportMode':
      value = document.getElementById('transport-mode').value;
      break;
    case 'direction':
      value = document.getElementById('direction').value;
      break;
    case 'excludeRoutes':
      value = document.getElementById('exclude-routes').value;
      break;
    case 'realtimeCountdown':
      value = document.getElementById('realtime-countdown').checked;
      break;
    case 'publicProfile':
      value = document.getElementById('public-profile').checked;
      break;
    case 'hideRare':
      value = document.getElementById('hide-rare').checked;
      break;
    case 'blockedUsers':
      value = document.getElementById('blocked-users').value;
      break;
    case 'activityVisibility':
      value = document.getElementById('activity-visibility').value;
      break;
    case 'betaAccess':
      value = document.getElementById('beta-access').checked;
      break;
    case 'locationTracking':
      value = document.getElementById('location-tracking').checked;
      break;
    case 'locale':
      value = document.getElementById('locale').value;
      break;
    case 'unit':
      value = document.getElementById('unit').value;
      break;
    default:
      return;
  }
  // Save to localStorage for instant demo effect
  localStorage.setItem(key, JSON.stringify(value));
  // TODO: Replace localStorage with backend API call for real global persistence
}

function loadSettings() {
  const keys = [
    'username', 'email', 'twofa', 'theme', 'mapStyle', 'landingPage', 'homeStop',
    'alertRare', 'alertRoute', 'alertAchievements', 'alertFriend', 'delivery',
    'transportMode', 'direction', 'excludeRoutes', 'realtimeCountdown',
    'publicProfile', 'hideRare', 'blockedUsers', 'activityVisibility',
    'betaAccess', 'locationTracking', 'locale', 'unit'
  ];
  keys.forEach(key => {
    const val = localStorage.getItem(key);
    if (val !== null) {
      switch (key) {
        case 'username':
          document.getElementById('username').value = JSON.parse(val);
          break;
        case 'email':
          document.getElementById('email').value = JSON.parse(val);
          break;
        case 'twofa':
          document.getElementById('twofa').value = JSON.parse(val);
          break;
        case 'theme':
          document.getElementById('theme').value = JSON.parse(val);
          document.body.setAttribute('data-theme', JSON.parse(val));
          break;
        case 'mapStyle':
          document.getElementById('map-style').value = JSON.parse(val);
          break;
        case 'landingPage':
          document.getElementById('landing-page').value = JSON.parse(val);
          break;
        case 'homeStop':
          document.getElementById('home-stop').value = JSON.parse(val);
          break;
        case 'alertRare':
          document.getElementById('alert-rare').checked = JSON.parse(val);
          break;
        case 'alertRoute':
          document.getElementById('alert-route').checked = JSON.parse(val);
          break;
        case 'alertAchievements':
          document.getElementById('alert-achievements').checked = JSON.parse(val);
          break;
        case 'alertFriend':
          document.getElementById('alert-friend').checked = JSON.parse(val);
          break;
        case 'delivery':
          let delivery = JSON.parse(val);
          if (delivery) {
            let radio = document.querySelector(`input[name="delivery"][value="${delivery}"]`);
            if (radio) radio.checked = true;
          }
          break;
        case 'transportMode':
          document.getElementById('transport-mode').value = JSON.parse(val);
          break;
        case 'direction':
          document.getElementById('direction').value = JSON.parse(val);
          break;
        case 'excludeRoutes':
          document.getElementById('exclude-routes').value = JSON.parse(val);
          break;
        case 'realtimeCountdown':
          document.getElementById('realtime-countdown').checked = JSON.parse(val);
          break;
        case 'publicProfile':
          document.getElementById('public-profile').checked = JSON.parse(val);
          break;
        case 'hideRare':
          document.getElementById('hide-rare').checked = JSON.parse(val);
          break;
        case 'blockedUsers':
          document.getElementById('blocked-users').value = JSON.parse(val);
          break;
        case 'activityVisibility':
          document.getElementById('activity-visibility').value = JSON.parse(val);
          break;
        case 'betaAccess':
          document.getElementById('beta-access').checked = JSON.parse(val);
          break;
        case 'locationTracking':
          document.getElementById('location-tracking').checked = JSON.parse(val);
          break;
        case 'locale':
          document.getElementById('locale').value = JSON.parse(val);
          break;
        case 'unit':
          document.getElementById('unit').value = JSON.parse(val);
          break;
      }
    }
  });
}

// --- Special Actions ---
function changePassword() {
  let newPassword = document.getElementById('password').value;
  if (!newPassword || newPassword.length < 6) {
    alert("Password must be at least 6 characters.");
    return;
  }
  // TODO: Call backend API to change password securely
  document.getElementById('password').value = '';
  alert("Password changed (demo only).");
}

function deleteAccount() {
  closeModal('delete-account-modal');
  // TODO: Call backend API to delete account
  alert("Account deleted (demo only).");
}

function exportData() {
  // TODO: Call backend API to export data; here we just demo
  alert("Exporting your account data... (demo only)");
}

function manageDevices() {
  // TODO: Show/manage logged-in devices popup or page
  alert("Device/session management coming soon!");
}

// --- On Load ---
window.onload = loadSettings;
