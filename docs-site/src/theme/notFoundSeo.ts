import {useSyncExternalStore} from 'react';

/**
 * SiteMetadata renders above the router, so it cannot see a NotFound context
 * from a child. The NotFound page publishes here, and the head tags subscribe.
 * The server snapshot stays false; the static /404.html path is handled
 * separately so the prerendered file does not wait for an effect.
 */
let notFoundActive = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setNotFoundSeo(active: boolean): void {
  if (notFoundActive === active) {
    return;
  }
  notFoundActive = active;
  listeners.forEach(listener => listener());
}

export function useNotFoundSeo(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => notFoundActive,
    () => false,
  );
}
