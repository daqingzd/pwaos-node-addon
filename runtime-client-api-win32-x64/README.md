# @pwaos.net/runtime-client-api-win32-x64

Prebuilt native addon (`pwaos_addon.node`) for
[`@pwaos.net/runtime-client-api`](https://www.npmjs.com/package/@pwaos.net/runtime-client-api)
on **Windows x64**.

This package carries the prebuilt `pwaos_addon.node` binary for
`@pwaos.net/runtime-client-api` on Windows x64, captured from a consumer-style
build of the published client (see the client's
`scripts/build-prebuilt-pkg.cjs --seed`). It is distributed separately from
the source package so the addon binary can be released after the client
itself.

You should not install this package directly: it is pulled in automatically as
an `optionalDependency` of `@pwaos.net/runtime-client-api` (npm's `os`/`cpu`
fields restrict it to win32-x64 machines).

## License

MIT
