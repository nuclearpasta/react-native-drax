const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  claimStalledReload,
  createStalledNavigationWatcher,
  releaseStalledReload,
  routeKey,
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

const GUARD = 'drax:stalled-reload:';
const blog = '/react-native-drax/blog';

/** setTimeout/clearTimeout driven by advance(), not by real time. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeout(callback, delay) {
      const id = nextId++;
      timers.set(id, {at: now + delay, callback});
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advanceTo(time) {
      for (;;) {
        let due;
        for (const [id, timer] of timers) {
          if (timer.at <= time && (!due || timer.at < due[1].at)) {
            due = [id, timer];
          }
        }
        if (!due) {
          break;
        }
        timers.delete(due[0]);
        now = due[1].at;
        due[1].callback();
      }
      now = time;
    },
    now: () => now,
    pending: () => timers.size,
  };
}

/**
 * Replays Docusaurus' calls: onRouteUpdate gets the previous ROUTER location
 * (possibly still pending), onRouteDidUpdate only fires when a route renders.
 */
function harness(options, makeHooks) {
  // `storage: undefined` means no sessionStorage, so test with `in`.
  const storage = 'storage' in options ? options.storage : memoryStorage();
  const clock = fakeClock();
  const reloads = [];
  const env = {
    clock,
    storage,
    reloads,
    reload: () => reloads.push(clock.now()),
  };
  const hooks = makeHooks
    ? makeHooks(env)
    : (() => {
        const watcher = createStalledNavigationWatcher({
          delayMs: 8000,
          setTimer: clock.setTimeout,
          clearTimer: clock.clearTimeout,
          getStorage: () => storage,
          reload: env.reload,
        });
        return {
          onRouteUpdate: ({previousLocation, location}) =>
            watcher.routeUpdate(previousLocation, location),
          onRouteDidUpdate: ({location}) => watcher.routeDidUpdate(location),
        };
      })();
  let routerLocation = null;
  return {
    ...env,
    hydrate(location) {
      hooks.onRouteUpdate({previousLocation: null, location});
      hooks.onRouteDidUpdate({previousLocation: null, location});
      routerLocation = location;
    },
    navigate(location, at) {
      clock.advanceTo(at);
      const previousLocation = routerLocation;
      routerLocation = location;
      hooks.onRouteUpdate({previousLocation, location});
    },
    render(at, location = routerLocation) {
      clock.advanceTo(at);
      hooks.onRouteDidUpdate({previousLocation: null, location});
    },
    advanceTo: clock.advanceTo,
  };
}

const A = loc(docs);
const B = loc(api);
const C = loc(blog);

