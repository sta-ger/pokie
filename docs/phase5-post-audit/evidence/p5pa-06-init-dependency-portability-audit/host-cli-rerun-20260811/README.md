# P5PA-06 host CLI/npm rerun — 2026-08-11

Candidate verified: `904d185ddb6f4afda8c0efc34f01edd15fa90430`.

This is a CLI rerun, so there is deliberately no browser session, browser transcript, or screenshot:
the requested public workflow is `npm` plus the installed `pokie` executable. No test suite, injected
command runner, DOM/state injection, or private API was used for the passing checks.

## Result

The host's working executable is npm 11.16.0 with Node 24.18.0. The complete command transcript is
[`02-real-npm-workflow-transcript.txt`](02-real-npm-workflow-transcript.txt). It records all of the
following actual commands and their successful exits:

1. `npm pack --ignore-scripts --pack-destination …`, producing the committed
   [`pokie-1.3.0.tgz`](artifacts/pokie-1.3.0.tgz), SHA-256
   `e5c3d98a8ad62c6666d10d4e39ce2e4de69ec6663dde6ca050665333ffd5f239`.
2. `npm install <that tarball>` in a fresh consumer, followed by that installed package's public
   `pokie init` and `pokie validate` commands.
3. Copying only the initialized project's persisted metadata/source/output (explicitly no
   `node_modules`), then public `pokie init` and `pokie validate` in the copied directory.
4. Moving the initialized tarball-form project and validating it without another npm install.
5. `npm link <candidate>` through an isolated `npm_config_prefix`, followed by the linked executable's
   public `pokie init` and `pokie validate` commands.

Each `artifacts/*/persisted-metadata-summary.json` was generated from the actual resulting
`package.json` and `package-lock.json`. Every one reports `"pokieDependency": "^1.3.0"`, no `file:`
specifier, no `node_modules/pokie` lock-link entry, and no absolute-path lock key. The adjacent copied
package metadata and source/build artifacts are retained for inspection.

## Host diagnostic retained

The default `/bin/node` is 18.19.0, while npm 11 and this checkout's Vite/Rolldown client builder require
Node 20+. `05-build-cli-transcript.txt` records that exact Node-18 failure; `06-build-cli-node24-transcript.txt`
records the successful same `npm run build-cli` invocation with the host's Node 24. The initial normal
prepack lifecycle attempt is retained in `01-prepack-lifecycle-attempt-transcript.txt`; the passing pack
workflow uses `--ignore-scripts` after rebuilding the committed distribution through the recorded npm build
scripts. This keeps the installation-form verification focused on the actual pack/install/link/init paths.
