[← Back to phase5-post-audit](../../README.md)

# `P5PA-06` evidence: `pokie init` dependency portability audit

This step's own instruction: prove production local POKIE resolution and persisted package portability
across installation forms (unpublished checkout, npm-pack install, npm-link, a future published npm
install, moving a generated directory, copying it to another machine/environment followed by `npm
install`, offline local development) *before* changing dependency materialization; classify whether a
canonical generated package persists a host-specific `file:` dependency and, if confirmed, separate
ephemeral preparation/install-time local resolution from the portable canonical persisted dependency,
without breaking unpublished offline local development.

## Environment blocker (reproduced fresh, same shape `pokie-phase5-inventory.md`/`P5PA-01` already documented)

`/usr/local/bin/npm` in this implementer sandbox fails on *every literal invocation* with a real shell
syntax error in its own wrapper script (`case " $* " in *' check:fast '*|*' check:full '*|...`), not just
the project-wide gates it's meant to restrict -- reproduced fresh this round:
[`00-npm-broken.txt`](00-npm-broken.txt). That means no real `npm install`/`npm pack`/`npm link`/`npm run
build` can be spawned by this implementer at all, so (see below for why `npm run typecheck` is a documented
exception to this blocker, not a further instance of it):

- `tests/cli/InitCommandWorkflow.integration.test.ts` (which covers the unpublished-checkout and real
  npm-link forms end to end, with real `npm install`/`npm run build`) fails at its own `ensureCompiledTestOutput`
  precondition before a single assertion runs:
  [`02-InitCommandWorkflow-integration-blocked.txt`](02-InitCommandWorkflow-integration-blocked.txt).
- `tests/packaging/npmPackSmoke.test.ts` (which covers the npm-pack-install form end to end, with a real
  tarball and a real `npm install`) fails the same way, at its own `npm run build` precondition:
  [`03-npmPackSmoke-blocked.txt`](03-npmPackSmoke-blocked.txt).

Per this campaign's own protocol (`README.md` §2, "an unsupported/blocked state... reproduce the blocker
with a real command each time... never a screenshot or transcript that implies success"), this round does
not fabricate a passing run of either file. What follows instead is real evidence at the layers this
sandbox *can* exercise: reading the exact current production source (every call site, unconditionally),
a real Jest reproduction of the mechanism itself with `npm install`/`npm run build` replaced by a
recording double (so the exact package.json shape at each phase is captured from the real code, never
typed by hand), and the pre-existing, already-committed, already-passing (in an environment with working
npm -- e.g. the orchestrator's own gates) integration/packaging suites cited by name and quoted assertion
as source-level evidence for the forms this sandbox can't itself execute.

**The `npm run typecheck` sanity gate is a separate case and does not carry this blocker.** The literal
`npm run typecheck` command still fails in this sandbox for the same reason as above (the wrapper script's
own shell syntax error trips on any argument, including this one) -- but the check that command exists to
run, `tsc --noEmit -p tsconfig.typecheck.json`, is independently reachable without the broken wrapper and
passes cleanly: the current, independent pre-review sanity check for this round reports `npm run typecheck`
passing, and this implementer's own sandbox reproduces the identical clean result by invoking
`node_modules/.bin/tsc --noEmit -p tsconfig.typecheck.json` directly (exit 0, zero diagnostics). The
wrapper bug therefore blocks only the literal `npm install`/`npm pack`/`npm link` invocation path this
section's forms need -- there is no non-npm fallback for actually running those -- not the typecheck gate,
which stands verified.

## What was found (at this step's base SHA, `0be705f`, before the correction below)

**The mechanism, traced end to end (`cli/pokie.ts` → `cli/registerCliCommands.ts` →
`cli/prepare/PackageCommandRunner.ts` → `src/gamepackage/withLocalPokieDependency.ts` →
`cli/prepare/localPokieDependencyClosure.ts`):**

- `cli/pokie.ts`'s `readOwnPackageRoot()` computes the running installation's own absolute root the same
  way regardless of how it got onto disk (dev checkout, `npm link`ed target -- Node resolves the symlink
  before `import.meta.url` is read, tarball/ordinary npm install): two levels up from the compiled
  `dist/cli/pokie.js`.
- `cli/registerCliCommands.ts:66` wires `InitCommand` through `withLocalPokieInstall(pokiePackageRoot)`
  **unconditionally** -- there is no branch anywhere in this call site (or `withLocalPokieInstall`/
  `withLocalPokieDependency` themselves) that checks whether the running version is actually published
  and skips the local rewrite in favor of letting `npm install` resolve `pokie` from the registry. See
  [`05-source-evidence.txt`](05-source-evidence.txt).
- `withLocalPokieInstall` (`cli/prepare/PackageCommandRunner.ts`) rewrites `cwd`'s `package.json` on disk
  immediately before every `npm install` it runs: `dependencies.pokie` becomes `file:<pokiePackageRoot>`
  (via `withLocalPokieDependency`, imported from `pokie` itself), and every name in `pokie`'s own real,
  on-disk runtime dependency closure (walked via `require.resolve`, not read off a lockfile) is rewritten
  to `file:<that name's own resolved root>` -- as a direct dependency/devDependency in place where one
  already exists, otherwise via `overrides` (`localPokieDependencyClosure.ts`).
- **At this base SHA, the rewrite was never reverted.** `GamePackagePreparer`/`InitCommand` did not restore
  `buildPackageJsonPatch`'s own portable `"pokie": "^<version>"` spec once the "dependencies" phase had
  run. The `file:` specs left on disk *were* the package's own canonical, persisted `package.json` -- the
  exact file a user is meant to keep, hand-edit, `git add`, and move. **This is the condition the
  correction below (`5436387`, `439af56`) fixes** -- see "The correction landed since the base SHA" further
  down; everywhere else in this section describes the base-SHA state that motivated it, not current
  behavior.

**Real reproduction of the exact package.json shape at each phase**, `npm install`/`npm run build`
replaced by a recording double (no real npm spawned, no hand-typed JSON -- every value below is what the
real `GamePackageMerger.merge()` → `InitCommand` → `withLocalPokieInstall(pokiePackageRoot="/workspace")`
call chain actually wrote):
[`01-mechanism-transcript.txt`](01-mechanism-transcript.txt).

- **Ephemeral/pre-install (portable):** immediately after `GamePackageMerger.merge()`, before any install
  phase runs, `package.json`'s `"pokie"` dependency is `"^1.3.0"` -- a real semver range, resolvable from
  the registry once `pokie` is published, no host-specific path anywhere.
- **Persisted/post-install (host-specific):** after `withLocalPokieInstall`'s install-time rewrite (the
  state `InitCommand` actually leaves on disk for the default, `--prepare`d flow), `"pokie"` is
  `"file:/workspace"` and `"overrides"` carries **71** more `file:/workspace/node_modules/<name>` entries
  -- `pokie`'s own real, on-disk transitive runtime closure in this checkout (`commander`, `exceljs`,
  `archiver`, `dayjs`, `fast-csv`, `jszip`, down through `crc-32`).

