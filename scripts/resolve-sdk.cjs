'use strict';
/**
 * resolve-sdk.cjs - locate the pwaos SDK (headers + client lib) and the
 * runtime bundle for this package.
 *
 * Shared by scripts/sdk-dir.cjs (build time) and test code. The runtime
 * DIR always lives at <platform package>/runtime, so runtime resolution
 * delegates to scripts/runtime-resolver.cjs (the same candidate list and
 * node_modules walk the shipped client uses). SDK sources, in order:
 *
 *     1. $PWAOS_SDK_DIR (an explicit SDK root, validated; build-time
 *        headers/lib override only - it never affects runtimeDir)
 *     2. the installed @pwaos.net/runtime-<platform>-<arch> package
 *        (include/ + lib/<os>/ + runtime/ ship inside that package; this
 *        is what makes `npm install @pwaos.net/runtime` self-contained - the
 *        addon compiles against the shipped headers with no network)
 *
 * There is NO download/cache fallback: if the platform package is not
 * installed, resolution fails. Platform payloads are produced by the
 * monorepo's `npm run build -- runtime-<platform>` (scripts/
 * build-platform-pkg.js), which always runs before the client in build
 * order. In a consumer install npm places the platform package next to
 * this one (optionalDependencies of @pwaos.net/runtime), so the require.resolve
 * walk below finds it.
 *
 * Runtime validity (runtime/pwaos_server exists) is checked by
 * runtime-resolver.cjs.
 */

const fs = require('fs');
const path = require('path');

const runtimeResolver = require('./runtime-resolver.cjs');
const { getPlatformPackageCandidates } = runtimeResolver;

const HEADER_NAME = 'runtime_client_api.h';
const LIB_SRC = {
    linux: 'lib/linux/libpwaos_runtime_api.so',
    win: 'lib/win/pwaos_runtime_api.dll',
};

// Platform -> LIB_SRC key.
function sdkOs() {
    if (process.platform === 'linux') return 'linux';
    if (process.platform === 'win32') return 'win';
    return null;
}

function dirHasSdkFiles(dir, osName) {
    return (
        fs.existsSync(path.join(dir, 'include', HEADER_NAME)) &&
        fs.existsSync(path.join(dir, LIB_SRC[osName]))
    );
}

/**
 * The SDK root of the first installed platform subpackage that carries
 * include/ + lib/<os>/, or null. Uses the shared candidate list from
 * runtime-resolver.cjs (same platform/arch derivation and win32 fallback
 * order as the shipped client's runtime resolution). require.resolve is
 * used from THIS file's directory so the same node_modules walk applies
 * (the client's own node_modules or any ancestor's - matching how npm
 * hoists optionalDependencies). On failure every error is swallowed:
 * "not installed" is normal.
 */
function installedSdkDir(osName) {
    for (const pkg of getPlatformPackageCandidates()) {
        let pkgRoot;
        try {
            pkgRoot = path.dirname(require.resolve(`${pkg}/package.json`));
        } catch (_) {
            continue; // not installed - try the next candidate
        }
        if (dirHasSdkFiles(pkgRoot, osName)) return pkgRoot;
    }
    return null;
}

function resolveSdkDir(osName) {
    const explicit = process.env.PWAOS_SDK_DIR;
    if (explicit) {
        return dirHasSdkFiles(explicit, osName) ? explicit : null;
    }
    // The installed platform subpackage: the single source of truth for
    // include/, lib/<os>/ and runtime/.
    return installedSdkDir(osName);
}

/**
 * The runtime DIR: always <installed platform package>/runtime, resolved
 * by runtime-resolver.cjs (same candidate list and node_modules walk the
 * shipped client uses, so build-time and run-time resolution can never
 * drift). Returns null when no usable runtime is installed. Independent
 * of PWAOS_SDK_DIR: that env var is a build-time headers/lib override and
 * must not redirect the runtime lookup at a possibly older tree.
 */
function resolveRuntimeDir() {
    const osName = sdkOs();
    if (!osName) return null;
    try {
        return runtimeResolver.resolveRuntimePath();
    } catch (_) {
        return null;
    }
}

/** Resolve {sdkDir, runtimeDir} per the documented order; either may be null. */
function resolve() {
    const osName = sdkOs();
    if (!osName) return { sdkDir: null, runtimeDir: null };
    return {
        sdkDir: resolveSdkDir(osName),
        runtimeDir: resolveRuntimeDir(),
    };
}

module.exports = {
    resolve,
    installedSdkDir,
};
