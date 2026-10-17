# V2C-25 independent public-workflow collection — incomplete

Candidate product identity: `52b4cd7f1d7791acf27a2408702b566d25b4c04c`.
The checkout was clean before collection and this evidence-only addition is the only
repository delta. Runtime fixture and full durable driver transcript remain outside
the repository at the controller-assigned harness:
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-25-4ca8c3dc98dd8e89`.

## Completed observations

An isolated authored Blueprint fixture used seed `v2c-25-public-seed`, exact finite
budget `3`, target RTP `0.75`, tunable `/paytable/A/2 = [2,3,4]`, and locks
`/paylines`, `/reelStrips`, `/paytable/B`, `/availableBets`.

| Surface | Command/action | Result |
| --- | --- | --- |
| Public API | `ProjectTargetResolver` + exported `ProjectOptimizationService` from `./dist/src/index.js` | support true; writable `/paytable/A/2`, `/paytable/B/2`; exact success, measured `0.75`; detached candidate discarded and API scratch empty. |
| Canonical CLI | `node ./dist/cli/pokie.js optimize …attainable-policy.json --format json` | exit 0; success; measured `0.75`; selected `/paytable/A/2=3`. Review SHA-256: `c23f48c3e9a2bfedb244ae678dcc8e23963485f70a02926ef63c82736466db02`. |
| Canonical CLI | same source with `infeasible-policy.json` | exit 2; exhaustive infeasible after values 2/3/4 measured `0.5/0.75/1`. |
| Canonical CLI | same source with `budget-policy.json` | exit 5; exhausted after one evaluated candidate. |
| Canonical CLI | reviewed apply using changed-lock `stale-policy.json` | exit 1; `Reviewed source or policy changed; run a fresh preview.` Source SHA-256 remained `c10b4ced244f4d99bbe474922d49f610d0be7dbef89720ac28300e7dfe56b096`. |
| Canonical CLI | seeded run with `cancel-policy.json`, progress, then one external `SIGINT` | rendered product terminal JSON was `status:"cancelled"` after search observations reached 11,000; the `timeout` wrapper itself reported 124 after delivering SIGINT. |
| Rendered Studio | candidate launch `node ./dist/cli/pokie.js <fixture>/optimization.blueprint.json --no-open` through the required persistent driver | current request support rendered, then the single accepted run completed `Optimization success` in 82 ms. Preview rendered exact 0.75, target/tolerance, budget, locks, source revision, same-type native-readback validation and diff 2→3. Explicit `Apply reviewed changes to source` then rendered `Authored changes applied`; the Play route rendered afterward. |

The two independently inspected captures are retained only in the controller-assigned
runtime harness, not as Git payload: `run-2026-10-17T15-37-23-824Z/1-observation.png`
(`19feb00fa1bac942b77059af568a2be37749cea5e2eefe30db638fff0ffcbc14`) visibly
shows the authored request and successful support boundary; its paired observation
(`d03565d569b329c8cc80e283fe9945c091bea053959775e758dcde8ea226bd8b`) shows the
retained authored Blueprint overview after the post-apply Play navigation request.

## Visual assessment

I independently inspected both captures. They are legible at 1440×956 and show a
coherent Studio layout, the full public policy input and support notice, and the
authenticated authored Blueprint context. They do **not** themselves show the completed preview's
metric table; that table is retained in the candidate-bound transcript and is not
being represented as visual proof by these PNGs.

## Remaining verification

This collection is not approval. It does not authenticate the requested PAR,
native-weighted-artifact, occupied-destination, all-six-capability, or sampled held-out-CI
branches. The recovery run below authenticates the active-job reload, cancellation,
exact retry, and post-apply Play branches; it also reveals the declared-custom-TS CLI
defect rather than completing that required surface.

## Recovery collection and verified CLI defect

A fresh isolated Studio run is retained at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-25-4ca8c3dc98dd8e89/run-2026-10-17T15-44-45-854Z/transcript.json`.
Its authenticated build receipt is for this candidate's `npm run build-cli` (exit 0;
output-tree SHA-256 `f5deb09b190390a7626815cd55adccca230c82578a44104ce848e02b7e4e7505`).

