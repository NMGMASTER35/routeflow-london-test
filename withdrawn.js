import { getStoredWithdrawnRoutes, refreshWithdrawnRoutes, STORAGE_KEYS } from './data-store.js';

const selectors = {
  table: document.getElementById('withdrawnTable'),
  search: document.getElementById('withdrawnSearch'),
  empty: document.getElementById('withdrawnEmpty'),
  stats: {
    total: document.getElementById('withdrawnTotal'),
    operators: document.getElementById('withdrawnOperators'),
    earliest: document.getElementById('withdrawnEarliest')
  }
};

const state = {
  rows: [],
  searchTerm: ''
};

const normalise = (value) => (typeof value === 'string' ? value.trim() : '');

const parseDate = (value) => {
  const trimmed = normalise(value);
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed);
  }
  const match = trimmed.match(/^(\d{4})$/);
  if (match) {
    return new Date(Number(match[1]), 0, 1);
  }
  return null;
};

const formatDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const computeStats = () => {
  const operators = new Set();
  let earliestDate = null;

  state.rows.forEach((row) => {
    const operator = normalise(row.cells?.[5]?.textContent || '');
    if (operator) {
      operators.add(operator);
    }
    const withdrawn = parseDate(row.cells?.[4]?.textContent || '');
    if (withdrawn) {
      if (!earliestDate || withdrawn < earliestDate) {
        earliestDate = withdrawn;
      }
    }
  });

  if (selectors.stats.total) selectors.stats.total.textContent = state.rows.length.toString();
  if (selectors.stats.operators) selectors.stats.operators.textContent = operators.size.toString();
  if (selectors.stats.earliest) selectors.stats.earliest.textContent = earliestDate ? formatDate(earliestDate) : '—';
};

const filterRows = (term) => {
  state.searchTerm = term;
  const searchTerm = term.toLowerCase();
  let visibleCount = 0;

  state.rows.forEach((row) => {
    const text = row.textContent.toLowerCase();
    const matches = !searchTerm || text.includes(searchTerm);
    row.style.display = matches ? '' : 'none';
    if (matches) {
      visibleCount += 1;
    }
  });

  if (selectors.empty) {
    selectors.empty.toggleAttribute('hidden', visibleCount > 0);
  }
};

const renderStoredRoutes = () => {
  if (!selectors.table) return;
  const tbody = selectors.table.querySelector('tbody');
  if (!tbody) return;

  Array.from(tbody.querySelectorAll('tr[data-source="custom"]')).forEach((row) => row.remove());

  const storedRoutes = getStoredWithdrawnRoutes();
  storedRoutes.forEach((entry) => {
    const row = document.createElement('tr');
    row.dataset.source = 'custom';
    row.classList.add('withdrawn-row--custom');
    const cells = [
      entry.route,
      entry.start,
      entry.end,
      entry.launched,
      entry.withdrawn,
      entry.operator,
      entry.replacedBy
    ];
    cells.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value || '—';
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });

  state.rows = Array.from(tbody.querySelectorAll('tr'));
};

const refreshFromStorage = () => {
  renderStoredRoutes();
  computeStats();
  filterRows(state.searchTerm || '');
};

const initialise = async () => {
  if (!selectors.table) return;
  try {
    await refreshWithdrawnRoutes();
  } catch (error) {
    console.warn('Unable to refresh withdrawn routes before rendering.', error);
  }
  renderStoredRoutes();
  computeStats();
  filterRows('');

  selectors.search?.addEventListener('input', (event) => {
    filterRows(event.target.value || '');
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initialise().catch((error) => {
      console.error('Failed to initialise withdrawn routes view.', error);
    });
  }, { once: true });
} else {
  initialise().catch((error) => {
    console.error('Failed to initialise withdrawn routes view.', error);
  });
}

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEYS.withdrawnRoutes) {
    refreshFromStorage();
  }
});
