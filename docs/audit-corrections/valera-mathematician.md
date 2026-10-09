# P9-07 — Valera mathematician

Immutable brief: `a80b3554d7f660bf6826f3b0ebeaae5a0bb7e847e436322ff40fb08b992b23d5`.
Preparation base: `c86ac680`. Product corrections and implementation tests do
**not** establish independent campaign completion. All runtime receipts and
completed-step evidence remain unchanged; this reconciliation changes only
this current-step document. No new browser receipt, screenshot or human timing
is supplied by this repair.

## Retained observations and superseded claims

The controller owns the independent collector and production assets. Historical
P9-07 receipt locations are retained below; they concern their own candidates,
not the corrected candidate. The saved reviewer assessment and local contract
trace are the evidence used for this repair; no external receipt was rewritten.

| Candidate / retained harness receipt | Timing and supported scope |
| --- | --- |
| `aa5652b1ad676f486757ee52b61433815b6178c0`, `P9-07-04ffcc258783a889/run-2026-10-09T01-50-58-803Z` and `run-2026-10-09T01-54-51-610Z` | Historical record ends the first rendered observation at 01:51:12.291Z and describes the second run as 01:54:51.611Z–01:55:05.979Z. These short runs cannot establish the requested roughly 20-minute exploration or complete library comparison. |
| `67e61f40478946b0fb9db358705c5d60f7ffa309`, `P9-07-0fd604ea14fa3e6b/run-2026-10-09T10-53-51-402Z` and `run-2026-10-09T10-59-17-603Z` | Historical timings: 10:53:51Z–10:54:27Z and 10:59:17Z–10:59:46Z. Retained observations include saved model edits, play, seeded short simulation, exact generation, read-only PAR reopen and positive rare-source labels. The initial high-cardinality mode exceeded the exact-generation cap; that itinerary limitation is not a publication defect. |
| `32415dc5176aaae7eb237d7ead47adc6237a9710`, `P9-07-c86efe33e5b6c4e6/run-2026-10-09T13-05-34-467Z/frozen-initial.json` and `transcript.json` | Frozen initial actions establish creation/model inspection, play, 100-round `valera-42` simulation and exact generation. They do not establish PAR conversion, terminal library inspection/report/comparison or Stake inspection. An uncorrelated later generation error does not establish a product failure. |
| Same harness, supplementary `run-2026-10-09T13-34-31-500Z/transcript.json` | Independent review confirms editable PAR conversion/reopen and visibly nonzero Stake metrics. The native library draw used `library-verification-seed`, base mode, round 1 and displayed 13.00 win. Its Reproduce & compare action reported missing `stateBefore`/`stateAfter` and failed to reproduce/compare. This is a confirmed P1 product defect, not an unreached action. |

