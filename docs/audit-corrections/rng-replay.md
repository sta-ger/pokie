# P9-01: Node/WASM seeded initialization and continuation

Baseline: `444cfdd4a8e96b7d9c97d2e65969de52a44ab6dd`. Candidate: the single
`[P9-01]` correction commit containing this document on
`task/P9-01-20261008132034`; obtain its exact SHA with
`git log -1 --format=%H -- docs/audit-corrections/rng-replay.md` (also supplied
in the implementer report). Candidate runtime API: `1.1.0`.
Implementation SHA-256 identities:

- `src/wasm/PokieWasmRuntime.ts`: `6d89ab17c5bad1dbf44b76b747fc879d44a076a065b395e4084ea9903bf5cdd1`
- `src/wasm/PokieWasmRuntimeApi.ts`: `e4ccd8c2bcd66116d6613ae1e8f174f0fd445606c7921ce3052f0a327c957e98`
- `src/wasm/worker.ts`: `da5bfaff5bf6dfa0ea9ecc744dad06ef9a7bf2c4e8f9e98c3ee62b835a539f18`

## Exact reproduction

```json
{
  "manifest": {"id": "rng-parity", "name": "RNG parity", "version": "1.0.0"},
  "reels": 2,
  "rows": 1,
  "symbols": ["A", "B"],
  "reelStrips": [["A", "B"], ["A", "B"]],
  "paylines": [[0, 0]],
  "availableBets": [1],
  "paytable": {"A": {"2": 2}, "B": {"2": 1}}
}
```

Generate a Node package with `GamePackageGenerator.generate`, load its public
`pokie.entry` with `loadPokieGameRuntime`, and build the same Blueprint with
`WasmArtifactBuilder.build`. Use `game.createSession({seed: "0"})`,
`session.setBet(1)`, `session.play()` against `loadPokieWasmFileRuntime` with
`new SeededPokieWasmHost("0")`, `runtime.createSession("0")`, and
`await session.play({bet: 1})`. The shared production fixture does exactly this;
Jest resolves the generated module's actual `require("pokie")` to candidate
source, rather than stale compiled output or an installed release.

Before the fix, the newly added generated-package regression failed for all
three seeds while the old rewound-reference golden passed. For string `"0"`,
the first screen happened to agree (`[["A"],["B"]]`, payout 0, credits 999),
but Node's continuation was `3921318019` versus WASM's `258186393`.
For `"wasm-parity-golden"`, Node's first paid round was AA/payout 2/credits 1001,
versus baseline WASM's BB/payout 1/credits 1000. The baseline initial serialize
path omitted `rngState`; its restore path then retained the receiving host's
position. These are constructor-consumption and state-ownership defects.

Candidate string `"0"`, bet 1, unchanged Node production results:

| Paid round | Screen (reel major) | Payout | Credits |
| --- | --- | --- | --- |
| 1 | `[["A"],["B"]]` | 0 | 999 |
| 2 | `[["B"],["B"]]` | 1 | 999 |
| 3 | `[["B"],["A"]]` | 0 | 998 |
| 4 | `[["A"],["A"]]` | 2 | 999 |

Immediately after creation, sequence is 0, credits are 1000, two initial draws
are recorded, and `rngState` is `258186393`. Serialization takes no extra draw.
Capture `initial = session.serialize()`, then `first = await session.play({bet: 1})`;
`runtime.replay(initial, [{bet: 1}])` returns that complete first round and its
continuation, with `stateBeforeFinal` exactly equal to `initial`. This also holds
on fresh or advanced receiving hosts, after other sessions/replays have used
the runtime, and for later snapshots, repeated replay, restore-and-play, empty
replay, and continuation from `stateAfter`.

## Contract and compatibility

- Seeded creation resets to the **public session string seed**, then consumes one
  draw per reel, matching Node's constructor-generated unpaid initial screen.
  Initialization never calls the WASM paid-play export, increments sequence, or
  changes credits. Its draws are included in history. Repeated creation and
  pre-advanced or differently labelled seeded hosts therefore have defined results.
- Every restorable live session reinstates its own RNG position before playing.
  Invalid stakes and insufficient credits fail before drawing; state/request
  errors remain recoverable. The existing floor(draw × strip length), line,
  wild, scatter, all-wild rejection, and unsupported-model boundaries remain.
- Direct Node sessions, numeric versus string seeds, generated CJS/TypeScript,
  scaffolded sessions, ReplayRecorder, and nested free games retain their existing
  behavior. Node executable persistence already captures constructor RNG under
  `featureState`; the new first-spin reconstruction regression confirms it. Public
  network serializers continue to omit RNG state.