function watcherChecks(label, makeHooks) {
  const run = (...storage) =>
    harness(storage.length ? {storage: storage[0]} : {}, makeHooks);

  check(`${label}: hydration arms nothing`, () => {
    const h = run();
    h.hydrate(A);
    assert.strictEqual(h.clock.pending(), 0);
    h.advanceTo(60000);
    assert.deepStrictEqual(h.reloads, []);
  });

  check(`${label}: a navigation that renders does not reload`, () => {
    const h = run();
    h.hydrate(A);
    h.navigate(B, 0);
    h.render(1000);
    h.advanceTo(60000);
    assert.deepStrictEqual(h.reloads, []);
    assert.strictEqual(h.storage.getItem(GUARD + routeKey(B)), null);
  });

  check(`${label}: a stall reloads once at 8s`, () => {
    const h = run();
    h.hydrate(A);
    h.navigate(B, 0);
    h.advanceTo(7999);
    assert.deepStrictEqual(h.reloads, []);
    h.advanceTo(60000);
    assert.deepStrictEqual(h.reloads, [8000]);
    assert.strictEqual(h.storage.getItem(GUARD + routeKey(B)), '1');
  });

  check(`${label}: a repeat click keeps the first timer`, () => {
    const h = run();
    h.hydrate(A);
    h.navigate(B, 0);
    h.navigate(B, 2000);
    h.advanceTo(60000);
    assert.deepStrictEqual(h.reloads, [8000]);
  });

  check(`${label}: a hash push on the pending target keeps the timer`, () => {
    const h = run();
    h.hydrate(A);
    h.navigate(B, 0);
    h.navigate(loc(api, '', '#props'), 2000);
    h.navigate(B, 2500);
    h.advanceTo(60000);
    assert.deepStrictEqual(h.reloads, [8000]);
  });

  check(`${label}: going back to the page on screen cancels`, () => {
    const h = run();
    h.hydrate(A);
    h.navigate(B, 0);
    h.navigate(A, 2000);
    h.render(2000);
    h.advanceTo(60000);
    assert.deepStrictEqual(h.reloads, []);
  });

  check(`${label}: back then forward restarts the timer`, () => {
    const h = run();
    h.hydrate(A);
    h.navigate(B, 0);
    h.navigate(A, 2000);
    h.render(2000);
    h.navigate(B, 2300);
    h.advanceTo(10299);
    assert.deepStrictEqual(h.reloads, []);
    h.advanceTo(60000);
    assert.deepStrictEqual(h.reloads, [10300]);
  });

  check(`${label}: another target replaces the pending one`, () => {
    const h = run();
    h.hydrate(A);
    h.navigate(B, 0);
    h.navigate(C, 3000);
    h.advanceTo(60000);
    assert.deepStrictEqual(h.reloads, [11000]);
    assert.strictEqual(h.storage.getItem(GUARD + routeKey(B)), null);
    assert.strictEqual(h.storage.getItem(GUARD + routeKey(C)), '1');
  });

  check(`${label}: slow render, then hash and same-page arm nothing`, () => {
    const h = run();
    h.hydrate(A);
    h.navigate(B, 0);
    h.render(5000);
    h.navigate(loc(api, '', '#props'), 6000);
    h.navigate(B, 7000);
    assert.strictEqual(h.clock.pending(), 0);
    h.advanceTo(60000);
    assert.deepStrictEqual(h.reloads, []);
  });

  check(`${label}: a second stall after the reload does not loop`, () => {
    const storage = memoryStorage();
    const first = run(storage);
    first.hydrate(A);
    first.navigate(B, 0);
    first.advanceTo(60000);
    assert.deepStrictEqual(first.reloads, [8000]);
    // The reloaded page hydrates A again (the stall was a client navigation).
    const second = run(storage);
    second.hydrate(A);
    second.navigate(B, 0);
    second.advanceTo(60000);
    assert.deepStrictEqual(second.reloads, []);
  });

  check(`${label}: missing or throwing storage never reloads`, () => {
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
    for (const storage of [undefined, throwing]) {
      const h = run(storage);
      assert.doesNotThrow(() => {
        h.hydrate(A);
        h.navigate(B, 0);
        h.advanceTo(60000);
        h.render(61000);
      });
      assert.deepStrictEqual(h.reloads, []);
    }
  });

  check(`${label}: rendering another URL keeps the pending timer`, () => {
    const h = run();
    h.hydrate(A);
    h.navigate(B, 0);
    h.render(1000, C);
    h.advanceTo(60000);
    assert.deepStrictEqual(h.reloads, [8000]);
  });
}

watcherChecks('watcher');

/**
 * Loads the real routeNavigation.ts: transpiled with the installed typescript,
 * run with a stubbed window, './stalledNavigation' resolved to the real file.
 */
function loadRouteNavigation(env) {
  const ts = require(require.resolve('typescript', {
    paths: [path.join(__dirname, '..'), path.join(__dirname, '../..')],
  }));
  const file = path.join(__dirname, '../src/clientModules/routeNavigation.ts');
  const {outputText} = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: file,
  });
  const window = {
    setTimeout: env.clock.setTimeout,
    clearTimeout: env.clock.clearTimeout,
    location: {reload: env.reload},
  };
  Object.defineProperty(window, 'sessionStorage', {
    get() {
      if (env.storage === undefined) {
        throw new Error('SecurityError');
      }
      return env.storage;
    },
  });
  const localRequire = (id) => {
    if (id === './stalledNavigation') {
      return require('../src/clientModules/stalledNavigation');
    }
    if (id === 'react') {
      return {useSyncExternalStore: () => undefined};
    }
    throw new Error(`unexpected require ${id}`);
  };
  const module = {exports: {}};
  vm.runInNewContext(
    `(function (exports, require, module) {${outputText}\n})`,
    {window},
  )(module.exports, localRequire, module);
  return module.exports;
}

watcherChecks('routeNavigation.ts', loadRouteNavigation);

console.log(`stalled navigation checks passed (${checks})`);