All harness directories above are below
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/`.
Independent finding identity: `P9-VALERA-MATHEMATICIAN`, supplementary fingerprint
`sha256:37c55a69483d92f4`. The prior review assessed
`c15a396cf49f8ca0dbe65919fe9fd79d7567c435` with fingerprint
`sha256:531ab3175e1484eb`. The current producer-contract finding assessed
`b6e9b933366d1f4b127ee017248507899bd720e9`, fingerprint
`sha256:123dc20c2bd95fe7` (`ffab42b88d6e703e`).

The earlier statements that a native seeded draw and completed replay proved
recorded-library comparison, that a clean affected retest closed the campaign,
and that no material finding remained are **superseded**. A rendered artifact
or HTTP replay is insufficient evidence of the frontend comparison. Earlier
initial-pass claims do not override the supplementary confirmed failure.
Historical screenshots stay in their retained harness directories; this repair
adds none and does not prune any sibling-step evidence.

## Findings and product corrections

| Finding / severity | Correction and named regression |
| --- | --- |
| Payout recovery / material P2: at 13:22:06.371Z the payout was restored; at 13:22:55.230Z prior failed-Save diagnostics remained | Previous correction `c15a396c` makes payout edits commit on change and retires old diagnostics on mutation. Retained whole-file evidence: composed integration 2/2, payout recovery 2/2 and Game Model workflow 29/29. The supplementary discard note does not prove terminal discard: its final snapshot still contains the dialog. |
| `P9-07-LIBRARY-COMPARE` / P1: frontend imposed runtime snapshot requirements on native library draws and omitted source provenance from comparison | ReplayTab carries the inspected/stored outcomeSource through the availability gate; pasted bytes cannot substitute for the server's validated source. ProjectDashboardPage carries both sources and selection inputs into comparison. Replay interpretation verifies actual library identity/hash, game, mode, seed, round, algorithm, selected outcome/weight and recorded stake/payout/screen alongside the full round result. Native draws have no live session snapshots; those dimensions are explicitly inapplicable. Ordinary runtime seed/build/state/trace safeguards remain. Regressions: `ProjectDashboardPage.replayWorkflow.test.tsx` (paste and Recent, exact comparison, differing library hash, missing validated source), `domain/interpret/Replay.test.ts` (missing/mismatched provenance and consistent but different selections). |
| `P9-07-LIBRARY-COMPARE` / residual P1/P2 on `b6e9b933`: supported description/author metadata contradicted Studio’s reduced game identity; unchanged CLI output stored its artifact only under outcomeSource | Studio now retains the complete manifest in its native descriptor. Inspection validates against the opened library, rejects conflicting outer results/artifacts and returns the canonical projected artifact from the validated nested record. Pasted loading consumes that server response; Recent and comparison resolve the real outer/nested artifact without inventing hashes or session snapshots. Full game metadata remains compared, so reduced or altered identities do not bypass validation. Producer-backed `ProjectDashboardPage.replayWorkflow.test.tsx` generates an exact metadata-bearing library, invokes public `ReplayCommand`, uses real HTTP inspection and renders Studio paste, CLI paste and Studio Recent through terminal exact comparison. It rejects wrong identities/author/hash, absent game/artifact, altered outcome/payout and conflicting duplicate artifacts. `domain/interpret/Replay.test.ts` also covers nested-only normalization, missing provenance and metadata contradictions. These checks supersede the prior fixture-only native closure claim; independent browser closure remains open. |
| `P9-07-SAVE-REVISION` / P2: pending validation/write accepted edits that were discarded or diagnosed against an older draft, and dropped unsaved-work protection | Game Model disables the entire section form throughout validation/write and synchronously rejects queued mutations/late preview callbacks while Save is in flight. Dirty/navigation/beforeunload protection includes saving. Deferred invalid-validation and successful-write regressions in `ProjectDashboardPage.gameModelWorkflow.test.tsx` exercise attempted edits, all section controls, navigation Stay, retained values, diagnostic recovery and saved/reopened truth. |
| `P9-07-LIBRARY-DURABILITY` / P1 (`cfe36515300a4fa0`): exact publication was followed by an occupied-destination error that replaced inspection | ExportDeployTab now shows submission pending before job allocation and disables generation throughout submission/execution. Successful publication invalidates the old empty-destination preflight before re-enabling generation, while retaining the completed result and inspection action. A fresh server preflight validates the actual published bundle for safe mode updates. `ProjectDashboardPage.libraryDurability.test.tsx` uses real Studio HTTP/services and a candidate-generated tiny Node game: delayed acceptance, disabled duplicate submission, delayed post-publication preflight, repeat generation with a different token, persisted four-outcome contents, remount recovery, occupied-directory rejection and public Inspect library navigation. |

## Acceptance closure ledger

| Immutable obligation | Current evidence and independent boundary |
| --- | --- |
| Cold persona, neutral inputs, isolated application/browser/workspace, frozen actions/confusion/defaults, real bounded timing | Retained initial observations above; no new collector is manufactured. Full cold-user success and qualitative coverage remain independently unproven. |
| Symbols/reels/paytable validation/save/reopen/play; invalid edits and draft recovery | Retained composed workflow and payout recovery; this correction adds deferred-response protection. Fresh-profile affected browser retest remains required. |
| PAR export/import/canonical preview/Apply/managed Save/reopen, workbook preservation and truthful provenance | Retained composed workbook-byte/hash/restart checks and supplementary editable conversion/reopen observation. No workbook or server conversion contract changes. |
| Simulation defaults, seed/mode/workers, requested/completed rounds, RTP/volatility/uncertainty, reopened reports/downloads | Retained short seeded simulation and warnings plus composed parity. Actual defaults remain 10000 rounds, one worker, no explicit seed. Observed RTP is total payout / total stake; volatility is payout standard deviation in payout units. Collector understanding of that formula and those units still needs independent evidence. |
| Tiny exact generation/publication/output/analysis/report, recorded draw/replay/comparison | Retained exact generation and supplementary draw; confirmed P1 corrected with rendered-workflow regressions. Successful current-candidate public comparison and full terminal inspection/report path still need an independent receipt. |
| Job failure/cancellation/resource cleanup, switching/shutdown/polling/durable recovery | Existing service/repository coverage retained and production contracts unchanged. Terminal public cancellation/recovery remains independently outstanding. |
| Positive rare metrics, BigInt boundary, public parity and truthful source restrictions | Retained reader/Studio/report regressions and independent visibly nonzero Stake labels. No math, RNG, formatting or capability change. |
| Node/WASM constructor/first-result/continuation/restore parity; exports/CLI/package/browser boundaries | Existing focused parity tests and public contracts retained. The previous repair changed Studio frontend code; this correction also aligns the native Studio producer and inspection response. Candidate-consistent production browser assets and their independent execution belong to the controller. |
| All material defects corrected and affected tasks rerun cleanly | Product regressions cover accumulated payout/library/save defects. Independent clean browser/application/workspace retest remains open; implementation tests cannot close it. |

## Fixture and check provenance

Neutral fixture inputs remain under `tests/cli/fixtures/p907/`: two literal reels
with two stops, one row/payline and stake 1. The composed test renames B to C,
reverses a reel and changes C's payout to 2 (paid outcomes 0, 0, 2, 2). It uses
real Studio HTTP/services, workbook persistence, generated Node runtime,
Play/CLI/Studio simulation, report downloads/reopening, exact four-outcome
publication and backend replay. Its candidate-source runtime adapter avoids
compiler/npm subprocesses; it does not verify browser delivery.

The supplied Stake fixture retains UInt64-maximum loss weight, unit win weight,
exact total `18446744073709551616` and safe IDs/payouts. Its extra recognition
manifest is fixture preparation, not an export receipt or support for arbitrary
manifest-less Studio imports. Standalone reading without the marker remains
covered. Relative checks preserve positive finite p = 2^-64, RTP 2p, variance
4p(1-p), deviation 2^-31. Moments are floating point; large-total displayed
fractions have a 40-fractional-digit boundary. Native persisted libraries retain
safe-integer weight/total limits; Stake remains inspection-only.

Historical automation receipts remain historical: initial 34-suite/837-test
run (446.044 s), composed rerun 2/2 (2.207 s), prior five-suite/63-test repair
(142.176 s) and payout recovery 2/2 (6.058 s), with root typecheck success.
These do not claim a current-candidate reviewer matrix pass or human timings.
Current repair check results are recorded after foreground execution below.
Production browser build, independent reruns, packaging and official gates are
controller-owned and were not launched by this repair.

Prior foreground correction checks (on the previous repair):

- `npm run test:targeted -- tests/cli/studio-client/src/components/project/ProjectDashboardPage.gameModelWorkflow.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.replayWorkflow.test.tsx tests/cli/studio-client/src/domain/interpret/Replay.test.ts`
  exited 0: three whole files, 178/178 tests, 156.379 s; no test-name filtering.
  Earlier attempts exposed fixture/route mistakes and an overly broad form lock
  affecting read-only New sample. Those and the pre-commit hook's test lint
  findings were corrected before this final run.
- `npm run typecheck` exited 0, including its Studio client compiler; no separate
  successful Studio compiler run or production bundle build is claimed.
- `git diff --check` passed. The controller retains the broader independent
  reviewer matrix; this repair does not claim that matrix passed.


Current producer-contract correction checks:

- `npm run test:targeted -- tests/cli/studio-client/src/components/project/ProjectDashboardPage.replayWorkflow.test.tsx tests/cli/studio-client/src/domain/interpret/Replay.test.ts tests/cli/studio/OutcomeSourceProjectRoutes.test.ts tests/cli/studio/replay/StudioReplayExecutionService.test.ts`
  exited 0: four whole files, 221/221 tests, 58.114 s, no test-name filtering.
  Initial attempts exposed the new HTTP fixture’s export-condition and required
  Home-service wiring errors; both were corrected before this successful run.
  The final pass also covers explicitly malformed outer artifacts, and
  changed-file ESLint passed after formatting the new mutation cases.
- `npm run typecheck` exited 0, including the Studio client compiler. No separate
  production build, browser receipt, packaging or official gate is claimed.
- Payout recovery and pending-save protection retain their prior independent
  whole-file evidence on `b6e9b933`; neither implementation was changed here.
  The complete controller-owned reviewer matrix was not rerun by this repair.
- Remaining independent obligations are unchanged: fresh affected browser and
  workspace retests, terminal public library comparison/inspection/report,
  remaining RTP/volatility interpretation, and bounded cancellation/recovery.
  These automated HTTP/rendered tests are product regressions, not cold-user
  observations or clean-profile closure receipts.
- `git diff --check` and explicit changed-file ESLint passed. The installed
  pre-commit hook checks the staged TypeScript separately.

## Independent browser rerun — 2026-10-09 (candidate `9e26c15`)

Fresh application and browser state were used at
`P9-07-8924bdd53985e359/run-2026-10-09T15-21-14-062Z`. The cold initial
observations were frozen before review feedback. The bounded public path
imported the tiny Blueprint, inspected symbols/reels/paytable, saved it,
settled one Play spin, and ran a 100-round, one-worker simulation with seed
`valera-2026`. The rendered report was RTP 100.00%, hit frequency 50.00%,
volatility 1.00, max win 2.00 and 95% RTP interval 80.40%--119.60%; Studio
also expressly marked that short run as noisy.

The exact Outcome Library preflight showed four combinations. Generation
reported success: four exact base outcomes, RTP 100.00%,
5,860 bytes and 67 ms, and exposed an **Inspect library** action. On the
following rendered recovery state, that action was absent and the same
generator reported it could not load the project. Its expanded diagnostic said
the successful action's `outcomelibrary` output already existed and was not
empty, while `pokie build` required a new or empty output directory. Thus the
visible success claim did not leave an inspectable result; no further generation
retry was sent after the error. This is the current independent P1 finding
`P9-VALERA-MATHEMATICIAN`, blocking the exact-library inspection/report
portion of the required workflow.

Supplementary replay from the public Replay tab did succeed independently:
round 1 with the same seed produced a completed, inspectable/exportable replay
with rendered replay session/job IDs, game version/hash and config hash. A
Cancel attempt could not be uniquely targeted before that one-round job
completed, so it is retained as driver-inconclusive rather than a product
finding. PAR import/export and rare-event Stake inspection remain not reached
in this run because the material library finding blocked the required clean
path. Retained evidence is the frozen initial record, transcript and three
screenshots in that runtime run directory; no generated project/output tree is
committed.

## Durability correction trace and closure

The retained transcript contradicts the earlier interpretation that no second
generation activation occurred: at 15:25:48.532Z the collector activated
Generate, then at 15:25:57.446Z activated it once more because the first
activation had shown no acceptance or disabled state. That second activation's
snapshot still displayed the completed first result. At 15:26:05.203Z it had
been replaced by the load-error message; the expanded diagnostic at
15:26:25.749Z named the occupied `outcomelibrary` directory. The frozen finding
and its three original screenshots remain untouched.

On preparation HEAD `03d7f281`, the source trace confirms the cause:
`handleGenerateOutcomeLibrary` did not set pending state until POST returned;
`pollOutcomeLibraryGeneration` released its guard after completion without
refreshing the immutable preflight. The same button therefore submitted the
old token after publication. Studio's managed-Blueprint snapshot retained
`allowsExistingBundleUpdate: false`, so its final destination guard correctly
rejected the newly non-empty directory, but the frontend replaced its success
with that second job's error. The correction refreshes the token rather than
weakening destination ownership, source-drift checks, deep bundle validation,
atomic publication or retained-mode preservation.

| Accumulated failed criterion | Correction authority and bounded closure |
| --- | --- |
| Payout validation recovery and pending Save revisions | Existing GameModelTab/section protection retained; whole Game Model workflow includes payout recovery and deferred validation/write cases. |
| Native library comparison, complete manifest metadata, canonical CLI nested artifact, pasted and Recent paths | Existing ReplayTab/dashboard normalization, Studio producer and inspection validation retained; producer-backed whole replay workflow and domain interpretation cover exact comparisons and rejection of altered identities/hash/selection/results. |
| Exact generation survives its own follow-up/recovery and exposes inspection | Submission and terminal preflight correction above; real HTTP rendered regression follows both generation requests to successful publication and opens the real result, then checks remount and a failed new destination without losing inspection. |
| PAR preservation, short seeded simulation/report parity, nonzero rare source | Existing composed P9-07 HTTP/Node/public CLI workflow retained and rerun; no math, RNG, workbook or runtime implementation changes. |
| Independent clean-profile retest, remaining metric understanding and terminal cancellation | Controller/verifier obligations remain open. This implementation supplies no new independent receipt, screenshot, human timing or coverage classification. |

The affected call graph is the existing generator form -> API start/estimate/job
poll -> StudioServer binding validation -> Studio generation/prepared planner ->
canonical bundle writer/registry -> durable job projection -> Inspect library
project opening. Direct generation, exact/sampled/bounded policy, cancellation
retry/resume, package mode updates and artifact/Stake handoff retain their own
contracts. No shared constructor, injected callback, writer or CLI default was
changed. The production browser bundle consumes ExportDeployTab; its exact
build and independent execution remain controller-owned under this repair's
bounded command policy. Root typecheck includes the Studio compiler, so a
second standalone Studio compiler run is redundant.

Foreground durability-correction checks:

- `npm run test:targeted -- tests/cli/studio-client/src/components/project/ProjectDashboardPage.libraryDurability.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.outcomeStakeHandoff.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.replayWorkflow.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.gameModelWorkflow.test.tsx tests/cli/studio-client/src/domain/interpret/Replay.test.ts tests/cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.test.ts tests/cli/P907ValeraMathematician.integration.test.ts`
  ran all eight whole files. Seven files passed (232 tests); Build/Export had
  one stale assertion comparing the retry token with the token refreshed after
  that retry's successful publication. The combined run exited 1 (284 passed,
  one failed, 250.028 s). The assertion now captures the pre-submit retry token.
- `npm run test:targeted -- tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx`
  exited 0: 53/53 tests, 50.438 s. Together these runs pass all 285 distinct
  tests across the eight files on the final product source. No test-name filter
  was used. The real HTTP rendered tests emitted React `act` warnings; no test
  failure or product error remains in their passing run. Initial harness
  development corrected the route, Home-service recognition wiring and actual
  library/context response shapes before the successful whole-file run.
- `npm run typecheck` exited 0, including `npm run typecheck-studio-client`.
  An earlier concurrent attempt was rejected by the command policy before
  execution; the successful run began after the test process finished.
- Changed-file ESLint and `git diff --check` passed. The required TypeScript
  pre-commit hook is retained. `npm run build-studio-client`, independent
  browser/CLI collection, packaging and official gates are controller-owned
  and were not run here.

## Supplementary browser continuation — 2026-10-09 (candidate `4aab6e7`)

The retained fresh-profile application state was reopened through the public
Studio UI in `P9-07-6f480bd7dc08a464/run-2026-10-09T16-08-43-406Z`.
The candidate Studio launch used `node ./dist/cli/pokie.js --no-open` and the
recorded continuation profile. A seeded native-library draw (`valera-library-42`)
completed and rendered its exact outcome id, `starter-slot-base` library,
one-of-1,024 weight, base mode, stake, game/version and configuration hash.

The visible native `Replay Artifact` choice exposed only paste and Recent
recovery. Recent reported no replays, while the successfully rendered native
draw supplied neither a durable Recent record nor a public artifact export or
handoff control. Consequently the required recorded-versus-recreated native
comparison could not be completed by this path. Saved-model recovery,
cancellation/recovery and the clean affected retest also remain uncompleted.
This is supplementary evidence, not a replacement for the frozen cold pass.
The two continuation screenshots remain only in the machine-owned runtime
harness; no generated assets or runtime payloads are committed.

## Native draw retention correction

Finding `946bca50ce1e8594` / P1, material
`P9-VALERA-MATHEMATICIAN:sha256:05785ec460ba86b9`, is confirmed. The retained
`15-56-13-979Z/frozen-initial.json` preserves the cold terminology/default
observations and the unseeded draw; the `16-08-43-406Z/transcript.json` preserves
the later seeded draw followed by an empty Replay Artifact recovery surface.
On preparation HEAD `9d8a5aab`, the HTTP route constructed real seeded provenance
and recorded Session Spin history, but never retained a descriptor in the replay
repository or durable job store. Overview rendered the artifact without export,
and its completion callback refreshed only Session Spin. A new real HTTP
regression reproduced the empty Recent list for both seeded and unseeded draws.

The correction retains that same settled artifact through the existing replay
repository and durable lifecycle, exposes its standard download from Overview,
and refreshes both histories. It performs no second draw and invents no wallet,
runtime snapshots or RNG trace. Seeded records carry the full game manifest,
library/hash, mode, derived-round selection algorithm, seed/round, outcome/weight
and results. Unseeded records expose inspection/export and explicitly disable
reproduction. Records remain scoped to the project captured before asynchronous
sampling; unsuccessful or unsupported sampling creates no completed descriptor.

The real rendered regression also exposed object-order comparison failures:
streaming artifact metadata has canonical sorted keys, while the manifest keeps
authored key order. Studio outer/nested validation and public native replay now
compare canonical JSON content, preserving every field and array order. Actual
Studio/CLI producer tests still reject altered author/game, library hash,
missing provenance, conflicting artifacts and changed selection/results.

| Accumulated criterion | Current implementation closure |
| --- | --- |
| Native draw reaches recorded-versus-recreated comparison | Real Overview draw -> download -> Replay Artifact Recent, then a new Studio process/frontend recovers the same file-backed descriptor and completes exact comparison through Recent and pasted download. |
| Native comparison metadata, canonical CLI nesting and runtime safeguards | Whole producer-backed replay workflow, interpretation, replay execution, public CLI and project replay files exercise exact comparisons, field rejection, object-order equivalence and meaningful screen-order rejection. |
| Pending Save revisions and payout recovery | Whole Game Model workflow retains deferred validation/write protection and payout recovery. |
| Exact generation recovery and durable inspection | Whole library durability workflow and generation service tests retain occupied-destination protection and inspectable completed results. |
| PAR, bounded simulation/public math parity and nonzero rare source | Composed P9-07 integration and outcome-source routes/components retain these contracts; math, workbook, Node/WASM and probability implementations are unchanged. |
| Independent cold understanding, fresh affected retest and cancellation/recovery receipts | Still controller/verifier obligations. The implementation tests are not independent collection and do not close these rows. |

The affected graph is Overview -> sample API -> atomic native selector -> existing
replay retention/job lifecycle -> project-scoped Recent/status/download -> server
inspection -> ReplayTab/dashboard comparison -> native replay/CLI reconstruction.
Session Spin still receives the same draw and identity. Runtime replay and
simulation-sample callbacks retain their command-specific behavior. No shared
constructor default, injected callback, bundle writer or CLI behavior was
replaced. All prior receipts and screenshots are preserved; this repair adds no
browser evidence or screenshot. Production browser build and independent
browser/CLI reruns remain controller-owned under the bounded policy.

Foreground checks on the final correction source:

- `npm run test:targeted -- tests/cli/studio/OutcomeSourceProjectRoutes.test.ts tests/cli/studio-client/src/components/project/ProjectDashboardPage.replayWorkflow.test.tsx tests/cli/studio/replay/StudioReplayExecutionService.test.ts tests/cli/studio-client/src/components/project/ProjectDashboardPage.outcomeSourceWorkflow.test.tsx tests/cli/studio-client/src/components/project/OutcomeSourceOverview.test.tsx tests/cli/studio-client/src/domain/interpret/Replay.test.ts tests/project/replayOutcomeSourceProject.test.ts tests/cli/commands/ReplayCommand.test.ts`
  exited 0: eight files, 266 tests, 73.774 s. Earlier runs reproduced the
  missing retention and then the real metadata-order defect. A subsequent run
  passed the production paths but exposed an ineffective screen-order test
  fixture (a one-cell screen); the final fixture uses two distinct cells.
- `npm run test:targeted -- tests/project/replayOutcomeSourceProject.test.ts tests/cli/studio/replay/StudioReplayExecutionService.test.ts tests/cli/studio/OutcomeSourceProjectRoutes.test.ts tests/cli/studio-client/src/components/project/ProjectDashboardPage.gameModelWorkflow.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.libraryDurability.test.tsx tests/cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.test.ts tests/cli/P907ValeraMathematician.integration.test.ts`
  exited 0: seven files, 156 tests, 136.613 s. Together the final runs cover
  twelve distinct whole files. Rendered HTTP tests retain React `act` warnings.
- `npm run typecheck` exited 0, including the mandatory Studio client compiler;
  no second standalone compiler run was needed. `git diff --check` passed.
  The changed-TypeScript ESLint commit hook remains enabled. No official gate,
  browser rerun, packaging or controller-owned build was launched here.
