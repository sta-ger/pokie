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

`/usr/local/bin/npm` in this implementer sandbox fails on *every* invocation with a real shell syntax
error in its own wrapper script (`case " $* " in *' check:fast '*|*' check:full '*|...`), not just the
project-wide gates it's meant to restrict -- reproduced fresh this round:
[`00-npm-broken.txt`](00-npm-broken.txt). That means no real `npm install`/`npm pack`/`npm link`/`npm run
build` can be spawned by this implementer at all, so:

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

## What was found

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
- **This rewrite is never reverted.** `GamePackagePreparer`/`InitCommand` never restore
  `buildPackageJsonPatch`'s own portable `"pokie": "^<version>"` spec once the "dependencies" phase has
  run. The `file:` specs left on disk *are* the package's own canonical, persisted `package.json` -- the
  exact file a user is meant to keep, hand-edit, `git add`, and move.

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
and ephemeral (would be discarded/overwritten the moment install runs); the second is what's actually left
behind, and it is host-specific.

**Classification: CONFIRMED.** A canonical `pokie init` package's persisted `package.json` does carry a
host-specific `file:` dependency (plus a host-specific `overrides` block for `pokie`'s entire transitive
runtime closure), and does so **by design** -- this is not an accident, it's deliberately built and
covered by three separate, already-committed test files that predate this step and explicitly assert the
exact `file:` shape as correct, across three of this audit's own named installation forms:

| Installation form | Test (already committed, predates this step) | Asserted persisted shape |
| --- | --- | --- |
| Unpublished checkout | `tests/cli/prepare/PackageCommandRunner.test.ts` ("also rewrites every one of pokie's own real runtime dependencies...") | `patched.dependencies.pokie === file:${REPO_ROOT}`, `patched.overrides.commander/exceljs/dayjs === file:${REPO_ROOT}/node_modules/<name>` |
| npm-link | `tests/cli/InitCommandWorkflow.integration.test.ts` ("...from a real npm-linked installation") | `pkg.dependencies?.pokie === file:${linkedPokieRoot}` (a real `npm link ${REPO_ROOT}`, real `npm install`) |
| npm-pack install | `tests/packaging/npmPackSmoke.test.ts` ("scaffolds a package in place via a fully non-interactive `pokie init`...") | `scaffoldedPkg.dependencies?.pokie === file:${path.join(installDir, "node_modules", "pokie")}` (a real tarball, real `npm install`) |
| Future published npm install | Source only (`05-source-evidence.txt`) -- no test exercises this because `pokie` isn't published yet | Would be identical: `registerCliCommands.ts:66`'s wiring has no "already published" branch, so even a genuinely-published running installation still forces `file:<pokiePackageRoot>` |

This implementer's own sandbox can't execute the npm-link/npm-pack-install rows directly (npm is broken
here -- see above), so those two rows are cited as **source-level evidence**: real, already-committed test
files with real assertions, not re-derived or assumed. The unpublished-checkout row *was* executed this
round, via the recording-double reproduction above (real production code, no real npm process, same
result the real integration test already asserts).

**Move/copy portability, reasoned from the exact mechanism above (real npm still unavailable to actually
run the "after" half of a move/copy live in this sandbox):**

- **Moving the generated directory** (same machine, `pokiePackageRoot` untouched): every `file:` spec
  written is an *absolute* path (`pokiePackageRoot` itself is always absolute -- `path.dirname` of a
  `file://` URL), and it points at `pokie`'s own installation location, never at the generated package's
  own path. Moving the generated package elsewhere on the same machine does not change where `pokie`
  lives, so a fresh `rm -rf node_modules && npm install` there continues to resolve identically. Not
  broken by moving.
