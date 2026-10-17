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
declared-custom-TS, native-weighted-artifact, occupied-destination, reload-active-job,
Studio cancellation/retry, all-six-capability, or sampled held-out-CI branches. The
second and final permitted Studio launch was already consumed; the Play-session action
also exposed a neutral rendered-action resolver ambiguity before activation, so it did
not establish a Play round. No product defect is asserted from that driver limitation.
