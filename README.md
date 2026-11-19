# @pwaos.net/runtime-client-api

**JavaScript wrapper for the PwaOS RuntimeClient API.**

Calls PwaOS Runtime features through a Node.js native addon and resolves the PwaOS
Runtime SDK distribution for your platform at install time. On load, it automatically
configures the dynamic-library search path, loads the native addon, and resolves the Runtime path.

---

## Installation

```sh
npm install @pwaos.net/runtime-client-api
```

This package automatically pulls in
[`@pwaos.net/runtime`](https://www.npmjs.com/package/@pwaos.net/runtime), which installs
the prebuilt Runtime SDK distribution for your platform. The native addon is built automatically
at install time (or loaded from prebuilt binaries). No manual download or compilation is required.

## Platform Support

| OS      | Architecture                  | Status |
| ------- | ----------------------------- | ------ |
| Linux   | x64                           | \u2705     |
| Windows | x64 (x86 runtime via WOW64)   | \u2705     |

> Requires Node.js >= 18.

**Support:** For questions or to request the SDK for other platforms or CPU
architectures, please contact [daqingzd@pwaos.net](mailto:daqingzd@pwaos.net).

## What loading the package does

`require('@pwaos.net/runtime-client-api')` returns the native addon object
itself and, at require time:

1. **Sets up the dynamic-library search path** - the platform package's
   `lib/<os>` directory is prepended to `LD_LIBRARY_PATH` (Linux) or
   `PATH` (Windows), so `libpwaos_runtime_api.so` /
   `pwaos_runtime_api.dll` resolves everywhere (and child processes
   inherit it).
2. **Loads the native addon** - compiled at install time by the
   `install` script (`node-gyp rebuild`).
3. **Calls `pwaos_setRuntimeExecutablePath`** - bound to the installed
   platform package's runtime directory (also exported as
   `process.env.PWAOS_RUNTIME_PATH`).

## Usage

The module's export surface IS the addon - there is no additional JS
wrapper layer. Use the native API directly:

```js
const pwaos = require('@pwaos.net/runtime-client-api');

// The runtime executable path is already set (see above). Init:
await pwaos.init();

// One instance per process:
const instance = pwaos.createInstance({
  type: pwaos.PWAOS_TYPE_INSTANCE_CREATE_INFO,
  runtimeType: pwaos.runtimeTypePwa,
  serverUrl: 'http://localhost',
  dataPath: '',
});

// Pump events until the instance is working, then open apps.
let ev;
while (!(ev = instance.pollEvent())
    || ev.type !== pwaos.PWAOS_TYPE_EVENT_DATA_INSTANCE_STATUS_CHANGED
    || ev.status !== pwaos.Instance.instanceStatusWorking) { /* ... */ }

const app = instance.createPwa({
  type: pwaos.PWAOS_TYPE_PWA_CREATE_INFO,
  appType: pwaos.App.appTypePwa,
  appUrl: 'https://example.com',
  width: 800,
  height: 600,
});

// Exercise the App surface:
app.executeJavaScript('1+1');
app.setFPS(60);
app.setBounds({ type: pwaos.PWAOS_TYPE_WINDOW_BOUNDS_INFO,
                x: 0, y: 0, width: 400, height: 300 });
console.log(app.getDensity(), app.getBounds());
```

## Documentation

For the full API reference, configuration options, event list, and
advanced usage, please visit
[https://www.pwaos.net/api/index.html](https://www.pwaos.net/api/index.html).

## How Runtime Resolution Works

At require time the runtime directory is resolved in this order:

1. The installed platform subpackage
   `@pwaos.net/runtime-<platform>-<arch>/runtime` in `node_modules`
   (primary; on win32-x64 the `win32-x86` package is a fallback via
   WOW64).
2. An upward `node_modules` walk from this module's directory, covering
   non-standard layouts.

If neither succeeds, a clear error with installation instructions is
printed to stderr and the addon keeps its build-time default - you can
always bind a directory explicitly with
`pwaos.setRuntimeExecutablePath(dir)`.

The resolution does not rely on a postinstall script, so it also works
under `--ignore-scripts`. This is the same pattern used by packages such
as esbuild, Biome, and Sentry CLI.

## Relationship to @pwaos.net/runtime

```text
Your Node.js code
  └─ require('@pwaos.net/runtime-client-api')   ← returns the native addon
       ├─ native addon: .node module (the export surface itself)
       ├─ setup at require time:
       │    dynamic-library search path + pwaos_setRuntimeExecutablePath
       └─ resolved and loaded from
            └─ @pwaos.net/runtime               ← runtime distributor
                 └─ @pwaos.net/runtime-<platform>-<arch>
                      ├─ runtime/pwaos_server   ← the actual executable
                      └─ lib/<os>/libpwaos_runtime_api.so ← linked at build
```

You should not `require('@pwaos.net/runtime')` directly. It is an internal
dependency of `@pwaos.net/runtime-client-api` that distributes Runtime
binaries by platform.

## License

MIT
