const assert = require('assert');
const {alternateHref} = require('../src/theme/docsHomeUrl');

const siteUrl = 'https://nuclearpasta.com';
const baseUrl = '/react-native-drax/';
const home = 'https://nuclearpasta.com/react-native-drax';

// Mirror useAlternatePageUtils with trailingSlash: false. applyTrailingSlash
// refuses to strip a pathname that is exactly the baseUrl.
function docusaurusAlternate(pathname) {
  const canonical =
    pathname === '/' || pathname === baseUrl
      ? pathname
      : pathname.replace(/\/$/, '');
  const suffix = canonical.replace(baseUrl, '');
  return `${siteUrl}${baseUrl}${suffix}`;
}

function hreflang(pathname) {
  return alternateHref(docusaurusAlternate(pathname), siteUrl, baseUrl);
}

const homePaths = ['/react-native-drax/', '/react-native-drax'];
for (const pathname of homePaths) {
  assert.strictEqual(
    hreflang(pathname),
    home,
    `home hreflang for ${pathname} was ${hreflang(pathname)}`,
  );
}

assert.strictEqual(
  docusaurusAlternate('/react-native-drax'),
  'https://nuclearpasta.com/react-native-drax//react-native-drax',
);

const unchanged = [
  '/react-native-drax/getting-started',
  '/react-native-drax/guides/drag-handles',
  '/react-native-drax/api/components/drax-view',
  '/react-native-drax/next',
  '/react-native-drax/next/getting-started',
  '/react-native-drax/next/api/components/drax-view',
];
for (const pathname of unchanged) {
  const href = docusaurusAlternate(pathname);
  assert.strictEqual(alternateHref(href, siteUrl, baseUrl), href, pathname);
  assert.ok(!href.includes('//react-native-drax'), pathname);
}

assert.strictEqual(
  alternateHref('https://example.com/docs/', 'https://example.com', '/'),
  'https://example.com/docs/',
);

console.log(
  `docs home hreflang checks passed (${homePaths.length + unchanged.length + 1})`,
);
