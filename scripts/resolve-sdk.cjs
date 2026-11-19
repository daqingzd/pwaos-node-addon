'use strict';
/**
 * resolve-sdk.js - locate the pwaos SDK (headers + client lib) and the
 * runtime bundle for this package.
 *
 * Shared by scripts/sdk-dir.js (build time) and test code. Sources, in order:
 *
 *     1. $PWAOS_SDK_DIR (an explicit SDK root, validated)
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
 * Runtime validity: the runtime dir is the platform package's runtime/
 * subdir and is only reported when runtime/pwaos_server exists and is NOT
 * an un-smudged git-lfs pointer (starts with the LFS version url).
 */

const fs = require('fs');
const path = require('path');

// Installed platform subpackage that carries the SDK consumer files
// (include/ + lib/<os>/). Written as a function so tests can stub it.
function platformPackageName() {
    if (process.platform === 'linux') return '@pwaos.net/runtime-linux-x64';
    if (process.platform === 'win32') return '@pwaos.net/runtime-win32-x86';
    return null;
}

const HEADER_NAME = 'runtime_client_api.h';
const LIB_SRC = {
    linux: 'lib/linux/libpwaos_runtime_api.so',
    win: 'lib/win/pwaos_runtime_api.dll',
};
const SERVER_BASENAME = process.platform === 'win32'
    ? 'pwaos_server.exe' : 'pwaos_server';
const LFS_POINTER_MAGIC = 'version https://git-lfs';

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

/** True when the file exists but is an un-smudged git-lfs pointer. */
function isLfsPointer(file) {
    try {
        const st = fs.statSync(file);
        if (st.size >= 512) return false; // pointers are ~130 bytes
        const head = fs.readFileSync(file, 'utf8');
        return head.startsWith(LFS_POINTER_MAGIC);
    } catch (_) {
        return false;
    }
}

/** The runtime subdir of an SDK dir, or null when it has no usable server. */
function runtimeDirOf(sdkDir) {
    const rt = path.join(sdkDir, 'runtime');
    const server = path.join(rt, SERVER_BASENAME);
    try {
        if (!fs.statSync(server).isFile()) return null;
    } catch (_) {
        return null;
    }
    if (isLfsPointer(server)) return null;
    return rt;
}

/**
 * The SDK root of the installed platform subpackage, or null.
 * require.resolve is used from THIS file's directory so the same
 * node_modules walk applies (the client's own node_modules or any
 * ancestor's - matching how npm hoists optionalDependencies).
 * On failure every error is swallowed: "not installed" is normal.
 */
function installedSdkDir(osName) {
    const pkg = platformPackageName();
    if (!pkg) return null;
    let pkgRoot;
    try {
        pkgRoot = path.dirname(require.resolve(`${pkg}/package.json`));
    } catch (_) {
        return null;
    }
    return dirHasSdkFiles(pkgRoot, osName) ? pkgRoot : null;
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

/** Resolve {sdkDir, runtimeDir} per the documented order; either may be null. */
function resolve() {
    const osName = sdkOs();
    if (!osName) return { sdkDir: null, runtimeDir: null };
    const sdkDir = resolveSdkDir(osName);
    return { sdkDir, runtimeDir: sdkDir ? runtimeDirOf(sdkDir) : null };
}

module.exports = {
    resolve,
    runtimeDirOf,
    isLfsPointer,
    installedSdkDir,
    SERVER_BASENAME,
};
