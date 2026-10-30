/**
 * Docs home is served at baseUrl without its trailing slash.
 * Docusaurus createUrl() only strips baseUrl when the pathname contains that
 * slash. The unslashed home (`/react-native-drax`) is left intact and prefixed
 * again, which emits `…/react-native-drax//react-native-drax`.
 */
function alternateHref(href, siteUrl, baseUrl) {
  if (baseUrl === '/' || !baseUrl.endsWith('/')) {
    return href;
  }
  const origin = siteUrl.replace(/\/$/, '');
  const unslashedBase = baseUrl.replace(/\/$/, '');
  const home = `${origin}${unslashedBase}`;
  const slashedHome = `${origin}${baseUrl}`;
  if (
    href === home ||
    href === slashedHome ||
    href === `${slashedHome}${unslashedBase}`
  ) {
    return home;
  }
  return href;
}

module.exports = {alternateHref};
