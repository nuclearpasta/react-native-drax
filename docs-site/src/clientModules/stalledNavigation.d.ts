type RouteLocation = {pathname: string; search: string};
type GuardStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function routeKey(location: RouteLocation): string;
export function shouldWatchNavigation(
  previousLocation: RouteLocation | null | undefined,
  location: RouteLocation,
): boolean;
export function claimStalledReload(
  storage: GuardStorage | undefined,
  target: string,
): boolean;
export function releaseStalledReload(
  storage: GuardStorage | undefined,
  target: string,
): void;
