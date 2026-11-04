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

/**
 * Tracks the route on screen and the one pending, and reloads a pending target
 * that has not rendered after `delayMs`. Docusaurus passes the previous ROUTER
 * location to onRouteUpdate, which may itself still be pending, so decisions
 * compare against the rendered route instead.
 */
function createStalledNavigationWatcher({
  delayMs,
  setTimer,
  clearTimer,
  getStorage,
  reload,
}) {
  let renderedKey;
  let pendingKey;
  let timer;

  function cancel() {
    if (pendingKey !== undefined) {
      clearTimer(timer);
    }
    pendingKey = undefined;
    timer = undefined;
  }

  function routeUpdate(previousLocation, location) {
    // No previous location is hydration, not a navigation.
    if (previousLocation == null) {
      return;
    }
    const key = routeKey(location);
    // A hash change, the same page, or back to the page on screen loads
    // nothing, and abandons any other pending navigation.
    const onScreen =
      renderedKey !== undefined
        ? key === renderedKey
        : key === routeKey(previousLocation);
    if (onScreen) {
      cancel();
      return;
    }
    // A repeat click or a hash push on the pending target does not restart
    // the wait: the reload stays due from the first navigation.
    if (key === pendingKey) {
      return;
    }
    cancel();
    pendingKey = key;
    timer = setTimer(() => {
      pendingKey = undefined;
      timer = undefined;
      if (claimStalledReload(getStorage(), key)) {
        reload();
      }
    }, delayMs);
  }

  function routeDidUpdate(location) {
    const key = routeKey(location);
    renderedKey = key;
    releaseStalledReload(getStorage(), key);
    // Only the pending target rendering ends its wait.
    if (key === pendingKey) {
      cancel();
    }
  }

  return {routeUpdate, routeDidUpdate};
}

module.exports = {
  claimStalledReload,
  createStalledNavigationWatcher,
  releaseStalledReload,
  routeKey,
};
