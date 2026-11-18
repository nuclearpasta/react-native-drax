const {matchRoutes} = require('react-router-config');

/**
 * Missing /next URLs match the version prefix (exact: false) and never the
 * catch-all that produced 404.html. An exact doc route is a real page.
 * /404.html is the prerendered not-found document.
 */
function isNotFoundLocation(pathname, routes) {
  if (/\/404(?:\.html)?$/.test(pathname)) {
    return true;
  }
  const matches = matchRoutes(routes, pathname);
  return !matches.some((match) => match.route.exact);
}

module.exports = {isNotFoundLocation};
