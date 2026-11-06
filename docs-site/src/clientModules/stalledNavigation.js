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
 * Resolves once every route component matched for `pathname` has loaded,
 * matching routes exactly like Docusaurus' client preload.js. react-loadable's
 * preload() returns its cached promise for a component that is loading or
 * loaded, so this starts no extra chunk loads.
 */
function whenRouteComponentsLoaded(routes, matchRoutes, pathname) {
  const pathnames = new Set([pathname]);
  try {
    pathnames.add(decodeURI(pathname));
  } catch {
    // A malformed escape only matches as written.
  }
  const matches = Array.from(pathnames).flatMap((p) => matchRoutes(routes, p));
  return Promise.all(
    matches.map((match) => match.route.component?.preload?.()),
  );
}

/**
 * Tracks the route on screen and the one pending, and reloads a pending target
 * that has not rendered after `delayMs`. Docusaurus passes the previous ROUTER
 * location to onRouteUpdate, which may itself still be pending, so decisions
 * compare against the rendered route instead.
 *
 * onRouteDidUpdate alone does not prove a route rendered: PendingNavigation
 * shares one `nextRouteHasLoaded` flag between navigations, so when an earlier
 * target finishes preloading it renders the latest location even if that
 * route's chunks are still loading (react-loadable shows a blank Loading
 * component). `whenRouteLoaded(location)` returns undefined when the route is
 * loaded, or a promise that resolves once its components have loaded; only
 * then does the route count as on screen.
 */
function createStalledNavigationWatcher({
  delayMs,
  setTimer,
  clearTimer,
  getStorage,
  reload,
  whenRouteLoaded,
}) {
  // The route whose content is on screen (not merely committed blank).
  let renderedKey;
  let pendingKey;
  let timer;
  // Only the latest routeDidUpdate may mark its route as rendered.
  let renderSequence = 0;

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

  function markRendered(key) {
    renderedKey = key;
    releaseStalledReload(getStorage(), key);
    // Only the pending target rendering ends its wait.
    if (key === pendingKey) {
      cancel();
    }
  }

  function routeDidUpdate(location) {
    const key = routeKey(location);
    const sequence = ++renderSequence;
    let loaded;
    try {
      loaded = whenRouteLoaded?.(location);
    } catch {
      // Unknown load state: count the route as rendered, as Docusaurus does.
      loaded = undefined;
    }
    if (loaded == null || typeof loaded.then !== 'function') {
      markRendered(key);
      return;
    }
    loaded.then(
      () => {
        if (sequence === renderSequence) {
          markRendered(key);
        }
      },
      // A failed chunk makes Docusaurus reload the page itself.
      () => {},
    );
  }

  return {routeUpdate, routeDidUpdate};
}

module.exports = {
  claimStalledReload,
  createStalledNavigationWatcher,
  releaseStalledReload,
  routeKey,
  whenRouteComponentsLoaded,
};