These are the two states the acceptance criteria asks to be told apart: the first is genuinely portable
and ephemeral; the second, **at this step's base SHA**, was what got left behind on disk, and it was
host-specific.

**Classification at the base SHA: CONFIRMED.** A canonical `pokie init` package's persisted `package.json`
carried a host-specific `file:` dependency (plus a host-specific `overrides` block for `pokie`'s entire
transitive runtime closure). Three already-committed test files predating this step covered the mechanism
across three installation forms, but at the base SHA they asserted the *unrestored* `file:` shape as the
persisted result:

| Installation form | Test (already committed, predates this step) | Persisted shape asserted at the base SHA |
| --- | --- | --- |
| Unpublished checkout | `tests/cli/prepare/PackageCommandRunner.test.ts` | `patched.dependencies.pokie === file:${REPO_ROOT}`, `patched.overrides.commander/exceljs/dayjs === file:${REPO_ROOT}/node_modules/<name>` |
| npm-link | `tests/cli/InitCommandWorkflow.integration.test.ts` | `pkg.dependencies?.pokie === file:${linkedPokieRoot}` (a real `npm link ${REPO_ROOT}`, real `npm install`) |
| npm-pack install | `tests/packaging/npmPackSmoke.test.ts` | `scaffoldedPkg.dependencies?.pokie === file:${path.join(installDir, "node_modules", "pokie")}` (a real tarball, real `npm install`) |

**All three of these tests were updated by the correction below (`5436387`, `439af56`) and now assert the
opposite: the persisted `package.json`/`package-lock.json` carry a portable version range, not a `file:`
path.** See "The correction landed since the base SHA" further down for what they assert now. This
implementer's own sandbox can't execute the npm-link/npm-pack-install rows directly at either SHA (npm is
broken here -- see above), so those two rows remain **source-level evidence**: real, already-committed test
files with real assertions, not re-derived or assumed. The unpublished-checkout row's base-SHA behavior
*was* executed at the time via the recording-double reproduction above (real production code, no real npm
process); its current, corrected behavior is verified directly below by running
`tests/cli/prepare/PackageCommandRunner.test.ts` itself, which needs no real npm.

