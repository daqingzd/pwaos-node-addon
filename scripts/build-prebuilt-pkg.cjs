#!/usr/bin/env node
'use strict';
/**
 * build-prebuilt-pkg.cjs - fill a @pwaos.net/runtime-client-api-<plat>-<arch>
 * prebuilt package from the client package's prebuilds store. Lives in
 * the CLIENT package (this file is only used by the runtime-client-api
 * package family).
 *
 * Addon flow (2026-11-26):
 *   1. @pwaos.net/runtime-client-api is published; its install script
 *      builds the addon from src/ (node-gyp).
 *   2. AFTER publishing, the addon built by that consumer-style flow is
 *      captured into the client package store:
 *          <client>/prebuilds/<os>/<arch>/pwaos_addon.node
 *      (--seed below automates the capture)
 *   3. This script copies the store into the prebuilt package payload
 *      (<pkg>/prebuilds/<os>/<arch>/pwaos_addon.node), which is packed and
 *      published as the install-time fallback addon.
 *
 * Usage (from the client package dir):
 *   node scripts/build-prebuilt-pkg.cjs <prebuilt-pkg-dir>
 *       copy the store into the prebuilt package (no build step).
 *       e.g. npm run build:prebuilt  (wired in package.json)
 *   node scripts/build-prebuilt-pkg.cjs --seed
 *       capture the addon into the store: packs the client tarball,
 *       installs it into a temp dir, builds it there the way a consumer
 *       install would, and copies the produced addon into the store.
 *
 * The addon is ABI-compatible with Node >= 18 (N-API), so a single
 * binary per platform-arch is enough (no per-Node-version split).
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// This script lives IN the client package: <client>/scripts/.
const CLIENT = path.resolve(__dirname, '..');
// Monorepo root: two levels above the client package.
const ROOT = path.resolve(CLIENT, '..', '..');

function fail(msg) {
    process.stderr.write(`build-prebuilt-pkg: ${msg}\n`);
    process.exit(1);
}

function run(cmd, args, opts) {
    const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
    if (res.status !== 0) {
        fail(`${cmd} ${args.join(' ')} failed (exit ${res.status})`);
    }
}

/**
 * Make the addon's shared-library RUNPATH portable ($ORIGIN-relative).
 *
 * A prebuilt addon is built on ONE machine and loaded on ANOTHER, and
 * glibc reads LD_LIBRARY_PATH at process STARTUP - so runtime.cjs's
 * in-process LD_LIBRARY_PATH prepending does NOT affect dlopen in the
 * loading process. The addon must therefore find
 * libpwaos_runtime_api.so through its own RUNPATH. $ORIGIN is the
 * addon's dir (<pkg>/prebuilds/<os>/<arch>), so up4 = the dir holding
 * the prebuilt pkg and up5 = packages/ in the monorepo (verified by
 * loading the patched binary in BOTH layouts):
 *
 *   1. consumer install: node_modules/@pwaos.net/<pkg>/prebuilds/... ->
 *      up4 = node_modules/@pwaos.net/, where the platform payload pkg
 *      sits as a SIBLING of the prebuilt pkg;
 *   2. monorepo dev-link: packages/runtime-client-api/<pkg>/... ->
 *      up5 = packages/, where the platform pkg lives NESTED inside
 *      packages/runtime/ (harmless no-match in consumers).
 *
 * Windows DLL search uses PATH at LoadLibrary time (in-process PATH
 * mutation works), so no fixup is needed there.
 */
function fixRunpath(addonPath, suffix) {
    if (process.platform !== 'linux') return;
    const entries = [
        `$ORIGIN/../../../../runtime-${suffix}/lib/linux`,
        `$ORIGIN/../../../../../runtime/runtime-${suffix}/lib/linux`,
    ].join(':');
    const res = spawnSync('patchelf', ['--set-rpath', entries, addonPath], {
        stdio: 'pipe', encoding: 'utf8',
    });
    if (res.error || res.status !== 0) {
        fail(`patchelf --set-rpath failed for ${addonPath}` +
            (res.stderr ? `\n  ${res.stderr.trim()}` : '') +
            '\n  install it with: apt-get install -y patchelf');
    }
}

/**
 * <os>/<arch> pair for a platform-arch package name suffix. The npm
 * package suffix uses the conventional 'x86' spelling while Node's
 * process.arch (and therefore the prebuilds/ directory layout the
 * resolver searches) uses 'ia32' - normalized here.
 */
function osArchFromSuffix(suffix) {
    const idx = suffix.indexOf('-');
    if (idx <= 0) fail(`unexpected platform-arch suffix: ${suffix}`);
    const osName = suffix.slice(0, idx);
    const arch = suffix.slice(idx + 1) === 'x86' ? 'ia32'
        : suffix.slice(idx + 1);
    return [osName, arch];
}

