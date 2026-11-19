/**
 * @pwaos.net/runtime-client-api - ESM entry (runtime.js).
 *
 * The setup flow (dynamic-library search path, addon load,
 * pwaos_setRuntimeExecutablePath) lives in runtime.cjs - the default
 * export IS the native addon object; access everything as properties of
 * the default export (pwaos.init, pwaos.Instance, ...). No additional
 * class or function is defined here.
 *
 * The .cjs module performs setup exactly once per process (Node caches
 * module instances), so importing this file and requiring runtime.cjs in
 * the same program share one addon instance.
 */

import addon from './runtime.cjs';

export default addon;
