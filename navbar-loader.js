// Load navbar component
fetch('components/navbar.html')
  .then(res => res.text())
  .then(html => {
    const container = document.getElementById('navbar-container');
    container.innerHTML = html;

    // Re-run JS after loading navbar
    initNavbar();
  });

// Function to initialize navbar behaviors
function initNavbar() {
  const hamburger = document.getElementById('hamburgerBtn');
  const drawer = document.getElementById('mobileDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const closeBtn = document.getElementById('closeDrawerBtn');

  hamburger?.addEventListener('click', e => {
    e.stopPropagation();
    drawer.classList.add('open');
    backdrop.classList.add('open');
  });
  closeBtn?.addEventListener('click', () => { drawer.classList.remove('open'); backdrop.classList.remove('open'); });
  backdrop?.addEventListener('click', () => { drawer.classList.remove('open'); backdrop.classList.remove('open'); });

  const accountMenu = document.getElementById('accountMenu');
  document.getElementById('profileIcon')?.addEventListener('click', e => {
    e.stopPropagation();
    accountMenu.classList.toggle('open');
  });
  document.addEventListener('click', e => {
    if(!accountMenu?.contains(e.target)) accountMenu?.classList.remove('open');
  });

  // Highlight active links
  const path = window.location.pathname.split('/').pop();
  document.querySelectorAll('.navbar__links a, .mobile-drawer a').forEach(link => {
    if(link.getAttribute('href')===path) link.classList.add('active');
  });
}
