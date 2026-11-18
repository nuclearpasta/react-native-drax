const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  claimStalledReload,
  createStalledNavigationWatcher,
  releaseStalledReload,
  routeKey,
  whenRouteComponentsLoaded,
} = require('../src/clientModules/stalledNavigation');

const docsSite = path.join(__dirname, '..');
const fromDocsSite = (id) =>
  require(
    require.resolve(id, { paths: [docsSite, path.join(docsSite, '..')] })
  );

function loc(pathname, search = '', hash = '') {
  return { pathname, search, hash };
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

/** Lets every queued promise reaction run (chunk loads, preload, setState). */
function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

let checks = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    checks += 1;
  } catch (error) {
    failures.push({ name, error });
  }
}

const docs = '/react-native-drax/getting-started';
const api = '/react-native-drax/api/components/drax-view';

async function unitChecks() {
  await check('route key drops the hash', () => {
    assert.strictEqual(routeKey(loc(docs, '?a=1', '#install')), `${docs}?a=1`);
  });

  await check('one reload per target until it renders', () => {
    const storage = memoryStorage();
    assert.strictEqual(claimStalledReload(storage, api), true);
    assert.strictEqual(claimStalledReload(storage, api), false);
    assert.strictEqual(claimStalledReload(storage, docs), true);
    releaseStalledReload(storage, api);
    assert.strictEqual(claimStalledReload(storage, api), true);
    assert.strictEqual(claimStalledReload(storage, api), false);
  });

  await check('rendering another URL keeps the guard', () => {
    const storage = memoryStorage();
    assert.strictEqual(claimStalledReload(storage, api), true);
    releaseStalledReload(storage, docs);
    assert.strictEqual(claimStalledReload(storage, api), false);
  });

  await check('no storage means no reload', () => {
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

  await check('a write that does not persist means no reload', () => {
    const quotaFull = {
      ...memoryStorage(),
      setItem() {
        throw new Error('QuotaExceededError');
      },
    };
    assert.strictEqual(claimStalledReload(quotaFull, api), false);
    const dropsWrites = { ...memoryStorage(), setItem() {} };
    assert.strictEqual(claimStalledReload(dropsWrites, api), false);
  });
}

const GUARD = 'drax:stalled-reload:';
const blog = '/react-native-drax/blog';

/**
 * setTimeout/clearTimeout driven by advanceTo(), not by real time. Promise
 * reactions queued by a timer run before the next timer fires.
 */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeout(callback, delay) {
      const id = nextId++;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    async advanceTo(time) {
      await flush();
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
        await flush();
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
          whenRouteLoaded: options.whenRouteLoaded,
        });
        return {
          onRouteUpdate: ({ previousLocation, location }) =>
            watcher.routeUpdate(previousLocation, location),
          onRouteDidUpdate: ({ location }) => watcher.routeDidUpdate(location),
        };
      })();
  let routerLocation = null;
  return {
    ...env,
    async hydrate(location) {
      hooks.onRouteUpdate({ previousLocation: null, location });
      hooks.onRouteDidUpdate({ previousLocation: null, location });
      routerLocation = location;
      await flush();
    },
    async navigate(location, at) {
      await clock.advanceTo(at);
      const previousLocation = routerLocation;
      routerLocation = location;
      hooks.onRouteUpdate({ previousLocation, location });
      await flush();
    },
    async render(at, location = routerLocation) {
      await clock.advanceTo(at);
      hooks.onRouteDidUpdate({ previousLocation: null, location });
      await flush();
    },
    advanceTo: clock.advanceTo,
  };
}

const A = loc(docs);
const B = loc(api);
const C = loc(blog);

