// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDuedLuagA4IXc9ZMG9wvoak-sRrhtFZfo",
  authDomain: "routeflow-london.firebaseapp.com",
  projectId: "routeflow-london",
  storageBucket: "routeflow-london.firebasestorage.app",
  messagingSenderId: "368346241440",
  appId: "1:368346241440:web:7cc87d551420459251ecc5"
};
firebase.initializeApp(firebaseConfig);

// Hamburger menu open/close
const hamburgerBtn = document.getElementById('hamburgerBtn');
const popoutMenu = document.getElementById('popoutMenu');
const menuBackBtn = document.getElementById('menuBackBtn');
hamburgerBtn.onclick = function(e) {
  e.stopPropagation();
  popoutMenu.classList.add('active');
}
menuBackBtn.onclick = function() {
  popoutMenu.classList.remove('active');
}
document.addEventListener('click', function(e) {
  if (
    popoutMenu.classList.contains('active') &&
    !popoutMenu.contains(e.target) &&
    e.target !== hamburgerBtn
  ) {
    popoutMenu.classList.remove('active');
  }
});
// Newsletter form
document.getElementById('newsletter-form').addEventListener('submit', function (e) {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const message = document.getElementById('response-message');
  // For demo, just show message
  message.textContent = 'You have been subscribed!';
  this.reset();
  setTimeout(() => message.textContent = '', 4000);
});

// --- Auth Dropdown ---
function renderDropdown(user) {
  const dropdown = document.getElementById('dropdownContent');
  dropdown.innerHTML = '';
  if (!user) {
    dropdown.innerHTML = `
      <a href="#" id="loginBtn">Login</a>
      <a href="#" id="signupBtn">Sign Up</a>
    `;
  } else {
    dropdown.innerHTML = `
      <a href="profile.html" id="profileBtn">Profile</a>
      <a href="#" id="settingsBtn">Settings</a>
      <button id="logoutBtn" style="color:#f03e3e;">Logout</button>
    `;
  }
}

// Dropdown toggle for mobile (click)
const profileMenu = document.getElementById('profileMenu');
const dropdownContent = document.getElementById('dropdownContent');
const profileIcon = document.getElementById('profileIcon');
let dropdownOpen = false;
profileIcon.addEventListener('click', function(e) {
  e.stopPropagation();
  dropdownContent.style.display = (dropdownContent.style.display === 'flex' ? 'none' : 'flex');
  dropdownOpen = !dropdownOpen;
});
document.addEventListener('click', function(e) {
  if (dropdownOpen && !profileMenu.contains(e.target)) {
    dropdownContent.style.display = 'none';
    dropdownOpen = false;
  }
});

