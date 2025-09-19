(function initialiseSite() {
  const setCurrentYear = () => {
    const year = new Date().getFullYear();
    document.querySelectorAll('[data-current-year]').forEach(node => {
      node.textContent = year;
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setCurrentYear, { once: true });
  } else {
    setCurrentYear();
  }
})();