async function watcherChecks(label, makeHooks) {
  const run = (...storage) =>
    harness(storage.length ? { storage: storage[0] } : {}, makeHooks);

  await check(`${label}: hydration arms nothing`, async () => {
    const h = run();
    await h.hydrate(A);
    assert.strictEqual(h.clock.pending(), 0);
    await h.advanceTo(60000);
    assert.deepStrictEqual(h.reloads, []);
  });

  await check(
    `${label}: a navigation that renders does not reload`,
    async () => {
      const h = run();
      await h.hydrate(A);
      await h.navigate(B, 0);
      await h.render(1000);
      await h.advanceTo(60000);
      assert.deepStrictEqual(h.reloads, []);
      assert.strictEqual(h.storage.getItem(GUARD + routeKey(B)), null);
    }
  );

  await check(`${label}: a stall reloads once at 8s`, async () => {
    const h = run();
    await h.hydrate(A);
    await h.navigate(B, 0);
    await h.advanceTo(7999);
    assert.deepStrictEqual(h.reloads, []);
    await h.advanceTo(60000);
    assert.deepStrictEqual(h.reloads, [8000]);
    assert.strictEqual(h.storage.getItem(GUARD + routeKey(B)), '1');
  });

  await check(`${label}: a repeat click keeps the first timer`, async () => {
    const h = run();
    await h.hydrate(A);
    await h.navigate(B, 0);
    await h.navigate(B, 2000);
    await h.advanceTo(60000);
    assert.deepStrictEqual(h.reloads, [8000]);
  });

  await check(
    `${label}: a hash push on the pending target keeps the timer`,
    async () => {
      const h = run();
      await h.hydrate(A);
      await h.navigate(B, 0);
      await h.navigate(loc(api, '', '#props'), 2000);
      await h.navigate(B, 2500);
      await h.advanceTo(60000);
      assert.deepStrictEqual(h.reloads, [8000]);
    }
  );

  await check(
    `${label}: going back to the page on screen cancels`,
    async () => {
      const h = run();
      await h.hydrate(A);
      await h.navigate(B, 0);
      await h.navigate(A, 2000);
      await h.render(2000);
      await h.advanceTo(60000);
      assert.deepStrictEqual(h.reloads, []);
    }
  );

  await check(`${label}: back then forward restarts the timer`, async () => {
    const h = run();
    await h.hydrate(A);
    await h.navigate(B, 0);
    await h.navigate(A, 2000);
    await h.render(2000);
    await h.navigate(B, 2300);
    await h.advanceTo(10299);
    assert.deepStrictEqual(h.reloads, []);
    await h.advanceTo(60000);
    assert.deepStrictEqual(h.reloads, [10300]);
  });

  await check(`${label}: another target replaces the pending one`, async () => {
    const h = run();
    await h.hydrate(A);
    await h.navigate(B, 0);
    await h.navigate(C, 3000);
    await h.advanceTo(60000);
    assert.deepStrictEqual(h.reloads, [11000]);
    assert.strictEqual(h.storage.getItem(GUARD + routeKey(B)), null);
    assert.strictEqual(h.storage.getItem(GUARD + routeKey(C)), '1');
  });

  await check(
    `${label}: slow render, then hash and same-page arm nothing`,
    async () => {
      const h = run();
      await h.hydrate(A);
      await h.navigate(B, 0);
      await h.render(5000);
      await h.navigate(loc(api, '', '#props'), 6000);
      await h.navigate(B, 7000);
      assert.strictEqual(h.clock.pending(), 0);
      await h.advanceTo(60000);
      assert.deepStrictEqual(h.reloads, []);
    }
  );

  await check(
    `${label}: a second stall after the reload does not loop`,
    async () => {
      const storage = memoryStorage();
      const first = run(storage);
      await first.hydrate(A);
      await first.navigate(B, 0);
      await first.advanceTo(60000);
      assert.deepStrictEqual(first.reloads, [8000]);
      // The reloaded page hydrates A again (the stall was a client navigation).
      const second = run(storage);
      await second.hydrate(A);
      await second.navigate(B, 0);
      await second.advanceTo(60000);
      assert.deepStrictEqual(second.reloads, []);
    }
  );

  await check(
    `${label}: missing or throwing storage never reloads`,
    async () => {
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
        await h.hydrate(A);
        await h.navigate(B, 0);
        await h.advanceTo(60000);
        await h.render(61000);
        assert.deepStrictEqual(h.reloads, []);
      }
    }
  );

  await check(
    `${label}: rendering another URL keeps the pending timer`,
    async () => {
      const h = run();
      await h.hydrate(A);
      await h.navigate(B, 0);
      await h.render(1000, C);
      await h.advanceTo(60000);
      assert.deepStrictEqual(h.reloads, [8000]);
    }
  );
}

/**
 * whenRouteLoaded for the pure watcher: a route is loaded unless listed in
 * `loading`, and then loads when the check calls loaded(key) or failed(key).
 */
