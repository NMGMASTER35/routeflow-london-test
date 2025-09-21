(function initialiseSite() {
  const MOBILE_STYLESHEET_ID = 'routeflow-mobile-shell';

  const ensureMobileStylesheet = () => {
    if (document.getElementById(MOBILE_STYLESHEET_ID)) {
      return;
    }
    const link = document.createElement('link');
    link.id = MOBILE_STYLESHEET_ID;
    link.rel = 'stylesheet';
    link.href = 'mobile-app.css';
    link.media = 'all';
    document.head.appendChild(link);
  };

  const setCurrentYear = () => {
    const year = new Date().getFullYear();
    document.querySelectorAll('[data-current-year]').forEach(node => {
      node.textContent = year;
    });
  };

  ensureMobileStylesheet();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureMobileStylesheet();
      setCurrentYear();
    }, { once: true });
  } else {
    setCurrentYear();
  }
})();
