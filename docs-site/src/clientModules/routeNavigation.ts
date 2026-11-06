import {useSyncExternalStore} from 'react';
import type {ClientModule} from '@docusaurus/types';
import routes from '@generated/routes';
import {matchRoutes} from 'react-router-config';
import {
  createStalledNavigationWatcher,
  whenRouteComponentsLoaded,
} from './stalledNavigation';

type RouteArgs = Parameters<NonNullable<ClientModule['onRouteUpdate']>>[0];
type RenderedLocation = RouteArgs['location'];

// Docusaurus keeps the old route on screen until every chunk of the next route
// has loaded. A chunk that never answers only fails after webpack's 120s
// timeout, so the page looks stuck. Load the URL from the server instead, the
// same fallback Docusaurus uses when a chunk fails.
//
// Reload a URL at most once: a sessionStorage entry per pathname+search marks
// the reload, and is removed when that URL renders. If the reloaded page stalls
// on the same URL again before rendering it, Docusaurus' own behaviour applies.
// Without sessionStorage there is no record, so there is no reload either.
//
// A URL counts as rendered only once its route components have loaded:
// PendingNavigation can commit the latest location while its chunks are still
// loading (a blank page), and still fires onRouteDidUpdate for it.
const STALLED_NAVIGATION_MS = 8000;

let renderedLocation: RenderedLocation | undefined;
const listeners = new Set<() => void>();

function sessionStorageOrUndefined(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

const stalledNavigation = createStalledNavigationWatcher({
  delayMs: STALLED_NAVIGATION_MS,
  setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimer: (timer) => window.clearTimeout(timer),
  getStorage: sessionStorageOrUndefined,
  reload: () => window.location.reload(),
  whenRouteLoaded: (location) =>
    whenRouteComponentsLoaded(routes, matchRoutes, location.pathname),
});

export function onRouteUpdate({previousLocation, location}: RouteArgs): void {
  stalledNavigation.routeUpdate(previousLocation, location);
}

export function onRouteDidUpdate({location}: RouteArgs): void {
  stalledNavigation.routeDidUpdate(location);
  renderedLocation = location;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The location the page content shows. During a navigation the router already
 * has the next URL while the old route stays on screen. Undefined until the
 * first route renders, and on the server.
 */
export function useRenderedLocation(): RenderedLocation | undefined {
  return useSyncExternalStore(
    subscribe,
    () => renderedLocation,
    () => undefined,
  );
}
