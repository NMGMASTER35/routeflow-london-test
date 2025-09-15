// Persistent light/dark mode switcher
function applyStoredTheme() {
  const theme = localStorage.getItem('theme');
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
  }
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

document.addEventListener('DOMContentLoaded', applyStoredTheme);