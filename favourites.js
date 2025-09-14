export function getFavourites(uid) {
  try {
    const data = localStorage.getItem(`favourites_${uid}`);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

export function saveFavourites(uid, favs) {
  localStorage.setItem(`favourites_${uid}`, JSON.stringify(favs));
}

export function addFavourite(uid, fav) {
  const favs = getFavourites(uid);
  if (!favs.some(f => f.id === fav.id)) {
    favs.push(fav);
    saveFavourites(uid, favs);
  }
}

export function removeFavourite(uid, id) {
  const favs = getFavourites(uid).filter(f => f.id !== id);
  saveFavourites(uid, favs);
}