- **Copying to another machine/environment, then `npm install` from scratch:** the identical absolute
  `file:` targets (`pokiePackageRoot` and each of its 71 transitive dependency roots in this checkout's
  own case) essentially never exist at that same absolute path on a different machine or a fresh
  environment (a different developer's checkout location, a CI runner, a Docker image). `npm install`
  there fails to resolve those specs (`ENOENT`/`ENOTDIR` on the `file:` target) **unless** either (a)
  `node_modules` is copied along with the package (no reinstall is needed there at all -- Node's own
  module resolution never re-validates `node_modules` against `package.json` on its own), or (b) a
  matching `pokie` installation happens to already exist at that exact same absolute path on the new
  machine, or (c) `pokie` has since been published and the `file:` spec is manually replaced with a
  version range. This is the one genuinely confirmed portability gap: real, reproducible from the source
  alone, and not previously documented anywhere in this repository (`README.md`, the generated
  `README.md`/`renderPackageReadme.ts`, or any doc comment) before this round.
- **Offline local development** (the mechanism's own stated purpose): confirmed working as intended --
  this is exactly what the mechanism above, and its dedicated test coverage
  (`tests/cli/prepare/PackageCommandRunner.test.ts`, `tests/testUtils/offlinePokieDependencyOverride.ts`),
  already exist to guarantee, and is not in question.

**Why this can't simply be "fixed" by reverting `package.json` to the portable spec after install
completes**, the naive reading of "separate ephemeral install-time resolution from the persisted
dependency": doing that would make a *plain, manual* `npm install` retry in the same generated package, on
the very same machine, try to resolve `pokie`'s now-portable `"^<version>"` spec from the registry --
which fails offline for a genuinely unpublished version, breaking the exact "keeping unpublished offline
local development viable" guarantee the acceptance criteria itself protects, and contradicting all three
already-committed test files in the table above. There is no `file:`-based mechanism that can be
simultaneously (a) resolvable from a bare `package.json` with no network access to an unpublished package,
and (b) portable to a machine that doesn't already have a copy of that package somewhere on disk --  that
tension is intrinsic to how npm's own `file:` specifier works, not a defect specific to this codebase.

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

## The fix landed this round

Given the above, a behavioral change to the mechanism itself is out of scope for this round (the step's
own instruction frames this explicitly as auditing *before* changing dependency materialization, and any
such change would need to be verified against real `npm install` runs this sandbox cannot perform). What
*is* both safe and directly responsive to "separate ephemeral... from... persisted" is making that
distinction visible at the two places a real `pokie init` user would actually need it, since neither said
anything about it before this round:

- **`cli/scaffold/renderPackageReadme.ts`**: a new "Moving or copying this package" section in the
  generated `README.md` every `pokie init` package already gets, explaining the `file:` spec, why it's
  there, and exactly what does/doesn't survive a move or copy.
- **`cli/commands/InitCommand.ts`**: a new `warnIfLocalPokieDependency()`, called from the existing
  `printPrepared()` success path, reads the persisted `package.json` right back and prints an explicit
  `Note:` -- with the *real* resolved path, not a canned string -- whenever the dependency it just wrote
  is in fact a `file:` spec (i.e., every real invocation today, given the unconditional wiring above; a
  no-op the moment the mechanism ever changes, since it reads the actual written value rather than
  assuming). Points at the generated README.md for the full explanation.
- **`cli/prepare/PackageCommandRunner.ts`**: `withLocalPokieInstall`'s own doc comment now states the
  trade-off explicitly (never reverted, why, and what it costs) next to the pre-existing "why this exists"
  rationale, and cross-references `renderBuiltPackageLock.ts`'s contrasting `pokie build` behavior for a
  future reader who wonders why the two commands differ.

Verified with a real, unmocked reproduction (recording double standing in for `npm`, not a real npm
process -- same constraint as the mechanism transcript above): a scaffold whose merger persists a `file:`
`pokie` dependency prints the new `Note:` line with the real path and points at `README.md`; a scaffold
whose merger persists an already-portable semver spec prints nothing extra. Full transcript:
[`04-portability-note-fix-transcript.txt`](04-portability-note-fix-transcript.txt).

Regression coverage: the full pre-existing `InitCommand.test.ts` (27/27), `PackageCommandRunner.test.ts`
(7/7), `GamePackagePreparer.test.ts`, `GamePackageMerger.test.ts`, `GamePackageCreator.test.ts`,
`withLocalPokieDependency.test.ts`, and `BlueprintProjectMaterializer.test.ts` all still pass unchanged
(71 + 49 tests across the two runs below, no assertions touched) -- none of them assert on
`printPrepared()`'s exact stdout (only `.toContain(...)` checks), so the new note is additive, not a
behavior change to anything already covered. `npm run typecheck` (via a direct `tsc` invocation, since the
project's own `npm` wrapper is broken for every invocation in this sandbox -- see above) and
`eslint` against the three touched files both ran clean.

Out of scope, left as-is: the underlying `file:`-persistence mechanism itself, on all three grounds above
(it's intentional and multiply-tested; a true fix is provably impossible without either publishing `pokie`
or a materially larger vendoring change; and this step's own instruction scopes the actual materialization
change to a later step). `pokie build --target tsPackage` needed no change (already portable). The
`overrides` block's own necessity/size (71 entries in this checkout) is real and load-bearing (keeps
`pokie`'s own transitive deps from ever needing the registry either, deliberately, per
`localPokieDependencyClosure.ts`'s own doc comment) -- narrowing it is a materialization change, not an
audit-scoped documentation fix, and is left for whichever future step actually revisits the mechanism.