- Existing later WASM states with authoritative `rngState` restore **without**
  initialization or extra draws. A regression pins the actual old sequence-3
  state (`wasm-parity-golden`, `rngState: 1365295755`, credits 1000, six old draws)
  and its next draw `0.14641731861047447`, AB screen and credits 999.
- Legacy empty sequence-0 states without RNG state migrate to seeded initialization.
  This covers CLI/Studio's existing initial descriptors, including replay-only
  artifacts; replay never requires public play/serialize capabilities. Missing
  later continuation is rejected with `missing its deterministic RNG continuation`.
  A nextRandom-only custom host keeps live execution and its existing draw timing;
  a seed label cannot recreate its stream, so deterministic restoration reports
  `cannot restore deterministic RNG continuation from a seed label`. Custom hosts
  providing state need a matching restoration method for session-owned execution.
- Worker state now includes immutable draw-tape identity, cursor, seed and seeded
  verifier position. Fresh/restored Workers must receive the same **complete** tape;
  a seeded two-reel session needs `2 + 2 * paidRounds` draws. Repeated replay restores
  both positions. Incompatible tapes/positions and mismatched supplied draws are
  rejected; exhaustion leaves the settled snapshot intact. Old numeric seeded
  Worker continuations migrate by locating their authoritative position on a verified
  tape, never by reading the receiving cursor. Old unseeded later states without
  continuation are insufficient and rejected; empty unseeded Worker states use the
  explicitly known tape origin. Failed replacement initialization preserves an
  existing Worker; traps, cancel and disposal release it.
- API version `1.1.0` signals the corrected seeded creation/ownership semantics.
  Canonical ABI, RNG protocol, serialization identifiers, artifact descriptors,
  builder bytes and sidecars remain v1: their shapes/integrity binding do not change.
  Root, browser and WASM exports share the same implementation and API version.
  Newly seeded WASM round outcomes intentionally change to the established Node
  sequence; old authoritative continuation remains usable. Current portable goldens
  and their browser-readable twin were updated from unchanged Node results, with
  the reference rewind removed. Historical campaign/benchmark evidence is untouched.

## Bounded verification

The pre-fix reproduction command was
`npm run test:targeted -- tests/project/wasm/WasmRuntimeParity.golden.test.ts`:
3 new production cases failed; 5 old cases passed. Intermediate development runs
caught stale portable goldens and test harness expectations; these were corrected.
A committed-tree rerun also exposed the Studio helper's 100-immediate-poll race
with filesystem work; it now awaits terminal status with a bounded elapsed-time
budget rather than exhausting an iteration count before I/O completes.
The final complete named run exited 0: **16 suites, 251 tests passed**:

```sh
npm run test:targeted -- tests/browser/WasmRuntimeApi.test.ts tests/cli/WasmWorkflow.integration.test.ts tests/cli/commands/ReplayCommand.test.ts tests/cli/commands/SimCommand.test.ts tests/cli/studio-client/src/components/project/ProjectDashboardPage.wasmWorkflow.test.tsx tests/cli/studio/WasmStudioWorkflow.integration.test.ts tests/generated/GamePackageGenerator.test.ts tests/project/WasmArtifactBuilder.test.ts tests/project/wasm/WasmRuntimeApi.test.ts tests/project/wasm/WasmRuntimeParity.golden.test.ts tests/project/wasm/WasmRuntimeWorker.test.ts tests/replay/ReplayRecorder.test.ts tests/server/spin/SpinSessionPersistence.integration.test.ts tests/session/videoslot/VideoSlotSessionGoldenSeeds.test.ts tests/session/videoslot/VideoSlotWithFreeGamesSessionGoldenSeeds.test.ts tests/session/videoslot/combinations/SeededRandomNumberGenerator.test.ts
npm run typecheck
```

Typecheck exited 0 (root and its included Studio client compiler). Regression
coverage includes the generated package's main/exports/pokie.entry, transpilation
and execution of generated TypeScript, three seeds and strip lengths 2/3, portable
public exports (literal `pokie/browser` and `pokie/wasm` imports mapped to candidate
source, with published ESM/CJS/subpath destinations pinned), CLI run/sim/replay JSON and output descriptors, real Studio Play,
Simulation and chunked Replay routes/downloads, and rendered Play with transported
before/after state. Simulation deliberately starts with a larger bankroll; compare
stakes, wins and screens, rather than its absolute balance. Cancellation/failure
checks confirm no successful replay descriptor and no retained active job.

The standalone Chromium fixture/harness inputs were kept consistent with the new
initial draw budget and complete Worker continuation. That browser campaign,
production bundles, npm-pack smoke, official gates and publication were **not run**;
they belong to the controller. No historical evidence was changed or pruned.
