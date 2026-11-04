/**
 * Decisions for the stalled-navigation reload in routeNavigation.ts. Kept in
 * plain JS so scripts/check-stalled-navigation.cjs can test them with node.
 */
const RELOAD_GUARD_PREFIX = 'drax:stalled-reload:';

/** A navigation target without its hash: hash changes never load a route. */
function routeKey(location) {
  return `${location.pathname}${location.search}`;
}

/**
 * Only a navigation to another pathname or query loads new route chunks. The
 * first render (no previous location) is hydration, not a navigation.
 */
function shouldWatchNavigation(previousLocation, location) {
  return (
    previousLocation != null &&
    routeKey(previousLocation) !== routeKey(location)
  );
}

/**
 * Records a reload for `target` and returns true, at most once until
 * releaseStalledReload(target). Returns false when storage is unavailable, so
 * a reload that cannot be recorded never happens and cannot loop.
 */
function claimStalledReload(storage, target) {
  if (!storage) {
    return false;
  }
  const key = RELOAD_GUARD_PREFIX + target;
  try {
    if (storage.getItem(key) !== null) {
      return false;
    }
    storage.setItem(key, '1');
    return storage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/** `target` rendered, so a later stall on it may reload again. */
function releaseStalledReload(storage, target) {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(RELOAD_GUARD_PREFIX + target);
  } catch {
    // Nothing was recorded if storage throws.
  }
}

module.exports = {
  claimStalledReload,
  releaseStalledReload,
  routeKey,
  shouldWatchNavigation,
};
