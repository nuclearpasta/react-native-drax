const assert = require('assert');
const {
  claimStalledReload,
  releaseStalledReload,
  routeKey,
  shouldWatchNavigation,
} = require('../src/clientModules/stalledNavigation');

function loc(pathname, search = '', hash = '') {
  return {pathname, search, hash};
}

function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
    size: () => items.size,
  };
}

let checks = 0;
function check(_name, fn) {
  fn();
  checks += 1;
}

const docs = '/react-native-drax/getting-started';
const api = '/react-native-drax/api/components/drax-view';

check('route key drops the hash', () => {
  assert.strictEqual(routeKey(loc(docs, '?a=1', '#install')), `${docs}?a=1`);
});

check('hydration is not watched', () => {
  assert.strictEqual(shouldWatchNavigation(null, loc(docs)), false);
  assert.strictEqual(shouldWatchNavigation(undefined, loc(docs)), false);
});

check('hash-only and same-page navigations are not watched', () => {
  assert.strictEqual(
    shouldWatchNavigation(loc(docs), loc(docs, '', '#install')),
    false,
  );
  assert.strictEqual(
    shouldWatchNavigation(loc(docs, '', '#a'), loc(docs, '', '#b')),
    false,
  );
  assert.strictEqual(shouldWatchNavigation(loc(docs), loc(docs)), false);
});

check('pathname or query changes are watched', () => {
  assert.strictEqual(shouldWatchNavigation(loc(docs), loc(api)), true);
  assert.strictEqual(shouldWatchNavigation(loc(docs), loc(docs, '?q=1')), true);
});

check('one reload per target until it renders', () => {
  const storage = memoryStorage();
  assert.strictEqual(claimStalledReload(storage, api), true);
  assert.strictEqual(claimStalledReload(storage, api), false);
  assert.strictEqual(claimStalledReload(storage, docs), true);
  releaseStalledReload(storage, api);
  assert.strictEqual(claimStalledReload(storage, api), true);
  assert.strictEqual(claimStalledReload(storage, api), false);
});

check('rendering another URL keeps the guard', () => {
  const storage = memoryStorage();
  assert.strictEqual(claimStalledReload(storage, api), true);
  releaseStalledReload(storage, docs);
  assert.strictEqual(claimStalledReload(storage, api), false);
});

check('no storage means no reload', () => {
  assert.strictEqual(claimStalledReload(undefined, api), false);
  assert.doesNotThrow(() => releaseStalledReload(undefined, api));
  const throwing = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('SecurityError');
    },
    removeItem() {
      throw new Error('SecurityError');
    },
  };
  assert.strictEqual(claimStalledReload(throwing, api), false);
  assert.doesNotThrow(() => releaseStalledReload(throwing, api));
});

check('a write that does not persist means no reload', () => {
  const quotaFull = {
    ...memoryStorage(),
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  assert.strictEqual(claimStalledReload(quotaFull, api), false);
  const dropsWrites = {...memoryStorage(), setItem() {}};
  assert.strictEqual(claimStalledReload(dropsWrites, api), false);
});

console.log(`stalled navigation checks passed (${checks})`);
