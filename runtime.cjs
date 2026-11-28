'use strict';

/**
 * @pwaos.net/runtime-client-api - CommonJS entry (runtime.cjs).
 *
 * Setup-only entry. The ONLY export surface is the native addon itself:
 * module.exports = addon. No extra classes or functions are exposed -
 * consumers use the addon's native API directly
 * (init / shutDown / createInstance / Instance / App / ...).
 *
 * On load this module performs the required setup, in order:
 *
 *   1. Sets up the dynamic-library search path (动态库搜索路径): the
 *      platform package's lib/<os> directory is prepended to
 *      LD_LIBRARY_PATH (Linux) / PATH (Windows) BEFORE the addon is
 *      required, so libpwaos_runtime_api.so / pwaos_runtime_api.dll
 *      resolves even where the addon's embedded rpath is not usable
 *      (and child processes inherit it).
 *
 *   2. Loads the native addon (built at install time by `install`:
 *      node-gyp rebuild).
 *
 *   3. Calls pwaos_setRuntimeExecutablePath with the resolved runtime
 *      directory - the installed platform package's runtime/ bundle
 *      (the directory containing pwaos_server). Consumers can still
 *      re-point it later via addon.setRuntimeExecutablePath(dir).
 */

const fs = require('fs');
const path = require('path');

const { resolveRuntimePath, getPlatformPackageName } =
    require('./scripts/runtime-resolver.cjs');

// --- 1. dynamic-library search path (must precede the addon require) ------
try {
    const pkgJson = require.resolve(`${getPlatformPackageName()}/package.json`);
    const libDir = process.platform === 'win32'
        ? path.join(path.dirname(pkgJson), 'lib', 'win')
        : path.join(path.dirname(pkgJson), 'lib', process.platform);
    if (fs.existsSync(libDir)) {
        if (process.platform === 'win32') {
            process.env.PATH = `${libDir};${process.env.PATH}`;
        } else {
            process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
                ? `${libDir}:${process.env.LD_LIBRARY_PATH}`
                : libDir;
        }
    }
} catch (_) {
    // Platform package not installed - the addon falls back to its
    // embedded rpath (set at build time by binding.gyp).
}

// --- 2. load the native addon ---------------------------------------------
// Locally built addon first (install: node-gyp rebuild); when that is
// absent or unloadable (e.g. built on a machine whose RUNPATH no longer
// matches), load the prebuilt addon shipped in the platform prebuilt
// package @pwaos.net/runtime-client-api-<platform>-<arch> (an
// optionalDependency). When neither loads, the ORIGINAL error is
// rethrown so the user sees the real failure.
function loadAddon() {
    try {
        return require('./build/Release/pwaos_addon.node');
    } catch (localErr) {
        try {
            const { resolvePrebuiltAddon } =
                require('./scripts/prebuild-resolver.cjs');
            const prebuilt = resolvePrebuiltAddon();
            if (prebuilt) {
                try {
                    return require(prebuilt);
                } catch (prebuiltErr) {
                    process.stderr.write(
                        '[pwaos.net/runtime-client-api] prebuilt addon failed: '
                        + prebuiltErr.message + '\n');
                }
            }
        } catch (_) { /* resolver unavailable - no fallback */ }
        throw localErr;
    }
}

const addon = loadAddon();

// --- 3. pwaos_setRuntimeExecutablePath -------------------------------------
try {
    const runtimeDir = resolveRuntimePath();
    process.env.PWAOS_RUNTIME_PATH = runtimeDir;
    addon.setRuntimeExecutablePath(runtimeDir);
} catch (e) {
    process.stderr.write(
        '[pwaos.net/runtime-client-api] no runtime directory resolved: '
        + e.message + '\n');
}

module.exports = addon;
