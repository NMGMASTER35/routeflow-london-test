const normalise = (value) => (typeof value === 'string' ? value.trim() : '');
const toTitleCase = (value) => normalise(value).replace(/\b([a-z])/g, (_, char) => char.toUpperCase());

export function inferFavouriteType(favourite) {
  const explicitType = normalise(favourite?.type);
  if (explicitType) return explicitType;
  const inferredMode = normalise(favourite?.mode || favourite?.category);
  if (inferredMode) return toTitleCase(inferredMode);
  if (normalise(favourite?.lineName) || normalise(favourite?.lineId)) return 'Route';
  if (normalise(favourite?.id) && normalise(favourite?.name)) return 'Stop';
  return 'Favourite';
}

export function resolveFavouriteTitle(favourite) {
  return normalise(favourite?.label)
    || normalise(favourite?.name)
    || normalise(favourite?.title)
    || normalise(favourite?.stopName)
    || normalise(favourite?.value)
    || normalise(favourite?.id)
    || 'Saved favourite';
}

export function buildFavouriteMeta(favourite, title) {
  const metaParts = [];
  const description = normalise(favourite?.description || favourite?.notes);
  if (description) metaParts.push(description);
  const direction = normalise(favourite?.direction || favourite?.towards);
  if (direction) metaParts.push(`Towards ${direction}`);
  const value = normalise(favourite?.value);
  if (value && value !== title) metaParts.push(value);
  const lineName = normalise(favourite?.lineName || favourite?.routeName);
  if (lineName && lineName !== title && lineName !== value) metaParts.push(lineName);
  const platform = normalise(favourite?.stopLetter || favourite?.platformName || favourite?.stopCode);
  if (platform) metaParts.push(`Stop ${platform}`);
  const identifier = normalise(favourite?.id);
  if (identifier && identifier !== title && identifier !== value) metaParts.push(`ID: ${identifier}`);
  return metaParts.filter((part, index) => part && metaParts.indexOf(part) === index);
}