The rendered Studio run submitted a sampled seeded search with target RTP 0.75,
budget 3, seed `v2c-25-recovery-sampled`, and the same Blueprint tunable/locks above.
It rendered queued work, then, after one browser reload, reattached the same active job
as `running: 1 / 3 candidates search`. One accepted cancellation rendered 62,000 search
observations and the action-local terminal `Verdict: cancelled` / `Optimization cancelled`
after 12,055 ms. The browser-worker inspection after terminal was empty. A subsequent
exact-finite retry (seed `v2c-25-recovery-exact`) rendered an exact 0.75 preview and
diff `/paytable/A/2 2 → 3`; one explicit apply reported `Authored changes applied`.
The resulting public Play session then completed one ordinary round: stake 1, payout 0.

The recovery captures were independently opened and inspected at 1440×956, and are
retained only in that runtime harness: `1-observation.png` SHA-256
`f9fca08094c794687157e439afa09176d51bcb18805df6a49fd9fe1b41cd7695` clearly shows
the cancellation terminal, observations, source revision, policy, and no held-out
result; `2-observation.png` SHA-256
`bbdf7b055e6f818a77f621f0ef0919207d4bd0d90fbc1dc441542d859f7da787` clearly shows
the post-apply Play round, one delivery, stake 1, payout 0, reel result, and credits.

For the required declared custom executable package, a harness-only fixture
`v2c-25-custom-ts` was created with executable SHA-256
`6e560940832028495c7fa172973db57196756b79ee1a6a64a5e4d9c847512d52`, parameters
SHA-256 `54984251787f5ba76a76dee790096571e075d64de463a6b007524aa04a450dd9`, and
the public `declarePackageTuning` contract SHA-256
`e5a232d38e05e803468626dabd5d1833155f2818196319fbda4558fa2fa26c7e` for
`/paytable/A/2`. Its canonical public command was:

```sh
node ./dist/cli/pokie.js optimize "$HARNESS/v2c-25-custom-ts" \
  --policy "$HARNESS/v2c-25-custom-ts/policy.json" \
  --out "$HARNESS/v2c-25-custom-ts-output" --format json
```

It deterministically exited 1 before optimization with `Cannot find module
'.../dist/src/gamepackage/internal/runtimeLocation.mjs' imported from
'.../dist/src/gamepackage/resolvePokieGameEntryModule.js'`. The candidate source contains
the tracked helper, but the successful `build-cli` output omits it from `dist/src` while
the compiled resolver dynamically imports it. This is a P1 product defect in the
canonical CLI's declared-custom-TS workflow, not a driver failure.

## Current candidate continuation — fbd605ab8b630d9f41e5296988159f806600805d

The preceding custom-TS failure is retained historical evidence for its older
candidate, not a current finding. The current candidate's controller-owned build
receipt is at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-25-f699fc52f81bcf45/candidate-builds/fbd605ab8b630d9f41e5296988159f806600805d/result.json`:
`npm run build-cli` exited 0 and produced output-tree SHA-256
`f501c269e53e9ae356465fbea51a012cae0aa5ed4b4bf96ceef58f30debe4eb9`.

The isolated declared-package fixture used the public `declarePackageTuning`
contract for `/paytable/A/2`, seed `v2c-25-custom-current`, exact-finite budget
3, target RTP 0.75, and locks `/paylines`, `/reelStrips`, `/paytable/B`, and
`/availableBets`. After removing a malformed first attempt whose policy file had
incorrectly been placed inside the declared package (and therefore rightly made
its source identity stale), the canonical commands below both exited 0:

```sh
node ./dist/cli/pokie.js optimize "$HARNESS/v2c-25-custom-current" \
  --policy "$HARNESS/v2c-25-custom-current-policy.json" \
  --out "$HARNESS/v2c-25-custom-current-output" --format json
node ./dist/cli/pokie.js optimize "$HARNESS/v2c-25-custom-current" \
  --policy "$HARNESS/v2c-25-custom-current-policy.json" \
  --apply "$HARNESS/v2c-25-custom-current.preview.json" --format json