/** Seed the store from a consumer-style build of the client tarball. */
function seed() {
    // 1. Pack the client (tarball == publish upload).
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'pwaos-seed-'));
    run('npm', ['pack', CLIENT, '--pack-destination', dest]);
    const tarball = fs.readdirSync(dest).find((f) => f.endsWith('.tgz'));
    if (!tarball) fail('npm pack produced no tarball');

    // 2. Consumer-style install WITHOUT lifecycle scripts (fast: skips
    //    the platform payload download), then build the addon against
    //    the monorepo platform package - the same SDK a consumer gets.
    //    In real post-publish use the same capture works with a full
    //    install (scripts on) of the published version.
    const prefix = fs.mkdtempSync(path.join(os.tmpdir(), 'pwaos-seed-inst-'));
    const env = { ...process.env };
    delete env.PWAOS_SDK_DIR; // stale-shell guard (skill note)
    // Build against the monorepo platform payload package for this host
    // (same SDK a consumer install resolves). Platform packages are
    // NESTED inside packages/runtime/ (2026-11-27).
    const hostPkg = process.platform === 'win32'
        ? (process.arch === 'x64' ? 'runtime-win32-x64' : 'runtime-win32-x86')
        : 'runtime-linux-x64';
    env.PWAOS_SDK_DIR = path.join(ROOT, 'packages', 'runtime', hostPkg);
    run('npm', ['install', '--prefix', prefix, '--ignore-scripts',
        '--omit=optional', '--no-audit', '--no-fund',
        path.join(dest, tarball)], { env });
    const instPkg = path.join(prefix, 'node_modules',
        '@pwaos.net', 'runtime-client-api');
    // node-gyp was installed into the temp prefix as a dependency of
    // the client - invoke it from that prefix's .bin, not PATH.
    const gypBin = path.join(prefix, 'node_modules', '.bin',
        process.platform === 'win32' ? 'node-gyp.cmd' : 'node-gyp');
    run(gypBin, ['rebuild'], {
        cwd: instPkg, env, shell: process.platform === 'win32',
    });

    // 3. Capture the built addon into the store.
    const built = path.join(instPkg, 'build', 'Release', 'pwaos_addon.node');
    if (!fs.existsSync(built)) fail(`no addon produced at ${built}`);
    const store = path.join(CLIENT, 'prebuilds',
        process.platform, process.arch);
    fs.mkdirSync(store, { recursive: true });
    fs.copyFileSync(built, path.join(store, 'pwaos_addon.node'));
    process.stdout.write(
        `build-prebuilt-pkg: seeded ` +
        `${path.relative(ROOT, path.join(store, 'pwaos_addon.node'))}\n`);
}

function main() {
    const args = process.argv.slice(2);
    if (args.includes('--seed')) {
        seed();
        return;
    }

    const pkgDir = path.resolve(process.cwd(),
        args[0] || fail('missing <package-dir> argument'));
    if (!fs.existsSync(path.join(pkgDir, 'package.json'))) {
        fail(`not a package dir: ${pkgDir}`);
    }
    const pkg = require(path.join(pkgDir, 'package.json'));
    const m = /^@pwaos\.net\/runtime-client-api-(.+)$/.exec(pkg.name);
    if (!m) fail(`unexpected package name: ${pkg.name}`);
    const [osName, arch] = osArchFromSuffix(m[1]);

    // Addon source: the client package's prebuilds store, resolved
    // relative to the package dir. The npm files entry cannot point
    // outside the package root, so the store is located by probing
    // (first match wins):
    //   1. the ../ files entry, when present (legacy sibling layout);
    //   2. nested layout (2026-11-27): the package lives INSIDE the
    //      client, so the store is exactly ../prebuilds/<os>/<arch>/;
    //   3. legacy sibling layout fallback: ../runtime-client-api/.
    const filesEntry = (pkg.files || []).find((f) =>
        f.endsWith('pwaos_addon.node') && f.startsWith('..'));
    const store = [
        filesEntry,
        path.join('..', 'prebuilds', osName, arch, 'pwaos_addon.node'),
        path.join('..', 'runtime-client-api', 'prebuilds',
            osName, arch, 'pwaos_addon.node'),
    ].filter(Boolean).map((c) => path.resolve(pkgDir, c))
        .find((p) => fs.existsSync(p));
    if (!store) {
        fail(`store addon missing: ${store}\n` +
            '  run "node scripts/build-prebuilt-pkg.cjs --seed" AFTER ' +
            'publishing @pwaos.net/runtime-client-api');
    }

    // npm files entries cannot point outside the package root (verified:
    // they are silently dropped from the tarball), so the payload is
    // vendored INTO the package at this step and shipped from
    // prebuilds/<os>/<arch>/.
    const dest = path.join(pkgDir, 'prebuilds', osName, arch,
        'pwaos_addon.node');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(store, dest);
    // Portable RUNPATH so the fallback loads without depending on the
    // build machine's absolute paths (see fixRunpath above).
    fixRunpath(dest, m[1]);
    process.stdout.write(
        `build-prebuilt-pkg: installed ${path.relative(ROOT, dest)} ` +
        `(${fs.statSync(dest).size} bytes, source ` +
        `${path.relative(ROOT, store)})\n`);
}

main();
