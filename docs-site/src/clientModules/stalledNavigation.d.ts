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
}): StalledNavigationWatcher;