```

The preview (`783e1f22a042c3e46039b2a599b7ef5de05347a31909517ac6c7e47f3804dc52`)
and apply (`417f3ef3ec9c88c32101274e11fc1705864f7ee30350d6232b367fd6c8627fd1`)
both report `tsPackage`, same-type native readback, selected `/paytable/A/2: 3`,
and measured RTP 0.75. Before/after inventories show that only `parameters.json`
and its reviewed tuning metadata changed; `index.cjs` and `package.json` hashes
were unchanged. All full JSON receipts and the fixture remain outside Git in the
assigned harness.

The same candidate-bound rendered Studio run started from the public home route,
added the isolated Blueprint via its visible project controls, and submitted one
supported sampled request (seed `v2c-25-sampled-current`, target 0.75, tolerance
0.15, budget 3, 6,000 held-out samples). Its terminal rendered preview reported
attained RTP 0.755, CI `[0.7024009544707753, 0.8075990455292247]`, confidence 0.95,
all four locks, constraints `{}`, and `/paytable/A/2` 2 to 3. The full transcript is
`run-2026-10-17T18-40-08-409Z/transcript.json`; the independently inspected capture
`1-observation.png` has SHA-256
`2e420d3c790e678398214f74f71a992da9bf69d3460fa40106263f6e53069d3e`.
At 1440×956 it visibly shows the sampled support boundary and metric row; the table
is readable and includes the target, held-out estimate, CI, confidence, observation
count, policy limits, locks, constraints, and the mathematical diff.

That preceding continuation was incomplete; the following bounded addition records
the later current-candidate observations. It does not reinterpret the historical
rows above.

## Current-candidate completion addition

All commands below used `node ./dist/cli/pokie.js` from the candidate checkout,
with runtime-only fixtures and receipts under the assigned harness. No test suite or
official gate was rerun.

The finite PAR policy used target RTP `0.75`, exact-finite budget `3`, seed
`v2c-25-par-current`, tunable `/paytable/A/2 = [2,3,4]`, and the Blueprint's
payline/reel/B-paytable/bet locks. `par export` produced a PAR workbook, and
`optimize <workbook> --out <new workbook>` exited 0. Its receipt
`v2c-25-par-preview.json` (SHA-256
`1cac7a585753d65f054518ed643f2cf8ea6d1b0d38f7621ba37ae9bd65e20e84`) reports
adapter `parWorkbook`, same-type readback, evaluations `0.5` then `0.75`, and the
selected 0.75 candidate. Public `inspect` identifies both inputs as PAR workbooks;
their inventories and SHA-256 hashes are retained as `v2c-25-par-output.sha256`.

`build --target outcomeLibrary --exact` produced a native two-outcome library: the
winning `outcome-92d7fefe2949e936` initially has weight 1 and the losing outcome
weight 3. An exact native-outcome policy changed only that declared winning weight
to 3, targeted RTP 1, and exited 0 to a new same-type outcome-library directory.
`v2c-25-native-preview.json` has SHA-256
`6cc00d7d3dd07e788a297974aefeb866e0d47b06aca14518eae831d60be43a61` and reports
native integer-weight preservation, native readback, and measured RTP 1. Source and
output inventories are `v2c-25-native-source.sha256` and
`v2c-25-native-output.sha256`. The public CLI also built and inspected the complete
current six-type surface: Blueprint, PAR workbook, declared TS package, outcome
library, Stake adapter, and canonical WASM. Passing the canonical WASM to optimize
exited 4 with the explicit unsupported diagnostic `Opaque WASM: missing bound
source/build tuning provenance.` (`v2c-25-wasm-unsupported.json`), rather than
silently converting it.

Two current mutation-rejection probes preserved their inventories. After previewing
a copied Blueprint, an external edit changed only locked `/paytable/B/2`; canonical
reviewed apply exited 1 with `Reviewed source or policy changed; run a fresh
preview.` (`v2c-25-stale-source-apply.json`, SHA-256
`811fb48469d48178d4e8c1e172bf8ed2c1840f43219c70c370cc712a92ef7ff9`), while
`v2c-25-stale-mutated.before.sha256` and `.after.sha256` match. Optimizing to a
directory containing only `sentinel.txt` likewise exited 1, explicitly said the
destination already exists and is never overwritten, and left identical before/after
inventories (`v2c-25-occupied.json`, SHA-256
`1beb382ef00c2e943b37b1b2d52cb154b3057c349890592d5dedf96dfc0b749e`). The
rejection probes did not apply changes. Separately, a clean review/apply proof used
the same declared policy and fixed seed `v2c-25-post-apply-current`: the reviewed
apply selected `/paytable/A/2` 2 to 3, then the same public 1,000-round one-worker
simulation changed from total win 518, RTP 0.518, max win 2 to total win 777, RTP
0.777, max win 3. The four receipts are
`v2c-25-payout-proof-{before,preview,apply,after}.json`, with SHA-256 respectively
`4ea070b092f316b037a57cb26fb9e62f15b71cd5cd69ef7689e8a830da7fafec`,
`c9955e8e1fa7c169d343b67de26d2c3794237a4d294b94be2c2d7be5447318d0`,
`e6bc3449b7e0af13c53878700a40326ebf0488eeef4103c5b44e902b0fb150fc`, and
`f4fcca6c971fdc9520558bb54889ca5b732c387453aea5f0bd8173cafc241c99`.

For direct cancellation, a seeded-search policy used one worker, one-million-sample
search and assessment settings, target 0.75, budget 3, and the same declared
tunable/locks. The canonical child emitted real `preparing` and `search` progress
at 1,000 and 2,000 samples before one `SIGINT`; the harness directly waited for
that child and recorded exit **6**, not a wrapper timeout. Its terminal result is
`status:"cancelled"`, phase `search`, searchSamples 2,000
(`v2c-25-cli-cancel-direct.json`, SHA-256
`df2ea6343f8b15bb5a2b440348e18254097f1d88d3031be232feb41fa608c079`). A fresh
post-cancel canonical retry exited 0 (`v2c-25-post-cancel-retry.json`, SHA-256
`665b2a52a2fb73d372b79f823e423f00161a339a76f72b959aa7e20fc4938d8d`). The prior
candidate-bound Studio cancellation/reload receipt remains the preserved rendered
worker-drain and reattachment observation.

One fresh rendered Studio launch, retained at
`run-2026-10-17T18-47-07-127Z/transcript.json`, opened the isolated Blueprint via
the public Home/Projects controls and recorded two further action-local terminal
rows. The exact finite request with target `0.6`, seed `v2c-25-studio-infeasible`,
and budget 3 was accepted and rendered `Verdict: infeasible` after all three
candidates. Replacing it with target `0.75`, seed `v2c-25-studio-budget`, and budget
1 was accepted and rendered `Verdict: exhausted`, one candidate evaluated and one
budget unit consumed. A short driver probe had looked for the non-rendered wording
`budget-limited`; the retained local terminal is the product's actual `exhausted`
wording, not a defect. This transcript SHA-256 is
`46476edba8c3aee121678a2f66fe916573a7365aa77de77b27f935227f49f714`.

## Current independent continuation — 254bb30b0549b2545084a35942bc7d89c3ad1f2f

The candidate checkout was clean and its HEAD matched the assigned candidate SHA.
Its only difference from the authenticated `fbd605ab8b630d9f41e5296988159f806600805d`
product build is this evidence README; the rebuilt candidate output has the same
`f501c269e53e9ae356465fbea51a012cae0aa5ed4b4bf96ceef58f30debe4eb9` tree hash.

One fresh public Studio launch through `node ./dist/cli/pokie.js --no-open` reached
the rendered Home/Design screen. Its candidate-bound build receipt is
`candidate-builds/254bb30b0549b2545084a35942bc7d89c3ad1f2f/result.json` and its
full transcript is `run-2026-10-17T18-54-11-979Z/transcript.json` (SHA-256
`8d5bce20de72eed7794a5e31e9a9ea9c006b92eecc46a2d94c1184c17e5bae6f`). The
required file-command transport twice rejected the visibly rendered, enabled
`Show advanced options (file and JSON tools)` control as not uniquely hit-testable,
including once with the rendered `Design Your Game` section. The transcript retains
the two driver errors, a clean Studio output tail, no browser Worker targets, and no
downloads. No optimization request was accepted; this is a driver collection block,
not a product finding and not proof of any missing workflow branch.

## Current recovery observation — worker-backed Studio optimization failure

The positional public Studio entry opened the retained, unchanged Blueprint fixture
in a new isolated profile. Its rendered two-worker sampled request used seed
`v2c-25-studio-workers2-cancel`, budget `3`, target RTP `0.75`, tunable
`/paytable/A/2 = [2,3,4]`, the retained locks, and `sampling.workers = 2`.
The request-specific support check rendered writable `/paytable/A/2` and
`/paytable/B/2`; the single Run optimization activation then rendered
`running: 1 / 3 candidates preparing` and its own Cancel optimization control.
It terminally rendered `Verdict: failure` after 31 ms, before samples or a worker
target appeared: `SimulationWorkerCoordinator` attempted to import the missing
`dist/esm/simulation/parallel/resolveDefaultWorkerEntryUrl.mjs`. The packaged
resolver is actually retained at `dist/esm/simulation/parallel/internal/`, while
its `new Function(... import(specifier))` relative import resolves from the caller
directory. The transcript is in the assigned harness at
`run-2026-10-17T18-59-44-053Z/transcript.json` (SHA-256
`c74b397b1496a00eee802e5ba9d7fada0de06117833fd9558d786ec641efb88c`).

## Current candidate rerun — cleanup failure after resolver repair

Candidate `b611787e961e8eb6874f77dfd82875b3eeff9cbb` was clean and rebuilt with
`npm run build-cli` (exit 0). The build receipt is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-25-715914bc4de18c48/candidate-builds/b611787e961e8eb6874f77dfd82875b3eeff9cbb/result.json`
(SHA-256 `990f3e65d7c288be10aba93123e6618134abd3caecb35c044f36f46ac276f2f6`);
the rebuilt default-worker resolver artifacts in `dist/esm` and `dist/src` had
the same SHA-256 `e1ad4c84f781c14981f2d6db500ac8e3a154516052177ee869e0a30e083d02df`.

