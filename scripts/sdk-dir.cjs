#!/usr/bin/env node
'use strict';
/**
 * sdk-dir.js - print the absolute path of the pwaos SDK directory
 * (include/ + lib/<os>/) used to build the native addon. binding.gyp
 * evaluates this via <!(node scripts/sdk-dir.js) at configure time.
 *
 * Resolution lives in scripts/resolve-sdk.js:
 *     1. $PWAOS_SDK_DIR (an explicit SDK root, validated)
 *     2. the installed @pwaos.net/runtime-<platform>-<arch> package
 *        (its include/ + lib/<os>/ + runtime/ - no cache, no network)
 *
 * Prints exactly one line (the path). On failure prints a hint to stderr
 * and exits 1 so the gyp configure step fails with a clear message.
 */

const { resolve } = require('./resolve-sdk.cjs');

function main() {
    const osName = process.platform === 'linux' ? 'linux'
        : process.platform === 'win32' ? 'win' : process.platform;
    const { sdkDir, runtimeDir } = resolve();
    if (!sdkDir) {
        console.error(`sdk-dir: no @pwaos.net/runtime-<os>-<cpu> package with ` +
            `include/ + lib/ found for ${osName}`);
        console.error('sdk-dir: run "npm run build -- runtime-<platform>" in ' +
            'the monorepo first (or set PWAOS_SDK_DIR)');
        return 1;
    }
    if (process.env.PWAOS_SDK_DEBUG) {
        console.error(`sdk-dir: runtime dir: ${runtimeDir || '(none)'}`);
    }
    console.log(sdkDir);
    return 0;
}

process.exitCode = main();
