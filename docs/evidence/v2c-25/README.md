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

The two PNGs are independently inspected captures, not driver verdicts:

- `studio-preflight.png` (`19feb00fa1bac942b77059af568a2be37749cea5e2eefe30db638fff0ffcbc14`) visibly shows the authored request and successful support boundary.
- `studio-post-apply-play.png` (`d03565d569b329c8cc80e283fe9945c091bea053959775e758dcde8ea226bd8b`) visibly shows the retained authored Blueprint overview immediately after the post-apply Play navigation was requested; the route transition itself completed later in the durable transcript.

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

The two new PNGs were independently opened and inspected at 1440×956:

- `studio-reload-cancel.png` SHA-256
  `f9fca08094c794687157e439afa09176d51bcb18805df6a49fd9fe1b41cd7695` clearly shows
  the cancellation terminal, observations, source revision, policy, and no held-out result.
- `studio-post-apply-round.png` SHA-256
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