One fresh positional Studio launch used the public candidate command
`node ./dist/cli/pokie.js <retained Blueprint> --no-open`. After an intentional
invalid default policy was visibly rejected, the restored deterministic request
was visibly supported with writable `/paytable/A/2` and `/paytable/B/2`. Its
exact JSON specified seeded search, seed `v2c-25-b611-workers2-cancel`, budget
3, the retained four locks, and sampling workers `2` with 1,000,000 search and
assessment samples. One `Run optimization` activation rendered the action-local
pending state `running: 1 / 3 candidates preparing` and `Cancel optimization`.
It then rendered its own terminal `Verdict: failure` after 85 ms, before samples:
`cleanup: Worker cleanup unconfirmed: runtime release acknowledgement absent.`
The recovery card is action-local (`optimization · Recovery required`), not a
pre-existing page alert. No retry or second launch was issued.

The retained terminal job is
`run-2026-10-17T20-11-35-488Z/application-OrWC8h/config/pokie/studio-jobs/923862c211c847a6a98bbb41c5bf485d.json`
(SHA-256 `68705ddf1be487d64daf485d208229b495fc80d008ad0ab2f5ece744f261549c`)
and the full candidate-bound transcript is
`run-2026-10-17T20-11-35-488Z/transcript.json` (SHA-256
`ddce6fe2ce7eacccec4bc2d30d47b726a8e4cb4a5269eb2642f710a2f6165b4d`).
The direct cause is in `SimulationWorkerCoordinator`: its cleanup rejects at
`src/simulation/parallel/SimulationWorkerCoordinator.ts:109` when a runtime
release acknowledgement is absent, while acknowledgements become true only for
worker `result`/`error` messages at lines 191–193. The repaired compiled
two-worker Studio path reaches finalization with neither acknowledgement and
therefore cannot produce samples, cancellation, worker-drain, or fresh-retry
evidence. This is a reproducible product failure, not a browser-driver timeout.
