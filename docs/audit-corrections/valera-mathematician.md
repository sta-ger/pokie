# P9-07 — Valera mathematician

## Independent browser verification — 2026-10-09 (candidate `46d02af`)

Fresh candidate-bound application, browser and fixture state were created in
`P9-07-dfc74a68844b16dd/run-2026-10-09T18-19-26-487Z`. The Studio source
launch was the candidate checkout's `node ./dist/cli/pokie.js --no-open`; the
collector's initial observations were frozen before the reviewer hand-off was
read. The candidate build receipt, frozen observations and full transcript
remain in that machine-owned run directory.

The cold public path loaded the supplied tiny Blueprint, inspected reels and
the paytable, made and restored a payout edit, saved it, and settled a real
no-win play round (stake 1, credits 999, payout 0). A one-worker, 100-round
simulation seeded `valera-p9-seed` completed in 16 ms with RTP 72.00%, hit
frequency 52.00%, volatility 0.78, max win 2.00 and a 95% RTP interval of
56.80%--87.20%. The collector recorded the UI's explicit low-round warning and
10,000+ recommendation, interpreting this as a noisy estimate rather than a
certified RTP.

Exact library preflight reported four combinations. One accepted exact base
generation completed with four outcomes, RTP 75.00%, 6,021 bytes and 69 ms.
Its native reader drew `outcome-5d52fbab29e92341` with seed
`valera-library-draw`, library `small-model-base`, base mode and stake 1.00.
The recorded artifact replayed as job `ab91f843f5704173a81611340ab23f44` and
visibly matched the recorded result, library hash, selection inputs, outcome,
screen, wins, payout and steps; state/RNG were explicitly inapplicable for a
library draw. After a public reopen, a second seeded draw
`valera-library-second` was retained alongside the original and recreated
records with distinct record identities in Replay Recent.

The public PAR export completed at its disclosed fresh path. Reopening it
reported a read-only PAR spreadsheet with the same warnings and truthful
`parsheet-provenance-present`: exported by pokie v1.3.0 with the recorded hash
matching imported data. The independently supplied `source-2` was checked,
added and opened through Projects. Studio identified it as a Stake Engine
export and rendered nonzero rare metrics: RTP `1.08e-17%`, hit frequency
`5.42e-18%`, max win 2. Its stated source boundary correctly withholds a
recoverable Blueprint/manifest.

No rendered P0/P1/material-P2 failure occurred in this run. The frozen
collector did note that the read-only export still exposes a Game Model tab
whose unavailable sections are less direct than its Overview boundary, and
that the paytable's match-count increment/decrement controls lack labels.
Those were not assessed as material launch blockers. Reviewer checklist
coverage still missing from this bounded run: an independent terminal
cancellation/recovery interaction, explicit occupied-destination repetition,
and the full clean affected-retest matrix. This evidence therefore does not
claim campaign closure.

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

## Independent browser verification — 2026-10-09 (candidate `b4bd45d`)

