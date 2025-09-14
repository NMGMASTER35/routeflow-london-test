// Handles profile display and editing for logged-in users

document.addEventListener('DOMContentLoaded', () => {
  const nameEl = document.querySelector('.profile-details h1');
  const avatarEl = document.querySelector('.profile-avatar img');
  const editNameBtn = document.querySelector('.edit-profile-btn');
  const editAvatarBtn = document.querySelector('.edit-avatar-btn');

  function renderProfile(user) {
    const displayName = user?.displayName || localStorage.getItem('displayName') || 'Anonymous';
    const photoURL = user?.photoURL || localStorage.getItem('photoURL') || 'images/default-avatar.png';
    nameEl.textContent = displayName;
    avatarEl.src = photoURL;
  }

  firebase.auth().onAuthStateChanged(renderProfile);

  editNameBtn.addEventListener('click', () => {
    const newName = prompt('Enter a new display name:');
    if (!newName) return;
    const user = firebase.auth().currentUser;
    if (user) {
      user.updateProfile({ displayName: newName }).then(() => renderProfile(user));
    } else {
      localStorage.setItem('displayName', newName);
      renderProfile(null);
    }
  });

  editAvatarBtn.addEventListener('click', () => {
    const newUrl = prompt('Enter a new avatar URL:');
    if (!newUrl) return;
    const user = firebase.auth().currentUser;
    if (user) {
      user.updateProfile({ photoURL: newUrl }).then(() => renderProfile(user));
    } else {
      localStorage.setItem('photoURL', newUrl);
      renderProfile(null);
    }
  });
});
