export function getRecents(uid) {
  try {
    const data = localStorage.getItem(`recents_${uid}`);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

export function saveRecents(uid, recents) {
  localStorage.setItem(`recents_${uid}`, JSON.stringify(recents));
}

export function addRecent(uid, item) {
  const recents = getRecents(uid);
  // remove existing entry with same id or url if present
  const filtered = recents.filter(r => r.id !== item.id && r.url !== item.url);
  filtered.unshift(item); // add to start
  // keep only last 10
  saveRecents(uid, filtered.slice(0, 10));
}
