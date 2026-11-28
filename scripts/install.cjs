#!/usr/bin/env node
'use strict';
/**
 * install.cjs - install lifecycle script for @pwaos.net/runtime-client-api.
 *
 * 1. FIRST: build the addon (`node-gyp rebuild`) - the locally built
 *    addon is always preferred.
 * 2. If the build FAILS: fall back to the PREBUILT addon shipped in the
 *    platform prebuilt package
 *    (@pwaos.net/runtime-client-api-<platform>-<arch>, an
 *    optionalDependency so npm installs it when its os/cpu fields match).
 *    When a usable prebuild exists, the install exits 0 with a warning -
 *    a failed native build must NOT roll back the whole npm install
 *    (node-gyp failure inside an npm lifecycle script rolls back the
 *    entire install tree).
 * 3. With neither a local build nor a prebuild, exits 1 so the user
 *    sees the original build failure.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const PKG_ROOT = path.resolve(__dirname, '..');

function log(msg) {
    process.stderr.write(`[pwaos.net/runtime-client-api] ${msg}\n`);
}

function main() {
    // 1. Standard install-time build - FIRST preference.
    const build = spawnSync('node-gyp', ['rebuild'], {
        cwd: PKG_ROOT,
        stdio: 'inherit',
    });
    if (build.status === 0) {
        process.exit(0);
    }

    // 2. Build failed - fall back to the prebuilt platform addon.
    log('node-gyp rebuild failed (see build log above); ' +
        'looking for a prebuilt addon...');
    let prebuilt = null;
    try {
        prebuilt = require('./prebuild-resolver.cjs').resolvePrebuiltAddon();
    } catch (_) {
        prebuilt = null; // resolver failure = no prebuild
    }
    if (prebuilt) {
        log(`using prebuilt addon: ${prebuilt}`);
        log('the addon was NOT compiled locally; the addon loads from ' +
            '@pwaos.net/runtime-client-api-<platform>-<arch> instead.');
        process.exit(0);
    }

    // 3. Nothing usable - surface the original failure.
    log(`no prebuilt addon available for ${process.platform}-${process.arch}.`);
    process.exit(build.status ?? 1);
}

main();
