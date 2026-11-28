'use strict';

/**
 * prebuild-resolver.cjs - locate a PREBUILT native addon for this
 * platform when the install-time node-gyp build did not produce one.
 *
 * Prebuilt addons live in the prebuilt packages named
 *
 *     @pwaos.net/runtime-client-api-<platform>-<arch>
 *
 * (e.g. @pwaos.net/runtime-client-api-linux-x64), each carrying
 * prebuilds/<os>/<arch>/pwaos_addon.node. The payload is captured from
 * a consumer-style build of the published client (see
 * scripts/build-prebuilt-pkg.cjs --seed) AFTER the client is published.
 * npm's os/cpu fields on those packages make them install ONLY on
 * matching machines; they are declared as optionalDependencies of
 * @pwaos.net/runtime-client-api, so a node-gyp failure at install time
 * still leaves a usable addon behind (the install script then exits 0 -
 * see scripts/install.cjs).
 *
 * Exported:
 *   getPrebuildPackageCandidates() - candidate package names, in order.
 *   resolvePrebuiltAddon()         - absolute .node path or null.
 */

const fs = require('fs');
const path = require('path');

const PACKAGE_PREFIX = '@pwaos.net/runtime-client-api-';

/** Prebuilt addon binary name inside prebuilds/<os>/<arch>/. */
const ADDON_BASENAME = 'pwaos_addon.node';

/**
 * Candidate prebuilt package names for the current process, in
 * preference order (platform-arch derivation identical to
 * runtime-resolver.cjs):
 *   - linux-x64  -> runtime-client-api-linux-x64
 *   - win32-x64  -> runtime-client-api-win32-x64 (fallback win32-x86
 *                   kept for symmetry; not produced yet)
 *   - win32-ia32 -> runtime-client-api-win32-x86
 * Other platforms have no prebuilt packages (null -> no candidates).
 */
function getPrebuildPackageCandidates(platform = process.platform,
                                      arch = process.arch) {
    if (platform === 'linux' && arch === 'x64') {
        return [`${PACKAGE_PREFIX}linux-x64`];
    }
    if (platform === 'win32' && arch === 'x64') {
        return [`${PACKAGE_PREFIX}win32-x64`, `${PACKAGE_PREFIX}win32-x86`];
    }
    if (platform === 'win32' && arch === 'ia32') {
        return [`${PACKAGE_PREFIX}win32-x86`];
    }
    return [];
}

/** Directory pair under prebuilds/ for a platform/arch (os/arch split). */
function prebuildDirName(platform = process.platform,
                         arch = process.arch) {
    return path.join(platform, arch);
}

/**
 * Absolute path of the first candidate's prebuilt addon that exists on
 * disk, or null when none is installed. require.resolve is used from
 * THIS file's directory so the same node_modules walk applies (the
 * client's own node_modules or any ancestor's - matching how npm
 * hoists optionalDependencies). Errors are swallowed: "not installed"
 * is a normal, expected state (the local build succeeded).
 */
function resolvePrebuiltAddon(platform = process.platform,
                              arch = process.arch) {
    const dirName = prebuildDirName(platform, arch);
    for (const pkg of getPrebuildPackageCandidates(platform, arch)) {
        let pkgRoot;
        try {
            pkgRoot = path.dirname(
                require.resolve(`${pkg}/package.json`, { paths: [__dirname] }));
        } catch (_) {
            continue; // not installed - try the next candidate
        }
        const addon = path.join(pkgRoot, 'prebuilds', dirName, ADDON_BASENAME);
        try {
            if (fs.statSync(addon).isFile()) return addon;
        } catch (_) { /* corrupted package - try the next candidate */ }
    }
    return null;
}

module.exports = {
    PACKAGE_PREFIX,
    ADDON_BASENAME,
    getPrebuildPackageCandidates,
    prebuildDirName,
    resolvePrebuiltAddon,
};
