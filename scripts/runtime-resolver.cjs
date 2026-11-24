'use strict';

/**
 * @pwaos.net/runtime-client-api - Runtime directory resolution.
 *
 * Locates the PwaOS Runtime directory (the directory CONTAINING the
 * pwaos_server executable plus its resources) in the following order:
 *
 *   1. An explicit `runtimePath` provided by the caller.
 *   2. `@pwaos.net/runtime-<platform>-<arch>/runtime` inside node_modules
 *      (installed via @pwaos.net/runtime's optionalDependencies).
 *
 * The resolved path is what `pwaos_setRuntimeExecutablePath` expects: the
 * runtime DIRECTORY itself, never the pwaos_server file - the client library
 * appends /runtime internally and the server loads its resources relative to
 * that directory.
 *
 * The resolution does not rely on a postinstall script, so it also works
 * under `--ignore-scripts` - the same pattern used by packages such as
 * esbuild, Biome, and Sentry CLI.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PACKAGE_PREFIX = '@pwaos.net/runtime-';

/**
 * Platform subpackage candidates for the current process, in preference
 * order. The primary candidate is the strictly-derived
 * @pwaos.net/runtime-<platform>-<arch>. Windows notes:
 *   - win32-x64: the win32-x64 package carries the upstream 32-bit (x86)
 *     payload (runs via WOW64); the ia32 win32-x86 package is kept as a
 *     fallback for installs that predate the x64 package.
 *   - win32-ia32: the auto-installed package is win32-x86 (cpu ia32), while
 *     the strictly-derived name runtime-win32-ia32 does not exist - the x86
 *     package is the only candidate there.
 */
function getPlatformPackageCandidates() {
  const primary = `${PACKAGE_PREFIX}${process.platform}-${process.arch}`;
  if (process.platform === 'win32' && process.arch === 'x64') {
    return [primary, `${PACKAGE_PREFIX}win32-x86`];
  }
  if (process.platform === 'win32' && process.arch === 'ia32') {
    return [`${PACKAGE_PREFIX}win32-x86`];
  }
  return [primary];
}

/** Primary platform subpackage name, e.g. @pwaos.net/runtime-linux-x64. */
function getPlatformPackageName() {
  return getPlatformPackageCandidates()[0];
}

/** Name of the server executable inside the runtime directory. */
function getBinaryName() {
  return process.platform === 'win32' ? 'pwaos_server.exe' : 'pwaos_server';
}

/**
 * Resolve the Runtime directory (the directory containing the pwaos_server
 * executable and its resources).
 *
 * @param {object} [options]
 * @param {string} [options.runtimePath] Explicit path to the Runtime directory.
 * @returns {string} Absolute path to the Runtime directory.
 * @throws {Error} When no usable Runtime directory can be found for this platform.
 */
function resolveRuntimePath(options = {}) {
  // 1. Explicit override.
  if (options.runtimePath) {
    if (fs.existsSync(options.runtimePath)) {
      return path.resolve(options.runtimePath);
    }
    throw new Error(
      `PwaOS Runtime not found at the provided runtimePath: ${options.runtimePath}\n` +
      'Check that the path points at the directory containing pwaos_server.'
    );
  }

  // 2. Platform subpackage installed via @pwaos.net/runtime's optionalDependencies.
  //    Search upwards from this module's directory (standard node_modules
  //    walk) with plain fs, so a stale require cache cannot produce a
  //    false "installed but empty" result.
  let installedWithoutRuntime = null;
  for (const pkg of getPlatformPackageCandidates()) {
    // Primary: standard node_modules resolution (handles symlinked/hoisted
    // installs - e.g. a linked @pwaos.net/runtime whose own deps resolve inside
    // the monorepo that provided the link).
    try {
      const pkgJsonPath = require.resolve(`${pkg}/package.json`);
      const candidate = path.join(path.dirname(pkgJsonPath), 'runtime');
      if (fs.existsSync(path.join(candidate, getBinaryName()))) {
        return candidate;
      }
      // A platform package without its runtime bundle is corrupted; the
      // @pwaos.net/runtime META package legitimately has no bundle (it only
      // declares the platform subpackages) - keep searching.
      if (pkg !== '@pwaos.net/runtime') {
        installedWithoutRuntime = { pkg, pkgJsonPath };
        break;
      }
    } catch (_) { /* not installed - try the fs walk */ }

    // Backup: manual walk (covers non-standard layouts without require
    // visibility, e.g. the runtime dir placed next to node_modules).
    let dir = __dirname;
    while (true) {
      const candidate = path.join(dir, 'node_modules', pkg, 'runtime');
      if (fs.existsSync(path.join(candidate, getBinaryName()))) {
        return candidate;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  if (installedWithoutRuntime) {
    const { pkg, pkgJsonPath } = installedWithoutRuntime;
    throw new Error(
      `The platform package ${pkg} is installed but has no runtime directory ` +
      `at ${path.join(path.dirname(pkgJsonPath), 'runtime')}.\n` +
      `The package contents may be corrupted - try reinstalling: npm install ${pkg}`
    );
  }

  // 3. Nothing found - explain how to fix it.
  throw new Error(
    `PwaOS Runtime not found for ${process.platform}-${process.arch}.\n\n` +
    'Try installing the Runtime distribution package first:\n' +
    '  npm install @pwaos.net/runtime\n\n' +
    'If it still fails, check whether your platform is supported and whether\n' +
    'your package manager has disabled optionalDependencies\n' +
    '(e.g. --no-optional or --omit=optional).'
  );
}

module.exports = { resolveRuntimePath, getPlatformPackageName,
  getPlatformPackageCandidates, getBinaryName };
