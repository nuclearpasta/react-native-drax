type RouteLocation = {pathname: string; search: string};
type GuardStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function routeKey(location: RouteLocation): string;
export function claimStalledReload(
  storage: GuardStorage | undefined,
  target: string,
): boolean;
export function releaseStalledReload(
  storage: GuardStorage | undefined,
  target: string,
): void;

export type StalledNavigationWatcher = {
  routeUpdate(
    previousLocation: RouteLocation | null | undefined,
    location: RouteLocation,
  ): void;
  routeDidUpdate(location: RouteLocation): void;
};

export function createStalledNavigationWatcher<Timer>(options: {
  delayMs: number;
  setTimer: (callback: () => void, delayMs: number) => Timer;
  clearTimer: (timer: Timer | undefined) => void;
  getStorage: () => GuardStorage | undefined;
  reload: () => void;
  /**
   * Undefined when the route's components are loaded, else a promise that
   * resolves once they are. The route only counts as rendered after that.
   */
  whenRouteLoaded?: (location: RouteLocation) => PromiseLike<unknown> | undefined;
}): StalledNavigationWatcher;

export function whenRouteComponentsLoaded<Route>(
  routes: Route[],
  matchRoutes: (
    routes: Route[],
    pathname: string,
  ) => {route: {component?: unknown}}[],
  pathname: string,
): Promise<unknown[]>;
