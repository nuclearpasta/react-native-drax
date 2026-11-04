import {useSyncExternalStore} from 'react';
import type {ClientModule} from '@docusaurus/types';

type RouteArgs = Parameters<NonNullable<ClientModule['onRouteUpdate']>>[0];
type RenderedLocation = RouteArgs['location'];

// Docusaurus keeps the old route on screen until every chunk of the next route
// has loaded. A chunk that never answers only fails after webpack's 120s
// timeout, so the page looks stuck. Load the URL from the server instead, the
// same fallback Docusaurus uses when a chunk fails.
const STALLED_NAVIGATION_MS = 8000;

let stalledNavigationTimer: ReturnType<typeof setTimeout> | undefined;
let renderedLocation: RenderedLocation | undefined;
const listeners = new Set<() => void>();

function clearStalledNavigationTimer() {
  clearTimeout(stalledNavigationTimer);
  stalledNavigationTimer = undefined;
}

export function onRouteUpdate({previousLocation}: RouteArgs): void {
  clearStalledNavigationTimer();
  if (!previousLocation) {
    return;
  }
  stalledNavigationTimer = setTimeout(() => {
    stalledNavigationTimer = undefined;
    window.location.reload();
  }, STALLED_NAVIGATION_MS);
}

export function onRouteDidUpdate({location}: RouteArgs): void {
  clearStalledNavigationTimer();
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