function routeLoads(...loadingKeys) {
  const deferred = new Map();
  for (const key of loadingKeys) {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    deferred.set(key, { promise, resolve, reject, done: false });
  }
  return {
    whenRouteLoaded(location) {
      const entry = deferred.get(routeKey(location));
      return entry && !entry.done ? entry.promise : undefined;
    },
    loaded(key) {
      deferred.get(key).done = true;
      deferred.get(key).resolve();
    },
    failed(key) {
      deferred.get(key).done = true;
      deferred.get(key).reject(new Error('ChunkLoadError'));
    },
  };
}

async function loadingChecks() {
  // PendingNavigation's race: B finishes preloading at 1000 and renders C,
  // whose chunks are still loading. onRouteDidUpdate(C) fires anyway.
  await check(
    'loading: a blank render of the target keeps its timer',
    async () => {
      const loads = routeLoads(routeKey(C));
      const h = harness({ whenRouteLoaded: loads.whenRouteLoaded });
      await h.hydrate(A);
      await h.navigate(B, 0);
      await h.navigate(C, 400);
      await h.render(1000, C);
      await h.advanceTo(8399);
      assert.deepStrictEqual(h.reloads, []);
      await h.advanceTo(60000);
      assert.deepStrictEqual(h.reloads, [8400]);
      assert.strictEqual(h.storage.getItem(GUARD + routeKey(C)), '1');
    }
  );

  await check(
    'loading: the target loading after a blank render cancels',
    async () => {
      const loads = routeLoads(routeKey(C));
      const h = harness({ whenRouteLoaded: loads.whenRouteLoaded });
      h.storage.setItem(GUARD + routeKey(C), '1');
      await h.hydrate(A);
      await h.navigate(B, 0);
      await h.navigate(C, 400);
      await h.render(1000, C);
      // The guard is only released once C's content is on screen.
      assert.strictEqual(h.storage.getItem(GUARD + routeKey(C)), '1');
      await h.advanceTo(3000);
      loads.loaded(routeKey(C));
      await flush();
      assert.strictEqual(h.clock.pending(), 0);
      assert.strictEqual(h.storage.getItem(GUARD + routeKey(C)), null);
      await h.advanceTo(60000);
      assert.deepStrictEqual(h.reloads, []);
      // C is on screen now: a hash push on it arms nothing.
      await h.navigate(loc(blog, '', '#top'), 61000);
      assert.strictEqual(h.clock.pending(), 0);
    }
  );

  await check(
    'loading: repeat pushes of a blank target keep the timer',
    async () => {
      const loads = routeLoads(routeKey(C));
      const h = harness({ whenRouteLoaded: loads.whenRouteLoaded });
      await h.hydrate(A);
      await h.navigate(B, 0);
      await h.navigate(C, 400);
      await h.render(1000, C);
      await h.navigate(C, 2000);
      await h.navigate(loc(blog, '', '#top'), 2500);
      await h.navigate(C, 3000);
      await h.advanceTo(60000);
      assert.deepStrictEqual(h.reloads, [8400]);
    }
  );

  await check(
    'loading: back to the loaded page from a blank target cancels',
    async () => {
      const loads = routeLoads(routeKey(C));
      const h = harness({ whenRouteLoaded: loads.whenRouteLoaded });
      await h.hydrate(A);
      await h.navigate(B, 0);
      await h.navigate(C, 400);
      await h.render(1000, C);
      await h.navigate(A, 2000);
      assert.strictEqual(h.clock.pending(), 0);
      await h.render(2100, A);
      await h.advanceTo(60000);
      assert.deepStrictEqual(h.reloads, []);
    }
  );

  await check(
    'loading: a stale load never overrides a newer render',
    async () => {
      const loads = routeLoads(routeKey(C));
      const h = harness({ whenRouteLoaded: loads.whenRouteLoaded });
      await h.hydrate(A);
      await h.navigate(B, 0);
      await h.navigate(C, 400);
      await h.render(1000, C);
      await h.navigate(A, 2000);
      await h.render(2100, A);
      // C finishes loading after A replaced it on screen.
      await h.advanceTo(3000);
      loads.loaded(routeKey(C));
      await flush();
      // A, not C, is on screen: navigating to C is a real navigation again.
      await h.navigate(C, 4000);
      assert.strictEqual(h.clock.pending(), 1);
      await h.advanceTo(60000);
      assert.deepStrictEqual(h.reloads, [12000]);
    }
  );

  await check('loading: a failed load is ignored', async () => {
    const loads = routeLoads(routeKey(C));
    const h = harness({ whenRouteLoaded: loads.whenRouteLoaded });
    await h.hydrate(A);
    await h.navigate(C, 0);
    await h.render(1000, C);
    loads.failed(routeKey(C));
    await flush();
    await h.advanceTo(60000);
    assert.deepStrictEqual(h.reloads, [8000]);
  });

  await check(
    'loading: a throwing whenRouteLoaded counts as loaded',
    async () => {
      const h = harness({
        whenRouteLoaded() {
          throw new Error('broken matcher');
        },
      });
      await h.hydrate(A);
      await h.navigate(B, 0);
      await h.render(1000);
      assert.strictEqual(h.clock.pending(), 0);
      await h.advanceTo(60000);
      assert.deepStrictEqual(h.reloads, []);
    }
  );

  await check(
    'route components: matched like Docusaurus preload.js',
    async () => {
      const preloaded = [];
      const component = (name) => ({
        preload: () => {
          preloaded.push(name);
          return Promise.resolve(name);
        },
      });
      const routes = [
        { path: '/a b', component: component('encoded') },
        { path: '/a%20b', component: component('raw') },
        { path: '/plain', component: () => null },
      ];
      const seen = [];
      const matchRoutes = (_routes, pathname) => {
        seen.push(pathname);
        return routes
          .filter((route) => route.path === pathname)
          .map((route) => ({ route }));
      };
      assert.deepStrictEqual(
        await whenRouteComponentsLoaded(routes, matchRoutes, '/a%20b'),
        ['raw', 'encoded']
      );
      assert.deepStrictEqual(seen, ['/a%20b', '/a b']);
      assert.deepStrictEqual(
        await whenRouteComponentsLoaded(routes, matchRoutes, '/plain'),
        [undefined]
      );
      // A malformed escape cannot be decoded and only matches as written.
      seen.length = 0;
      assert.deepStrictEqual(
        await whenRouteComponentsLoaded(routes, matchRoutes, '/%E0%A4%A'),
        []
      );
      assert.deepStrictEqual(seen, ['/%E0%A4%A']);
      assert.deepStrictEqual(preloaded, ['raw', 'encoded']);
    }
  );
}

