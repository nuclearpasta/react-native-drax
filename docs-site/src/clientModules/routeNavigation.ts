import {useSyncExternalStore} from 'react';
import type {ClientModule} from '@docusaurus/types';
import {
  claimStalledReload,
  releaseStalledReload,
  routeKey,
  shouldWatchNavigation,
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
const STALLED_NAVIGATION_MS = 8000;

let stalledNavigationTimer: ReturnType<typeof setTimeout> | undefined;
let renderedLocation: RenderedLocation | undefined;
const listeners = new Set<() => void>();

function clearStalledNavigationTimer() {
  clearTimeout(stalledNavigationTimer);
  stalledNavigationTimer = undefined;
}

function sessionStorageOrUndefined(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function onRouteUpdate({previousLocation, location}: RouteArgs): void {
  clearStalledNavigationTimer();
  if (!shouldWatchNavigation(previousLocation, location)) {
    return;
  }
  const target = routeKey(location);
  stalledNavigationTimer = setTimeout(() => {
    stalledNavigationTimer = undefined;
    if (claimStalledReload(sessionStorageOrUndefined(), target)) {
      window.location.reload();
    }
  }, STALLED_NAVIGATION_MS);
}

export function onRouteDidUpdate({location}: RouteArgs): void {
  clearStalledNavigationTimer();
  releaseStalledReload(sessionStorageOrUndefined(), routeKey(location));
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