// Modal logic
function closeModal() {
  document.getElementById('authModal').style.display = 'none';
  clearFormMessages();
  document.getElementById('loginForm').reset();
  document.getElementById('signupForm').reset();
}
function clearFormMessages() {
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('signupError').style.display = 'none';
}
// Initial auth state
firebase.auth().onAuthStateChanged(function(user) {
  renderDropdown(user);
});
document.addEventListener('DOMContentLoaded', function () {
  // Dropdown menu
  renderDropdown(firebase.auth().currentUser);
  const modal = document.getElementById('authModal');
  const closeModalEl = document.getElementById('closeModal');
  document.body.addEventListener('click', function (e) {
    // Login
    if (e.target.id === 'loginBtn') {
      e.preventDefault();
      document.getElementById('loginFormContainer').style.display = '';
      document.getElementById('signupFormContainer').style.display = 'none';
      modal.style.display = 'block';
      clearFormMessages();
    }
    // Signup
    if (e.target.id === 'signupBtn') {
      e.preventDefault();
      document.getElementById('loginFormContainer').style.display = 'none';
      document.getElementById('signupFormContainer').style.display = '';
      modal.style.display = 'block';
      clearFormMessages();
    }
    // Logout
    if (e.target.id === 'logoutBtn') {
      e.preventDefault();
      firebase.auth().signOut().then(() => {
        renderDropdown(null);
      });
    }
    // Profile
    if (e.target.id === 'profileBtn') {
      e.preventDefault();
      const user = firebase.auth().currentUser;
      alert(user ? 'Email: ' + user.email : "Not signed in");
    }
    // Settings
    if (e.target.id === 'settingsBtn') {
      e.preventDefault();
      alert('Settings are not available yet.');
    }
    // Switch to Signup
    if (e.target.id === 'showSignup') {
      e.preventDefault();
      document.getElementById('loginFormContainer').style.display = 'none';
      document.getElementById('signupFormContainer').style.display = '';
      clearFormMessages();
    }
    // Switch to Login
    if (e.target.id === 'showLogin') {
      e.preventDefault();
      document.getElementById('loginFormContainer').style.display = '';
      document.getElementById('signupFormContainer').style.display = 'none';
      clearFormMessages();
    }
    // Close Modal
    if (e.target === closeModalEl) {
      closeModal();
    }
  });

  // Login Form Submission
  document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    clearFormMessages();
    firebase.auth().signInWithEmailAndPassword(email, password)
      .then(() => {
        renderDropdown(firebase.auth().currentUser);
        closeModal();
      })
      .catch((error) => {
        const loginError = document.getElementById('loginError');
        loginError.textContent = error.message;
        loginError.style.display = 'block';
      });
  });

  // Signup Form Submission
  document.getElementById('signupForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    clearFormMessages();
    firebase.auth().createUserWithEmailAndPassword(email, password)
      .then(() => {
        renderDropdown(firebase.auth().currentUser);
        closeModal();
      })
      .catch((error) => {
        const signupError = document.getElementById('signupError');
        signupError.textContent = error.message;
        signupError.style.display = 'block';
      });
  });

  // Close modal on outside click
  window.onclick = function(event) {
    if (event.target === modal) {
      closeModal();
    }
  }
  // ESC closes modal
  document.addEventListener('keydown', function(event) {
    if (event.key === "Escape") {
      closeModal();
    }
  });

  // Assign Google Sign-In and Reset handlers to all relevant buttons/links
  document.querySelectorAll('.google-login').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const provider = new firebase.auth.GoogleAuthProvider();
      firebase.auth().signInWithPopup(provider)
        .then((result) => {
          alert("Google sign-in successful!");
          window.location.href = "dashboard.html"; // redirect after login
        })
        .catch((error) => {
          alert("Google sign-in error: " + error.message);
        });
    });
  });
const slideContainer = document.querySelector('.carousel-slide');
const images = document.querySelectorAll('.carousel-slide img');
const prevBtn = document.querySelector('.carousel-btn.prev');
const nextBtn = document.querySelector('.carousel-btn.next');
const dotsContainer = document.querySelector('.carousel-dots');

let currentIndex = 0;
  const captions = Array.from(images).map(img => img.dataset.caption);
const captionEl = document.getElementById('carousel-caption'); // Make sure this exists in HTML


// Create dots
images.forEach((_, index) => {
  const dot = document.createElement('span');
  dot.addEventListener('click', () => goToSlide(index));
  dotsContainer.appendChild(dot);
});

function updateCarousel() {
  slideContainer.style.transform = `translateX(-${currentIndex * 100}%)`;
  Array.from(dotsContainer.children).forEach(dot => dot.classList.remove('active'));
  dotsContainer.children[currentIndex].classList.add('active');
}

function goToSlide(index) {
  currentIndex = index;
  updateCarousel();
}

function nextSlide() {
  currentIndex = (currentIndex + 1) % images.length;
  updateCarousel();
}

function prevSlide() {
  currentIndex = (currentIndex - 1 + images.length) % images.length;
  updateCarousel();
}

nextBtn.addEventListener('click', nextSlide);
prevBtn.addEventListener('click', prevSlide);

// Auto-play (optional)
setInterval(nextSlide, 10000); // Change slide every 5 seconds

// Init
updateCarousel();
  document.querySelectorAll('.reset-password').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const email = prompt("Enter your email to reset your password:");
      if (email) {
        firebase.auth().sendPasswordResetEmail(email)
          .then(() => {
            alert("Password reset email sent!");
          })
          .catch((error) => {
            alert("Reset error: " + error.message);
          });
      }
    });
  });
});