**Move/copy portability at the base SHA, reasoned from the mechanism as it stood before the correction
(real npm still unavailable to actually run the "after" half of a move/copy live in this sandbox):**

- **Moving the generated directory** (same machine, `pokiePackageRoot` untouched): every `file:` spec
  written is an *absolute* path (`pokiePackageRoot` itself is always absolute -- `path.dirname` of a
  `file://` URL), and it points at `pokie`'s own installation location, never at the generated package's
  own path. Moving the generated package elsewhere on the same machine does not change where `pokie`
  lives, so a fresh `rm -rf node_modules && npm install` there continues to resolve identically. Not
  broken by moving, at the base SHA or since.
- **Copying to another machine/environment, then `npm install` from scratch, at the base SHA:** the
  identical absolute `file:` targets (`pokiePackageRoot` and each of its 71 transitive dependency roots in
  this checkout's own case) essentially never exist at that same absolute path on a different machine or a
  fresh environment (a different developer's checkout location, a CI runner, a Docker image). `npm install`
  there failed to resolve those specs (`ENOENT`/`ENOTDIR` on the `file:` target), because the specs
  themselves -- not just the transient install-time state -- were what got persisted. This was the one
  genuinely confirmed portability gap at the base SHA: real, reproducible from the source alone, and not
  previously documented anywhere in this repository before this step's first round. **The correction below
  removes this gap for the persisted files themselves**: `package.json`/`package-lock.json` no longer carry
  any `file:`/absolute-path state once install settles, so copying them (without `node_modules`) to another
  machine no longer fails on a stale local path. A copy still needs either `node_modules` to travel with it,
  a real `pokie` installation from the registry (once published), or a fresh `pokie init`/wrapped
  `npm install` re-run against a local `pokie` checkout to resolve an unpublished version offline -- that
  remaining requirement is inherent to resolving an unpublished package with no network access, not a
  regression the correction leaves behind, and is exactly what
  `tests/packaging/npmPackSmoke.test.ts`'s new copy-without-`node_modules` reinstall test (`439af56`)
  exercises.
- **Offline local development** (the mechanism's own stated purpose): confirmed working as intended, both
  at the base SHA and since -- this is exactly what the mechanism, and its dedicated test coverage
  (`tests/cli/prepare/PackageCommandRunner.test.ts`, `tests/testUtils/offlinePokieDependencyOverride.ts`),
  exist to guarantee, and is not in question.

**Why the correction doesn't break offline retries.** The concern the base-SHA finding raised against a
naive "just revert `package.json` after install" fix was that a *plain, manual* `npm install` retry in the
same generated package, on the same machine, would try to resolve `pokie`'s now-portable `"^<version>"`
spec from the registry -- which fails offline for a genuinely unpublished version. The correction avoids
that failure mode not by leaving the `file:` rewrite in place, but because every real retry path
(`pokie init`'s own retry, `GamePackagePreparer`'s dependencies phase) goes back through
`withLocalPokieInstall` itself, which re-derives the local `file:` rewrite fresh from whatever's on disk
before every wrapped `npm install` call and restores the portable spec again once that call settles --
see `withLocalPokieInstall`'s own doc comment in `cli/prepare/PackageCommandRunner.ts` for the current,
detailed statement of this. The one path this still doesn't cover -- a bare, un-wrapped `npm install` run
directly against the persisted `package.json`/`package-lock.json` outside of `pokie init`/the wrapper (e.g.
after deleting `node_modules` by hand) -- reads the portable version range like any other npm dependency
and needs `pokie` to actually be resolvable there (published, or re-resolved by re-running `pokie init`);
this is now the documented, current behavior in the generated `README.md`'s "Moving or copying this
package" section (`renderPackageReadme.ts`), not an unresolved portability gap.

**A genuine, useful contrast: `pokie build --target tsPackage` (`src/generated/GamePackageGenerator.ts`)
is fully portable already**, and never goes through any of the above. It writes `package.json` via the
same `buildPackageJsonPatch` (`"pokie": "^<version>"`, never rewritten to `file:`) and a statically
generated `package-lock.json` seed (`renderBuiltPackageLock.ts`) -- it never spawns `npm install` itself,
so it never needs a local override. See [`05-source-evidence.txt`](05-source-evidence.txt). The cost: its
own generated `dist/index.js` still does a real `require("pokie")` at runtime
(`src/generated/renderBuiltGameModule.ts:196`), so `node_modules/pokie` has to come from somewhere before
that package actually runs -- `renderBuiltPackageLock.ts`'s own doc comment already documents this
explicitly ("Running `npm install` in the built package still works exactly as it would against any
lockfile that predates a fresh install"). This confirms `pokie init`'s host-specific persistence is a
choice specific to that one command's own "install it right now, offline, from wherever `pokie` happens to
be running" contract -- not an unavoidable property of every canonical generated package in this
repository.

## The correction landed since the base SHA

The base SHA's own first round (`0be705f`, whose transcript is [`04-portability-note-fix-transcript.txt`](04-portability-note-fix-transcript.txt))
took a documentation-only approach instead: a new "Moving or copying this package" section in the generated
README, plus an `InitCommand.printPrepared()` warning (`warnIfLocalPokieDependency()`) that printed the
persisted `file:` path back to the user. Reviewer correction identified that approach as insufficient --
the underlying persistence itself was fixable without breaking offline/unpublished local development, since
every real retry path already goes back through the same wrapper (see below). Two follow-up rounds replaced
it with an actual behavioral fix to the mechanism, and **removed** `warnIfLocalPokieDependency()` entirely
(there is no dependency-portability warning in `InitCommand.ts` anymore, since there is no longer a
host-specific dependency left to warn about):

- **`5436387`** -- `withLocalPokieInstall` (`cli/prepare/PackageCommandRunner.ts`) now writes the `file:`
  rewrite to `package.json` immediately before the wrapped `npm install` call, then restores the original
  file content in a `finally` block once that call settles, success or failure alike. The wrapped `npm
  install` still resolves `"pokie"` (and its runtime closure, via `overrides`) against the running
  installation, but only for the duration of that one call; the persisted `package.json` afterward is
  exactly what it was before, i.e. a portable version range. `cli/scaffold/renderPackageReadme.ts`'s generated "Moving or copying this
  package" section was rewritten to describe this transient-resolution behavior accurately instead of the
  old "never reverted" framing.
- **`439af56`** -- a real `npm install` against the transient `file:` rewrite still resolves it as a
  symlink and records that in `package-lock.json` as a `"link": true` entry (plus a second, path-keyed
  metadata entry) -- restoring `package.json` alone left those host-specific lockfile entries behind.
  `restorePersistedPackageLock` (`PackageCommandRunner.ts`) now strips exactly those entries -- by name,
  via the same set of tainted closure names used for the `package.json` rewrite -- once a successful
  install settles, leaving every other, genuinely portable lockfile entry (ordinary registry-resolved
  dependencies) untouched. A project with no lockfile at all (`package-lock=false`) is left as-is.

**Verified in this sandbox**, with real `node_modules/.bin/jest` (the project's own `npm` wrapper being
unusable even for a single named test file -- see the environment blocker above):
`tests/cli/prepare/PackageCommandRunner.test.ts` -- 12/12 passing, covering both the `package.json`
restore-on-success/restore-on-failure behavior and, in a new `describe("normalizing package-lock.json...")`
block, the lockfile-stripping logic directly: stripping the `pokie` link entry and its target metadata,
stripping a closure override's link entry (e.g. `commander`) by name, leaving an unrelated pre-existing
link entry untouched, and leaving package-lock.json alone entirely when the wrapped install never produced
one.

**Not verified live in this sandbox** (same broken-`npm`-wrapper blocker as above, affecting the real
`npm install`/`npm link`/`npm pack` invocations these two suites need -- not `npm run typecheck`, which is
independently confirmed passing, see the "Environment blocker" section above):
`tests/cli/InitCommandWorkflow.integration.test.ts` (npm-link)
and `tests/packaging/npmPackSmoke.test.ts` (npm-pack install, real tarball) were both extended by `5436387`
and `439af56` to assert the corrected, portable persisted shape (`pkg.dependencies?.pokie` no longer
matching `file:`, `package-lock.json` containing no `node_modules/pokie` link entry or host-specific path)
and, in `439af56`, to copy a generated package without `node_modules` and drive a real, independent `npm
install` against only the persisted `package.json`/`package-lock.json`, proving it resolves `"pokie"` fresh
through the portable metadata alone. These remain source-level evidence -- real, already-committed test
files with real assertions against real npm, not re-derived or assumed -- for the forms this sandbox's
broken npm wrapper cannot execute, consistent with this campaign's own protocol for a reproduced, honestly
recorded blocker.

Out of scope, left as-is: `pokie build --target tsPackage` needed no change (already portable). The
`overrides` block's own necessity/size (71 entries in this checkout) is real and load-bearing (keeps
`pokie`'s own transitive deps from ever needing the registry either, deliberately, per
`localPokieDependencyClosure.ts`'s own doc comment) -- narrowing it is a materialization change, not an
audit-scoped documentation fix, and is left for whichever future step actually revisits the mechanism.
