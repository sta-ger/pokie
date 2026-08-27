# PC-03 blind Studio exploration — candidate `366e99a`

Fresh Chromium profile; Studio was launched from this checkout with `node ./dist/cli/pokie.js --no-open`.

Observed visible workflow transcript:

- Recommended starter created, then closed and reopened from Projects. The reopened Overview showed `starter-slot v0.1.0`, valid validation, and an editable local design.
- Play created a new session. One Spin was accepted and visibly reached `Spinning…`. Do not infer a failure: the driver process then ended its browser, so a settled round was not observed and no duplicate spin was issued.
- Simulation input was visibly set to 1 and accepted. Its later Recent runs entry reported `1/1 rounds, RTP 0.00%`; an earlier accidental 100001-round run was a repaired driver typing error, not a product result under review.
- Replay loaded a fresh seed replay configuration. The rendered `Run again` control did not yield a visible transition before the driver’s bounded wait; its off-viewport CDP click is not product evidence.
- Outcome-library generation completed: the Stake control became available. Stake export then rendered `Exported 4 file(s)`.

Generated-artifact inspection (not retained):

```
outcomelibrary/index_base.json  49b531ef7642a50aa1b863c8e83ce7743ee9eb22211b26dc7237c58742dc245a
outcomelibrary/manifest.json    44b1296224993419a89d8c19f16bd3619de2288b415fc5f8255bc85903b29e13
outcomelibrary/outcomes_base.jsonl  afc90be68bebaa62f3cb01cf2f653c438873b675998ea36802d6951391929745
stakeengine/books_base.jsonl.zst    c0dc33f77175b4ee5e1a15afaee2a441360645bee7758e2cf1d829b63c66d901
stakeengine/index.json              57e19f4de9b88cc3e45e7a5a2f11e0940b465ff9e09a5e1553d58b384807a5d5
stakeengine/lookup_base.csv         a6ab06e0ae86547667fff1418a5d62aa3de9c4b53e7cd1d757cde2267c934dc0
stakeengine/pokie-manifest.json     dbdaf450544f885c4f9b02bb1b82d24df846f6e5fdecb3a2fc0cef21bb97c806
```

No screenshot is retained: screenshots only showed ordinary navigation/form layouts and do not prove a distinct visual product relationship. This run is driver-inconclusive for complete cold-start exploration, not a rendered product finding.

Harness-recovery addendum (fresh profiles, candidate CLI, 2026-08-27):

- The first repaired launch reached the rendered starter form. Its real action is `Create game`, not a control named `Recommended starter`; the stable harness was corrected in place without asserting a product failure.
- The second fresh launch clicked `Create game`, created `Starter Slot`, and clicked its visible `Play` navigation action. The rendered Play surface then offered `Start Play` and `New Play session`. The remaining harness awaited a nonexistent `Spin` control before taking that required `Start Play` transition, so no spin or replay request was emitted and no rendered product error appeared.

The failed driver expectation is selector-inconclusive, not a product finding. No additional screenshots or generated artifacts were retained.

Final harness-recovery attempt (fresh profiles, candidate build, 2026-08-27):

- The repaired visible journey again created `Starter Slot`, opened `Play`, and rendered `Start Play` plus `New Play session`.
- The DOM driver could neither expose a matching interactive control nor scroll it into its control list, despite that rendered Play text. Four fresh-profile launches exhausted the allotted recovery budget before an action could be emitted. There was no rendered product error, request, or duplicate action; this is selector-inconclusive, not a product finding.
