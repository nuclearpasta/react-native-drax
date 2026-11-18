type NotFoundRoute = {
  path: string;
  exact?: boolean;
  routes?: NotFoundRoute[];
};

export function isNotFoundLocation(
  pathname: string,
  routes: NotFoundRoute[],
): boolean;