/**
 * Transpiles ESM (and JSX, React classic runtime) with the installed
 * typescript and runs it as CommonJS with `resolve` for its imports.
 */
function loadModule(file, resolve, window, document = undefined) {
  const ts = fromDocsSite('typescript');
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
    fileName: file.replace(/\.js$/, '.jsx'),
  });
  const module = { exports: {} };
  vm.runInThisContext(
    `(function (exports, require, module, window, document) {${outputText}\n})`,
    { filename: file }
  )(module.exports, resolve, module, window, document);
  return module.exports;
}

const esModule = (value) => ({ __esModule: true, default: value });

function stubWindow(env) {
  const window = {
    setTimeout: env.clock.setTimeout,
    clearTimeout: env.clock.clearTimeout,
    location: { reload: env.reload },
    scrollTo() {},
  };
  Object.defineProperty(window, 'sessionStorage', {
    get() {
      if (env.storage === undefined) {
        throw new Error('SecurityError');
      }
      return env.storage;
    },
  });
  return window;
}

/**
 * Loads the real routeNavigation.ts with a stubbed window, './stalledNavigation'
 * resolved to the real file, `routes` as @generated/routes and the real
 * react-router-config.
 */
function loadRouteNavigation(
  env,
  { routes = [], window = stubWindow(env) } = {}
) {
  const resolve = (id) => {
    if (id === './stalledNavigation') {
      return require('../src/clientModules/stalledNavigation');
    }
    if (id === 'react') {
      return { useSyncExternalStore: () => undefined };
    }
    if (id === '@generated/routes') {
      return esModule(routes);
    }
    if (id === 'react-router-config') {
      return fromDocsSite('react-router-config');
    }
    throw new Error(`unexpected require ${id}`);
  };
  return loadModule(
    path.join(__dirname, '../src/clientModules/routeNavigation.ts'),
    resolve,
    window
  );
}

/**
 * Runs Docusaurus' own PendingNavigation, ClientLifecyclesDispatcher and
 * preload (from node_modules/@docusaurus/core) with routes whose components are
 * real react-loadable components, and the real routeNavigation.ts as the only
 * client module. No DOM renderer is installed, so a small driver plays React's
 * part for the one class component:
 * - new props: shouldComponentUpdate(nextProps, nextState), then props and
 *   state are assigned even when it returns false (as React does);
 * - setState merges into the next state and re-runs shouldComponentUpdate
 *   with the current props; a setState made during shouldComponentUpdate is
 *   processed after it, as a separate update;
 * - a commit renders the tree (ClientLifecyclesDispatcher, then the controlled
 *   <Route>, whose content is blank while any matched loadable has not loaded)
 *   and runs the layout effect when its deps changed.
 * `pages` maps a pathname to when its chunk loads (ms on the fake clock;
 * Infinity never loads).
 */
