const assert = require('assert');
const {isNotFoundLocation} = require('../src/theme/notFoundRoute');

// Same shape as the generated docs routes: /next is a non-exact parent,
// real docs are exact, and the catch-all is last.
const routes = [
  {path: '/react-native-drax/', exact: true},
  {
    path: '/react-native-drax/',
    routes: [
      {
        path: '/react-native-drax/next',
        routes: [
          {
            path: '/react-native-drax/next',
            routes: [
              {path: '/react-native-drax/next', exact: true},
              {path: '/react-native-drax/next/getting-started', exact: true},
              {
                path: '/react-native-drax/next/api/components/drax-view',
                exact: true,
              },
            ],
          },
        ],
      },
      {
        path: '/react-native-drax/',
        routes: [
          {
            path: '/react-native-drax/',
            routes: [
              {path: '/react-native-drax/getting-started', exact: true},
              {
                path: '/react-native-drax/api/components/drax-view',
                exact: true,
              },
            ],
          },
        ],
      },
    ],
  },
  {path: '*'},
];

const cases = [
  ['/react-native-drax/next/nope', true],
  ['/react-native-drax/next/api/nope', true],
  ['/react-native-drax/does-not-exist', true],
  ['/react-native-drax/guides/nope/deeper', true],
  ['/react-native-drax/404.html', true],
  ['/react-native-drax/404', true],
  ['/react-native-drax/', false],
  ['/react-native-drax/getting-started', false],
  ['/react-native-drax/api/components/drax-view', false],
  ['/react-native-drax/next', false],
  ['/react-native-drax/next/getting-started', false],
  ['/react-native-drax/next/api/components/drax-view', false],
];

for (const [pathname, expected] of cases) {
  assert.strictEqual(
    isNotFoundLocation(pathname, routes),
    expected,
    pathname,
  );
}

console.log(`not-found route checks passed (${cases.length})`);