Fresh Studio application and browser state were collected in
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-07-f7f99e3f48be1b8c/run-2026-10-09T16-43-47-173Z`.
The initial observations were frozen before the reviewer hand-off was read.
The candidate launch used the source checkout's `dist/cli/pokie.js`; the
candidate CLI was built once beforehand.

The cold session created the starter game and made bounded saved edits: `A` to
`Ace`, the first reel order, and Ace three-of-a-kind payout from 10 to 11.
The visible model updated dependent reel/paytable references. A seeded play
round (`valera-play-1`) settled at stake 1 with a 6.00 line win. A one-worker,
50-round seeded simulation (`valera-sim-1`) completed in 0.1s and rendered RTP
92.00%, hit frequency 16.00%, volatility 2.31, max win 8.00 and a 95% RTP CI
of 28.11%--155.89%. The UI explicitly warned that 50 rounds is noisy; this
was recorded as an estimate, not a certified RTP.

Exact base Outcome Library generation acknowledged submission and completed:
1,024 outcomes, exact RTP 100.78%, 871,951 bytes and 1320ms. The public native
reader drew `outcome-a56b4e1bd376cf95` with seed `valera-library-1`, weight
1/1024, recorded game/version/config hash and a 6.00 K line win. Replay Recent
opened a completed, full, inspectable/exportable reconstructed round with the
same seed/mode/round and the same result; its visible comparison disposition
truthfully stated that no prior result was available to compare.

After freeze, the supplied neutral `source-2` fixture was added through the
public Projects check/add/open workflow. Studio identified it as a Stake Engine
export and visibly reported nonzero rare-event metrics: base RTP
`1.08e-17%`, hit frequency `5.42e-18%`, max win 2. Its reader limitations also
truthfully state that it reads the mode fully and cannot reconstruct Blueprint
or manifest provenance. A direct manifest-file attempt in the Blueprint loader
was rejected with clear validation errors and was not classified as a product
failure; the Projects workflow is the appropriate route.

Three screenshots, the frozen initial record and transcript are retained only
under that runtime harness. No generated projects, libraries, profiles or raw
logs are committed. Supplementary gaps remain: public PAR export/import
round-trip, downloaded-artifact restart/reopen comparison, cancellation and
recovery, and clean affected retest. These observations therefore do not close
the reviewer checklist or supersede the frozen initial history.

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

## Supplementary recovery verification — 2026-10-09 (candidate `b4bd45d`)

The retained frozen initial record remains immutable.  A supplementary launch
of the candidate source's `dist/cli/pokie.js --no-open` used its retained
application profile at
`P9-07-f7f99e3f48be1b8c/run-2026-10-09T17-07-13-779Z`.  The public native
library Overview accepted one seeded draw, `valera-closure-1`, disabling Draw
while accepted and then rendering outcome `outcome-d9d545c2b6de3b43`, library
`starter-slot-base`, base mode, stake 1, and the local terminal statement
“Saved in Replay Recent”; its visible download link was also exposed.

After closing that launch and reopening the retained library through the public
Projects UI in `run-2026-10-09T17-11-11-864Z`, Replay Artifact rendered only
two indistinguishable `? round 1 — Reproduced` choices.  Neither item exposed
the just-drawn source, seed, mode, or round, so the promised record could not
be uniquely selected for the required recorded-versus-recreated comparison.
This is a supplementary P1 finding in the current candidate's durable native
draw-to-Replay handoff, not a replacement for the frozen cold observations.
The bounded receipts are the two transcripts under the machine-owned harness;
no new screenshot, profile, generated project, library, or browser payload is
committed.

## Recent provenance correction (`37fb8f677293c018`)

The two supplementary transcripts above were read without modification. On
preparation HEAD `ac707b52`, the confirmed draw's descriptor is retained in the
file-backed replay job result. However, `listJobs` projects restarted jobs without
game, totals, completion time or library selection identity. ReplayTab's two
Recent surfaces render only game/round/status, hide seed/mode and call a settled
Overview draw “Reproduced”. This explains the saved `? round 1` choices; it is
not evidence that the draw itself vanished. The prior single-record restart
regression selected by round alone and did not prove distinguishable provenance.
Its earlier closure claim is superseded for this criterion.

The live and recovered summaries now derive library ID/hash/outcome from the
retained descriptor, preserve game/totals/completion time, and retain the durable
request's recorded-draw classification. Both Recent surfaces share one label:
game/round, Recorded draw versus Reproduced, library ID/hash, seed, mode, selected
outcome, time and unique record ID. Equal-input draws remain distinct. Resolved
native modes come from the retained descriptor during recovery; the public API
continues to require explicit recorded seed/mode before exact reproduction. Live/recovered times use the same job lifecycle clock. No current-library
lookup substitutes for historical provenance, and full artifacts remain in the
existing project-scoped detail/download path.

| Accumulated failed criterion | Product closure / bounded regression |
| --- | --- |
| Recorded draw handoff and distinguishable restart selection | Real Overview creates two seeded draws, including `valera-closure-1`; file-backed server/frontend restart preserves both summaries and renders matching provenance in both Recent surfaces. The intended seed is uniquely selected, loaded and compared to a fresh reproduction; pasted download also reaches exact comparison. |
| Missing snapshots, full game metadata and canonical CLI nested artifacts | Whole producer-backed replay workflow/interpretation/service/CLI/project files retain exact comparison and rejection of altered hash/game/author/selection/results/conflicting artifacts. A completed native reproduction is also recovered after restart. |
| Unseeded/failed sampling and runtime replay isolation | Unseeded draw survives restart for inspection/export while reproduction stays disabled; failed sampling adds no record. Runtime replay summary/detail/download preserve their identities and totals after file-backed restart, remain classified as reproduction, and reject another project's access. |
| Payout recovery, pending Save revisions, exact-generation durability | Whole Game Model, library durability and generation service regressions retain the prior corrections. |
| PAR/public math/report parity and nonzero rare source | Composed bounded P9-07 integration and source route/Overview workflows retain these contracts; math, Node/WASM, RNG and workbook implementations are unchanged. |
| Cold understanding/frozen observations, real timings, clean browser retest, terminal public cancellation/recovery | Retained independent receipts remain authoritative. Fresh affected verification and production browser assets remain controller-owned obligations; these tests do not manufacture or close them. No screenshot is added. |

Consuming boundaries are the root/Studio TypeScript compilers, Studio HTTP
list/status/download projection and Studio client production bundle. Root
`npm run typecheck` includes `typecheck-studio-client`; the duplicate compiler
command is unnecessary after that passes. `build-studio-client` is explicitly
listed as an orchestrator-owned gate and was not launched. The current step's
document alone is reconciled; all prior evidence remains immutable.

Permitted foreground check evidence for this correction:

- The thirteen-file focused regression run covered the prior retention matrix
  above plus ReplayTab. Twelve files passed; the three producer cases in the
  replay workflow failed because this repair's test request omitted the mode
  required by the existing public validation guard. That fixture was corrected,
  preserving the guard. An earlier four-file run also exposed the live/durable
  timing mismatch corrected above and an undefined-field matcher issue.
- `npm run test:targeted -- tests/cli/studio-client/src/components/project/ProjectDashboardPage.replayWorkflow.test.tsx tests/cli/studio-client/src/domain/interpret/Replay.test.ts tests/cli/studio/replay/StudioReplayExecutionService.test.ts tests/cli/studio-client/src/components/project/ReplayTab.test.tsx`
  exited 0 on the final correction source: 4/4 files, 217/217 tests, 66.996 s.
  Together with the nine unchanged accumulated-regression files from the
  broader run, thirteen distinct whole files are covered. No test-name filters
  were used. The rendered HTTP regressions retain existing React `act` warnings.
- A standalone `npm exec -- eslint` attempt was rejected by the clone's command
  policy before ESLint ran. Lint authority remains the mandatory staged-file
  pre-commit hook; it is not bypassed.
- `npm run typecheck` exited 0, including `npm run typecheck-studio-client`.
  `git diff --check` passed. No duplicate standalone Studio compiler, production
  build, browser/CLI verifier rerun, packaging or official gate was launched.
  Fresh-profile affected verification remains independent work on the committed
  SHA, as required by the bounded implementer policy.

## Supplementary selection correction (`3e8920f5ba0ba3ab`)

The retained `P9-07-29c0fdc577e7f5e8/run-2026-10-09T17-48-28-040Z/transcript.json`
was read unchanged. Its supplementary retained-profile session ends at
17:51:25.709Z (177.669 seconds), with no screenshots. Two successful native
draws used `closure-library-a` and `closure-library-b`, selecting the same
outcome. At 17:51:01.471Z Recent showed duplicate generic rows and duplicate
Inspect / Reproduce & compare actions. This is a confirmed P1 selection
failure; the previous source-test closure does not prove that delivered session
worked or replace its frozen cold observations.

Preparation HEAD `07ffd468` already projects full native provenance in source.
The clone's supplied `dist/cli/studio/replay/StudioReplayExecutionService.js`,
however, still omits source/outcomeSource in live rows and descriptor summaries
in recovered rows. Its browser bundle contains the source helper's conditional
early return: absent native summary fields reduce the row to game/round/status.
This source/distribution discrepancy explains how the saved presentation can
persist despite the previous source correction; it does not establish which
bytes the independent launch served. No generated asset was rewritten here.
The new domain regression first failed on current HEAD with the exact
`? round 1 — Reproduced` label despite retained seed/mode/record inputs.

The shared label now always exposes retained seed, mode, time and record ID,
including older summaries. Missing source remains explicitly "not recorded";
no current-library identity is inferred. Native summaries keep library ID/hash,
outcome and Recorded draw classification. Recent Inspect and Reproduce & compare
now visibly name the record and expose its full identifying label as their
accessible name. Both Recent surfaces still invoke the existing project-scoped
detail and validated comparison paths; availability and runtime safeguards are
unchanged. Controller verification must consume matching server and browser
artifacts from the committed candidate, rather than reuse the supplied server
distribution. The production build and independent rerun remain controller-owned.

| Accumulated criterion | Final product regression authority |
| --- | --- |
| Distinct native draws, durable handoff and unambiguous selection | Real HTTP/rendered Overview draws use both saved seeds and assert the same outcome, distinct record IDs and both histories' provenance after file-backed restart. Unique Recent actions are asserted. Both seeds reach exact comparison from the picker; the Recent compare action and pasted download also reach terminal exact comparison. |
| Native comparison snapshots, full manifest metadata, CLI nested artifact and rejection contracts | Whole producer-backed replay workflow and interpretation retain metadata-bearing CLI/Studio paste and Recent coverage, plus altered identity/hash/selection/results and conflicting artifact rejection. Service/routes retain canonical validation and runtime isolation. |
| Unseeded/failed draw and inspect failure | Whole replay workflow retains unseeded inspection/export with disabled reproduction, no retention for failed draws, and failed Inspect without advancing to stale results. |
| Payout recovery, pending Save revisions and durable exact generation | Whole Game Model and library durability files pass their deferred validation/write, payout correction and real publication/reopening regressions. |
| PAR, short seeded simulation/report/public math parity and nonzero rare source | Whole bounded P9-07 integration passes workbook/model/play/simulation/exact/report/replay and positive UInt64 rare-source inspection. No math, probability or Node/WASM implementation changes. |
| Cold understanding, frozen defaults/errors/terminology, real timings, clean affected browser retest and terminal cancellation/recovery | Prior independent receipts remain authoritative and immutable. Remaining independent obligations are controller/verifier work; these implementation regressions add no receipt, screenshot or action/finding reclassification. |

Permitted foreground checks on this correction:

- `npm run test:targeted -- tests/cli/studio-client/src/components/project/ProjectDashboardPage.replayWorkflow.test.tsx tests/cli/studio-client/src/domain/interpret/Replay.test.ts tests/cli/studio-client/src/components/project/ReplayTab.test.tsx`
  exited 0: three whole files, 161/161 tests, 74.531 s. The commit hook then
  rejected a nested ternary; explicit branches replaced it. This same command
  passed again on the final source: 161/161 tests, 70.493 s.
- `npm run test:targeted -- tests/cli/studio/replay/StudioReplayExecutionService.test.ts tests/cli/studio/OutcomeSourceProjectRoutes.test.ts tests/cli/studio-client/src/components/project/ProjectDashboardPage.gameModelWorkflow.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.libraryDurability.test.tsx tests/cli/P907ValeraMathematician.integration.test.ts`
  exited 0: five whole files, 106/106 tests, 137.320 s. Both runs use no
  test-name filter and retain existing React `act` warnings.
- `npm run typecheck` exited 0 before and after that lint correction, including
  the Studio client compiler. The root
  compiler and Studio production bundle consume the changed interpretation;
  ReplayTab additionally belongs to the Studio compiler/bundle. No duplicate
  standalone compiler or controller-owned `build-studio-client` gate ran.
  CLI/package production builds, browser reruns and official gates were not run.
- `git diff --check` passed; staged TypeScript must also pass the installed
  ESLint pre-commit hook before submission. Only this P9-07 document is updated;
  all prior-step evidence and external runtime receipts are preserved.

## Supplementary recovery continuation — 2026-10-09 (candidate `46d02af`)

This continuation reused the immutable frozen initial profile and never
relabelled it as a cold pass.  The public launch used this checkout's
`node ./dist/cli/pokie.js --no-open`; the retained candidate-build receipt
records `npm run build-cli` success for candidate `46d02af`, output checksum
`52320362b5fe51f4835d6224cbf82064b25e3bb8d4595e221dd40744e6d2e33c`.
`ff8415c9` remains an evidence-only descendant, not a different product
identity.

In `P9-07-dfc74a68844b16dd/run-2026-10-09T18-27-12-983Z`, public Overview
draws with `p907-recovery-a` and `p907-recovery-b` created distinct records
`978afa3b27c8437e86d06f1fc63a8978` and
`73f76708f3d04998863282fbd3f8cdbf`.  Replay Recent visibly named their
library/hash, seed, mode, outcome, timestamp and record ID.  Selecting the
second record and using its one visible Reproduce action completed as job
`f120fceba3fa4f1e849eaf2a43849de3`; its local terminal rendered “Verified --
matches the recorded result,” including matching library source, selection
inputs and selected outcome.  No screenshot was retained.

The single bounded cancellation attempt is incomplete rather than a defect:
the deterministic 1,000-round replay `p907-cancel-recovery` rendered queued
and running at `0/1000`, then its local Cancel confirmation.  Before Confirm
could be processed, the same job `3f73924d416240adb0e3a629bab7e095` reached
the action-local completed terminal `1000/1000` with an available replay
artifact.  The verifier did not resubmit it.  Thus this transcript adds
durable-record/replay evidence but does not prove a cancelled terminal,
withheld completed output, fresh-profile affected retest, or the reviewer’s
remaining full closure matrix.

## Report-contract reconciliation

This evidence-only reconciliation preserves the semantic verdict
`inconclusive` with category `readiness`.  The sole persisted acceptance
criterion is recorded here verbatim, once, with its unchanged result:

> One fresh-profile mathematician uses public Studio controls for a tiny model/PAR, play, short seeded simulation and exact Outcome Library/report/replay task, and inspects a rare-event weighted source. Retain frozen terminology/default/error findings, bounded real timings and no more than three screenshots, with clean affected retest and no unresolved P0/P1/material P2. No large generation or Cartesian matrix.

**Status:** not reached.  The immutable initial collection and the later
candidate-bound continuation retain bounded public-path observations, timings,
and no additional screenshots.  They do not establish the required clean
affected retest or the terminal cancellation/recovery portion of the same
fresh-profile criterion.  No workflow was run for this report repair, so its
formatting neither changes the readiness recovery cause nor supplies new
acceptance evidence.

## Fresh affected retest — 2026-10-09 (candidate `46d02af`)

`run-2026-10-09T18-37-59-852Z` is a new isolated browser, application and
Documents profile (18:37:59Z–18:47:11Z; 159 rendered observations; no
screenshots).  Its candidate-bound build receipt remains
`candidate-builds/46d02af7e519f938baf732aca303e02b27fec672/result.json`:
`npm run build-cli` exited 0 and Studio was launched from this checkout with
`node ./dist/cli/pokie.js --no-open`.

Using only rendered Studio controls, the fresh profile imported the supplied
tiny Blueprint; inspected literal reels; changed one displayed stop; cleared a
real empty-payout error by restoring `A x2` to `2`; and saved/opened the
managed project.  One seeded Play round (`p907-fresh-play`) settled at stake
1 with payout 2.00.  The short one-worker simulation (`p907-fresh-sim`) ran
100/100 rounds in 17 ms: total bet 100.00, payout 104.00, RTP 104.00%, hit
frequency 52.00%, payout-standard-deviation 1.00, and RTP 95% CI
84.42%--123.58%.  The visible 10,000-round/one-worker/no-seed defaults and
low-round warning were recorded; the collector interpreted this as a noisy
estimate, not certified RTP.

The exact preflight reported four raw combinations.  One accepted exact
generation completed with two outcomes, RTP 100.00%, 4,172 bytes and 55 ms.
The native library displayed non-derived reader limits and base metrics.  Its
seeded draw `p907-library-fresh` recorded
`outcome-5d52fbab29e92341`; Replay Recent then showed source/hash, seed, mode,
outcome and record ID.  The record's one Reproduce action reached the terminal
“Verified -- matches the recorded result,” including library source, selection
inputs and selected outcome.

The same run exported `parWorkbook.xlsx`, reopened it read-only with
`parsheet-provenance-present` and a matching recorded hash, then followed the
public PAR Diagnose → Preview canonical model → Apply confirmation surface.
No generated project/output tree or browser artifact is committed; the full
machine-owned transcript remains under the runtime harness.

Cancellation remains unreached, not a product finding.  The 100-round short
run completed before its current Cancel control could be targeted.  A separate
bounded 100,000-round recovery request (`p907-fresh-cancel`) rendered queued
`0/100000` but completed `100000/100000` in 0.8 s before the transport received
an enabled Cancel target.  No request was resent and no cancelled terminal or
withheld-output proof exists.  The supplied rare-source inspection is retained
in the immutable earlier candidate-bound observation; this fresh run did not
repeat it.  Therefore the sole persisted criterion remains **not reached** and
the semantic verdict remains **inconclusive / driver**, despite the successful
fresh affected-path observations.

## Supplementary cancellation-only continuation — 2026-10-09 (candidate `46d02af`)

`run-2026-10-09T18-55-52-930Z` used another isolated browser, application and
Documents profile solely to continue the outstanding cancellation observation;
it did not relabel itself as a cold pass or repeat the previously retained
model/PAR/play/library tasks.  The candidate checkout rebuilt successfully
(`npm run build-cli`, output checksum
`52320362b5fe51f4835d6224cbf82064b25e3bb8d4595e221dd40744e6d2e33c`) and
launched Studio through `node ./dist/cli/pokie.js --no-open`.

The ready state was the public Simulation page of a newly created isolated
starter workspace with no completed simulations.  The sole 100,000-round
submission rendered the action-local accepted state “Simulation queued —
0/100000 rounds” with its enabled `Cancel` control.  Activating that exact
control opened its confirmation, but the same run had already rendered its
local completed terminal — `100000/100000`, duration 1.4 s, one completed
report — before a confirmation could request cancellation.  The subsequent
rendered state had no pending control and retained the completed report.  The
verifier did not repeat the action; it closed only after owned children drained.
There are no screenshots.  This is a driver-timing limitation, not a product
finding: no cancellation request was accepted and no cancelled terminal,
withheld output, or recovery proof was rendered.  The persisted criterion
therefore remains **not reached** and the report remains **inconclusive /
driver**.