function docusaurusApp(env, pages) {
  const React = fromDocsSite('react');
  const Loadable = fromDocsSite('react-loadable');
  const { matchRoutes } = fromDocsSite('react-router-config');
  const { clock } = env;
  const page = (loadAt) =>
    Loadable({
      loader: () =>
        new Promise((resolve) => {
          if (loadAt !== Infinity) {
            clock.setTimeout(
              () => resolve({ default: () => null }),
              Math.max(0, loadAt - clock.now())
            );
          }
        }),
      loading: () => null,
    });
  const routes = [
    {
      path: '/react-native-drax',
      component: page(0),
      routes: Object.entries(pages).map(([pathname, loadAt]) => ({
        path: pathname,
        exact: true,
        component: page(loadAt),
      })),
    },
  ];

  const window = stubWindow(env);
  const document = { getElementById: () => null };
  const routeNavigation = loadRouteNavigation(env, { routes, window });
  let layoutEffect;
  const Route = () => null;
  const client = path.join(
    docsSite,
    'node_modules/@docusaurus/core/lib/client'
  );
  const modules = {};
  const resolve = (id) => {
    switch (id) {
      case 'react':
        return React;
      case 'react-router-dom':
        return { Route };
      case 'react-router-config':
        return fromDocsSite('react-router-config');
      case '@generated/routes':
        return esModule(routes);
      case '@generated/client-modules':
        return esModule([routeNavigation]);
      case './exports/ExecutionEnvironment':
        return esModule({ canUseDOM: true });
      case './exports/useIsomorphicLayoutEffect':
        return esModule((effect, deps) => {
          layoutEffect = { effect, deps };
        });
      case './preload':
      case './ClientLifecyclesDispatcher':
        return modules[id];
      default:
        throw new Error(`unexpected require ${id}`);
    }
  };
  const load = (name) =>
    loadModule(path.join(client, `${name}.js`), resolve, window, document);
  modules['./preload'] = load('preload');
  modules['./ClientLifecyclesDispatcher'] = load('ClientLifecyclesDispatcher');
  const PendingNavigation = load('PendingNavigation').default;

  const commits = [];
  let instance;
  let committedDeps;
  let updating = false;
  const queue = [];

  function commit() {
    const dispatcher = instance.render();
    const route = dispatcher.type(dispatcher.props);
    assert.strictEqual(route.type, Route);
    const { location } = route.props;
    route.props.render();
    const blank = matchRoutes(routes, location.pathname).some(
      (match) => new match.route.component({}).state.loaded == null
    );
    commits.push({ at: clock.now(), location, blank });
    const { effect, deps } = layoutEffect;
    if (
      !committedDeps ||
      deps.some((dep, index) => !Object.is(dep, committedDeps[index]))
    ) {
      committedDeps = deps;
      effect();
    }
  }

  function update(nextProps) {
    updating = true;
    const nextState = Object.assign({}, instance.state, ...queue.splice(0));
    const shouldUpdate = instance.shouldComponentUpdate(nextProps, nextState);
    instance.props = nextProps;
    instance.state = nextState;
    updating = false;
    if (shouldUpdate) {
      commit();
    }
    if (queue.length) {
      update(instance.props);
    }
  }

  const updater = {
    isMounted: () => true,
    enqueueSetState(_instance, partialState) {
      queue.push(partialState);
      if (!updating) {
        update(instance.props);
      }
    },
    enqueueReplaceState() {
      throw new Error('unexpected replaceState');
    },
    enqueueForceUpdate() {
      throw new Error('unexpected forceUpdate');
    },
  };

  return {
    commits,
    routes,
    isLoaded: (pathname) =>
      matchRoutes(routes, pathname).every(
        (match) => new match.route.component({}).state.loaded != null
      ),
    async hydrate(location) {
      // clientEntry preloads the first route before hydrating.
      const preloaded = modules['./preload'].default(location.pathname);
      await clock.advanceTo(clock.now());
      await preloaded;
      instance = new PendingNavigation({ location, children: null });
      instance.updater = updater;
      commit();
      await flush();
    },
    async navigate(location, at) {
      await clock.advanceTo(at);
      update({ ...instance.props, location });
      await flush();
    },
  };
}

async function docusaurusChecks() {
  const run = (pages) => {
    const h = harness({}, () => ({}));
    return { h, app: docusaurusApp(h, pages) };
  };

  await check(
    'docusaurus: a navigation that loads renders and does not reload',
    async () => {
      const { h, app } = run({ [docs]: 0, [api]: 1000 });
      await app.hydrate(A);
      await app.navigate(B, 0);
      await h.advanceTo(60000);
      assert.deepStrictEqual(
        app.commits.map(({ at, location, blank }) => [
          at,
          location.pathname,
          blank,
        ]),
        [
          [0, docs, false],
          [1000, api, false],
        ]
      );
      assert.deepStrictEqual(h.reloads, []);
      assert.strictEqual(h.storage.getItem(GUARD + routeKey(B)), null);
    }
  );

  await check(
    'docusaurus: a slow (5s) navigation does not reload',
    async () => {
      const { h, app } = run({ [docs]: 0, [api]: 5000 });
      await app.hydrate(A);
      await app.navigate(B, 0);
      await h.advanceTo(60000);
      assert.strictEqual(app.commits.length, 2);
      assert.deepStrictEqual(h.reloads, []);
    }
  );

  await check(
    'docusaurus: a stalled navigation reloads once at 8s',
    async () => {
      const { h, app } = run({ [docs]: 0, [blog]: Infinity });
      await app.hydrate(A);
      await app.navigate(C, 0);
      await h.advanceTo(60000);
      assert.strictEqual(app.commits.length, 1);
      assert.deepStrictEqual(h.reloads, [8000]);
    }
  );

  await check(
    'docusaurus: a target rendered before its chunks load reloads',
    async () => {
      const { h, app } = run({ [docs]: 0, [api]: 1000, [blog]: Infinity });
      await app.hydrate(A);
      await app.navigate(B, 0);
      await app.navigate(C, 400);
      await h.advanceTo(1000);
      // Docusaurus' race: B's preload resolving renders C, which is not loaded.
      assert.deepStrictEqual(
        app.commits.map(({ at, location, blank }) => [
          at,
          location.pathname,
          blank,
        ]),
        [
          [0, docs, false],
          [1000, blog, true],
        ]
      );
      assert.strictEqual(app.isLoaded(blog), false);
      await h.advanceTo(8399);
      assert.deepStrictEqual(h.reloads, []);
      await h.advanceTo(60000);
      assert.deepStrictEqual(h.reloads, [8400]);
      assert.strictEqual(h.storage.getItem(GUARD + routeKey(C)), '1');
    }
  );

  await check(
    'docusaurus: a blank target that loads later does not reload',
    async () => {
      const { h, app } = run({ [docs]: 0, [api]: 1000, [blog]: 3000 });
      await app.hydrate(A);
      await app.navigate(B, 0);
      await app.navigate(C, 400);
      await h.advanceTo(1000);
      assert.deepStrictEqual(app.commits.at(-1).blank, true);
      await h.advanceTo(3000);
      assert.strictEqual(h.clock.pending(), 0);
      await h.advanceTo(60000);
      assert.deepStrictEqual(h.reloads, []);
      assert.strictEqual(h.storage.getItem(GUARD + routeKey(C)), null);
    }
  );
}

async function main() {
  await unitChecks();
  await watcherChecks('watcher');
  await watcherChecks('routeNavigation.ts', loadRouteNavigation);
  await loadingChecks();
  await docusaurusChecks();
  if (failures.length) {
    for (const { name, error } of failures) {
      console.error(`FAIL ${name}\n${error.stack ?? error}\n`);
    }
    console.error(
      `stalled navigation checks failed (${failures.length} of ${checks + failures.length})`
    );
    process.exit(1);
  }
  console.log(`stalled navigation checks passed (${checks})`);
}

// A rejection the watcher leaves unhandled is a failure, not a crash.
process.on('unhandledRejection', (error) => {
  failures.push({name: 'unhandled rejection', error});
});

let finished = false;
process.on('exit', (code) => {
  if (!finished && code === 0) {
    // An awaited promise never settled, so node ran out of work.
    console.error('stalled navigation checks did not finish');
    process.exitCode = 1;
  }
});

main().then(
  () => {
    finished = true;
  },
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
