# V2C-12 independent workflow receipt

Candidate product identity: `b02f4b4edf02b43f8ff7e2a2aec43e6438fa024f`.
This directory retains a bounded independent-verifier evidence set; runtime
profiles, generated package output, full logs, and automation are deliberately
not committed.

## Controller-owned targeted result

The controller receipt at
`/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/d86b9aee184f4e4b90baec5e/result.json`
records a clean candidate before and after the sole required command, exit 0,
no timeout, and these five paths:

- `tests/cli/commands/BuildCommand.test.ts`
- `tests/cli/commands/ParCommand.test.ts`
- `tests/cli/commands/ReportCommand.test.ts`
- `tests/cli/studio/runtime/StudioPlayService.test.ts`
- `tests/cli/studio-client/src/hooks/usePlaySession.test.tsx`

Its complete streams are the authorized runtime references `stdout.log`
(`1a078e0cf270a3534d85ae6bdd7440d04691b519def1b32e5a407bdbfa164b3b`)
and `stderr.log` (`8e23c86c88c5f600f3cee7ac8bbe59f9448eb50d3a4e5a47713e40dc7138c132`).
The terminal Jest summary in stderr is **5 passed suites, 157 passed tests,
0 snapshots**, in 34.944 s. `result.json` SHA-256:
`59a4b86d3c15ee0ae9574486b9b9d805e3e913d3abf6e507a6f6a56ef294aebd`.
No verifier test command was rerun.

## Fresh Studio collection

Fresh isolated application and browser storage was used by the persistent
candidate-bound harness from 2026-10-14T19:16:15.186Z to
2026-10-14T19:21:31.145Z. The transcript is retained only at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-12-67d2bfbec82708b0/run-2026-10-14T19-16-15-185Z/transcript.json`
(SHA-256 `cb99e7392f2e5a29cee873cc9a1642301e4eb6c4facd592d0d49ea32ea120ab3`).
It authenticates the current checkout, candidate SHA, fresh config/documents
paths, 1439×956 viewport, 92 rendered observations, and child cleanup.

The harness built this exact candidate once with `npm run build-cli`; its
receipt records exit 0, output digest
`0f1b523149d2df0d2ca6735405e8f4d855604718eb2420c130a830eb24289f1b`,
8,731 output files, and build-log digest
`edef081d2cbd070e28bd462f6858f2b23f3ca4a31e0b540401ed8384ec3bbb5f`.
After the rendered closeout, Studio diagnostics contained only its listening
line and the owned children drained.

### Rendered itinerary and observations

1. Home JSON authoring drafted and explicitly applied `V2C12 Fixed Hold Ante
   Current` (`v2c12-fixed-hold-ante-current`, Hold&Win, fixed `mini` jackpot,
   base/ante executable modes), then **Create game** saved it. The draft was
   visibly distinct from the saved state; the Project Game basics editor was
   opened and cancelled without changing its persisted source.
2. The saved project built a TypeScript Game Package through the public
   **Build** control; the local terminal surface stated `Build completed`.
3. A fresh Play session selected ante and spun once. Its local completed result
   showed stake `0.07500000000000001`, payout `10.000000000000068`, charged
   mode `ante`, Hold&Win fields, fixed jackpot balance 10 and jackpot award 10.
4. Session Spin Replay loaded that exact recorded Play spin. It displayed the
   same ante attribution, stake, award, feature-event names and exportability.
5. A selected ante simulation ran 50/50 rounds, followed by a separate all-mode
   50-per-mode run. The all-mode result visibly separated base and ante cards;
   history listed the mode as `all` and the public report-download controls.

The Home malformed-JSON receipt and accumulating buy/continuation fixture,
including its one charge from 1000 to 999.5, continuation without a second
charge, are truthful same-candidate retained observations in the prior runtime
transcripts listed by the controller. The requested later-purchase and reload
paths, a seeded simulation rerun, and a Project-form conflict were not
collected in this fresh run; no result below treats them as passed.

## Screenshots and independent visual review

The three retained screenshots are representative rather than generated output:

| File | SHA-256 | independently inspected surface |
| --- | --- | --- |
| `1-observation.png` | `7b41af3f7cb2d3df2e106d70dfebf2fce75f94168fe874e92b9bd990a78d3315` | Completed ante Play result: Spin, payout, charged mode, Hold&Win and jackpot award. |
| `2-observation.png` | `e12f985288d445425526e4cc17f97d3f3cec65599c4fc51b813a7c3157e81d22` | Session Spin Replay identity, recorded source and availability state. |
| `4-observation.png` | `26e4ea7496608f01fd5b4923a2b8eb51533e51e4ab287700693cd4b4a0bb54fb` | All-mode Simulation review, visibly separate base/ante cards and warnings. |

I independently opened all three PNGs after capture. They are legible,
consistent with the transcript, and show the stated controls/results; this is
an observation only, not image-based approval.

## Recovery collection and finding (2026-10-14)

The persistent harness was repaired in place and used one further fresh
application/browser profile from 19:28:00.143Z to 19:29:34.997Z. Its complete
runtime-only transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-12-67d2bfbec82708b0/run-2026-10-14T19-28-00-143Z/transcript.json`
(SHA-256 `8991a53520d535480b21f3739b2cdfe235ca19ad72b8f5e8ada47d09b45a9f7e`).
It binds the candidate, current checkout, fresh config/documents paths,
1439x956 viewport, 3 captured surfaces, action sequence, and post-close child
diagnostic. It reused the authenticated candidate build receipt above; no test,
pack, install, or second build was run.

The run explicitly applied and created `v2c12-accum-recovery` with a
three-reel accumulating `mini` jackpot, free-games and base/ante/buy/buy-more
modes. Its Project Game basics form then accepted a blank-equivalent Game name
draft for Save. The exact Save transitioned to loading and back to an editable
draft with Save disabled, but displayed no validation issue or field error;
the saved project was subsequently recovered intact through Cancel/Confirm.
This is a reproducible finding: `GameBlueprintValidator.validateManifest`
requires `trim().length > 0` in
`src/generated/GameBlueprintValidator.ts`, while the rendered Project form
does not expose that invalid result on this path. The recovered view again
rendered `Name: V2C12 Accumulating Recovery`.

The same run recorded an initial explicit `buy` Spin from Credits 1000, its
accepted pending state, `Charged mode buy`, stake 0.5, and a payout-affected
Credits balance of 1009.55. Its uncharged `Continue round` completed a
two-subround lifecycle. A real browser `Ctrl+R` returned the public
no-active-session Play recovery surface. A newly created post-reload session
required a fresh `buy` selection and a later explicit Spin; that separate
purchase again rendered Credits 999.5. No rendered Retry action was offered
for either completed lifecycle, so no retry was fabricated.

| File | SHA-256 | independently inspected surface |
| --- | --- | --- |
| `5-project-form-validation-missing.png` | `2da5996ac49cae5b05a12169a644edabdc284206bc4e1075e33def9d8b93f219` | Blank visible Game name, disabled Save and no rendered actionable validation. |
| `6-purchase-continuation.png` | `59776c0c947d843d4708dae466d16af2c0af474799c35d13bf761ffe3ad7bd80` | First accepted buy purchase: pending continuation, Credits 1009.55 after award, charged mode and jackpot award. |
| `7-later-purchase.png` | `6adba3b95527a178cf501fb35093c4d3b48db41ec8040b6474d481cf44fc35fe` | Later explicit post-reload buy purchase: Credits 999.5, charged mode and continuation. |

I independently opened these three PNGs. They are legible and match the
transcript; the first documents the finding and the latter two document the
purchase lifecycle. This remains visual evidence, not approval.

## Package Replay completion (2026-10-14)

Candidate product identity is
`f84c3e4822ceeb4cbad4ea45c4a32c42d14da5e6`. The persistent harness reused
its authenticated candidate build (`npm run build-cli`, exit 0; output digest
`cf8bda590c5ab274695037493a388e31ab0b6b1818702896f7284d41110a0752`) and
ran one new isolated Studio profile at 1439×956. The runtime-only transcript
is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-12-2d828f3a7c8a1b91/run-2026-10-14T22-47-58-710Z/transcript.json`
(SHA-256 `3af2021c030d4259c7c5cbf019e65b2678206574db57887fb896e1ecdffa449b`).

Through rendered Studio controls, the verifier authored the deterministic
0.05 fixture, generated an ordinary exact base library (125 outcomes), then a
weighted ante bounded-coverage library (seed `v2c12-weighted-seed`, sample
size 12, 10 outcomes). It drew one ordinary artifact with seed
`v2c12-ordinary-seed` and one weighted artifact with seed
`v2c12-weighted-draw`, selected each through **Replay Artifact**, and ran one
reproduction. Both rendered result surfaces completed 1/1 round and reported
that the recreated result matched the recorded one.

| Variant | Rendered/replay provenance | Download SHA-256 |
| --- | --- | --- |
| ordinary | base; stake 0.05; library `v2c12-replay-current-base`; charged mode base; seed `v2c12-ordinary-seed` | recorded `248adb75b54f4420c554cd41bbde5e42e7b37e7a39b842b7140ffb02d2514e9c`; recreated `6f90565f6247fa8e8ec9306032efc4c14569da4150b9a4fc7b3c1575a60657a3` |
| weighted | ante; stake 0.07500000000000001; library `v2c12-replay-current-ante`; charged mode ante; seed `v2c12-weighted-draw` | recorded `e157f849b2c656fdd88edddbe36f4f6c21ad3df5368482609f1bdec08e2fcb35`; recreated `e53b260e826d135ba5d5ca063367a924436e1dc442a576a6127e9ac16038c840` |

The four runtime-only screenshots are `1-observation.png` through
`4-observation.png` in that run (SHA-256 respectively
`e8ecbd7c82403e6f0e72ab15d093b2c66299f978bc7eb895e64ad7da9018713f`,
`7228f092d6ac2351879ed96019892fff1ee2f749e0eaf4d6a8521079b900b65d`,
`20ac4738e999f80da659fea81878475b574b40f7ae4eb11ca795e2ef5e157520`, and
`a5432527967e7ee3c561f89843488874bc2b07e1598edf69f61e2742ab224b8e`). I
independently opened all four: the draw images visibly show each seed,
library, mode and stake; the replay images visibly show completed 1/1,
matching result, mode and seed. Runtime artifacts are intentionally not
committed. This receipt reuses the prior ante/purchase/simulation/native-draw
observations and does not claim controller approval.

## Current package handoff and omitted-seed audit observation (2026-10-14)

This bounded follow-up is bound to product candidate
`b669f487ac1881510f02db00afb56ac204282bad`.  One fresh Studio run used
separate application and browser profiles; its retained runtime transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-12-75a0b3989d3dd707/run-2026-10-14T23-46-17-733Z/transcript.json`
(SHA-256 `29034bef45891f74c7720199f7913d898f231cc54cd6673b8ba0733bbb64e4b3`).

Through Studio JSON authoring, the run created the literal-reel
`v2c12-ordinary-whole-sequence` fixture from
`tests/v2/fixtures/ExistingMechanicsGame.ts`, built the current TypeScript
Game Package, and used the rendered **Open as Project** handoff.  The opened
runtime reported `Game format Playable game`, `Added from your computer`, and
the package `tsPackage` location; no source-project runtime was substituted.

An omitted-seed package Play session selected ante and completed with visible
stake `0.07500000000000001` and charged mode `ante`.  Public Replay selected
that Session Spin, whose screen stated `Full audit export`; **Download JSON**
produced `spin-d6f931b8-b1e4-44b8-8438-aa795c391c2a.json` (14,372 bytes,
SHA-256 `a890224692e2dc4f2bb1d02e8b50e9766c00ac558834457695b5963e035095a9`).
Reading the actual downloaded bytes confirmed `seed: null`, audit delivery
count 1, `artifact.stake: 0.07500000000000001`, and
`artifact.betMode: "ante"`.  The visible **Load for audit replay** followed
by **Reproduce** completed 1/1 and rendered `Audit verified -- complete
recorded operation` and `Match -- recorded and recreated results agree`.

This is partial collection only.  It does not claim the required weighted
whole-sequence package or the buy/buy-more continuation matrix; those rows
remain uncollected for the next candidate-bound run.

## Weighted whole-sequence package recovery (2026-10-15)

This continuation remains bound to product candidate
`b669f487ac1881510f02db00afb56ac204282bad`; the clean evidence descendant
was `a0f1a53b1d006caa22c365640b1b405e8bcb1b5b` when collection began.  It
reused the authenticated `npm run build-cli` receipt (exit 0; output SHA-256
`87b0f47abe27909daeae3eb8dd63224e87cd420201c3a65a4c4f6429ac1673f2`) and
launched `node ./dist/cli/pokie.js --no-open` in a fresh application and
browser profile.  The retained transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-12-75a0b3989d3dd707/run-2026-10-14T23-52-38-285Z/transcript.json`
(SHA-256 `d65fe1334bd47bab2514c6295fc3c77a66df67f2143cc1cbb21d089b50a93378`).

Using the rendered Studio authoring and Build/Export controls, this run
created `v2c12-weighted-whole-sequence` from the fixture's weighted
`reelSequences` whole-array shape (three reels, `first: ["A"]` weight 1 and
`second: ["C"]` weight 3), built a TypeScript Game Package, and opened that
package through the visible **Open as Project** handoff.  The package runtime
reported the weighted omitted-seed ante record with configuration hash
`sha256:4e5e217ae84ecd8fb4dbfa3e8883dbbc7b6af85cf4c70d9e1bb24b708e133f73`.
Its public Replay **Download JSON** produced
`spin-410838ec-ae9b-4a85-81aa-dee2272f26e9.json` (22,077 bytes; SHA-256
`61be0280fce56d8f8b59f4a6e7aefb4642d98002c1d72ac49d409aa0554de552`).  The
actual bytes contain `seed: null`, recorded commands, audit state, and an
ante stake of `0.07500000000000001`.  Public **Load for audit replay** then
**Reproduce** rendered `Package bet mode ante`, `Audit verified -- complete
recorded operation`, and `Match -- recorded and recreated results agree`.

The same weighted package visibly completed a buy entry at stake `0.5` with
one accepted zero-charge continuation, and a buy-more entry at stake `1.25`.
The latter progressed through rendered pending subrounds 1, 2, and 3, then
completed at subround 4 with `Charged mode buy-more`, credits `998.75`, and
zero payout.  These are useful lifecycle observations, but they do not close
the financial matrix: this run did not retain the required per-step
buy/buy-more descriptor rows, subsequent purchases, or seeded observations
for both mechanisms.

| Screenshot | SHA-256 | independently inspected surface |
| --- | --- | --- |
| `1-observation.png` | `83126052106ae1cc6a2bf9614b296786626a140daef6f715eda64b200093c00d` | Weighted whole-sequence Replay record and selections. |
| `2-observation.png` | `f8f493e1562030c1759f4245fd3ff365b7a23b98b6857b5b02eb029a37eb05d4` | Package audit Replay completion, mode, audit verification, and match. |
| `3-observation.png` | `1d237ae8025962e543e19cefc5194cd9f11252ed43cc449cfa097fc2f8f689f7` | Weighted package buy pending/completion surface. |
| `4-observation.png` | `3f6455ae048a23ba98b5bdfc128a72fe5bb1de0ad65d88de93b19cb28effdf67` | Weighted package buy-more final four-subround surface. |

I independently opened all four screenshots; they are legible and agree with
the retained transcript.  This is a bounded partial receipt, not an approval
or a substitute for the missing descriptor and repeated-purchase evidence.

## Ordinary seeded package continuation (2026-10-15)

The persistent harness ran one new, isolated Studio profile for product
candidate `b669f487ac1881510f02db00afb56ac204282bad`; the complete runtime
transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-12-75a0b3989d3dd707/run-2026-10-15T00-07-18-066Z/transcript.json`.
It reused the authenticated current candidate build receipt (output SHA-256
`87b0f47abe27909daeae3eb8dd63224e87cd420201c3a65a4c4f6429ac1673f2`),
created `v2c12-ordinary-followup` through visible JSON authoring, built its
TypeScript package, and opened the rendered package handoff. Studio reported
the opened runtime as `Playable game` and `Added from your computer`.

With seed `v2c12-ordinary-seeded-followup`, the package's visible ante Play
result showed denomination `0.05`, stake `0.07500000000000001`, and charged
mode `ante`. Its selected public Session Spin Replay showed the same seed,
mode, stake, full-audit export state and configuration hash
`sha256:de4219633bf4c1a25c34d71eac6787cbb3f8a6394c896470075bc80a00278a0b`.
**Download JSON** produced `spin-b1d9ca0a-17fe-4db4-b2c9-982ba71e0f0f.json`
(14,417 bytes; SHA-256
`b3bf2af17efaa047188afe2a40286d607c47742dfe8e33f874672478b3e8031e`).
Reading the actual downloaded bytes confirmed the same seed, ante mode,
artifact stake, and a recorded `spin` command with bet `0.05`, stepwise
delivery, and `recorded-commands` mode policy.

The same package separately completed a buy entry at stake `0.5`, then its
second, visibly zero-stake subround (logical round: two subrounds; credits
remained `999.5`; charged mode `buy`). A fresh later session then accepted a
separate buy entry at stake `0.5`. This advances only the ordinary buy path;
the required weighted seeded run, all buy-more rows, and the complete
per-step Replay descriptor matrix remain uncollected.

| Screenshot | SHA-256 | independently inspected surface |
| --- | --- | --- |
| `1-observation.png` | `f865ebdbbe36e60f6709f53c9c844086b547caef3aa3117bcb38891fa6ef24ed` | Seeded ordinary ante result: 0.05 denomination, 0.07500000000000001 stake, financial rows, and charged ante mode. |
| `2-observation.png` | `bc908fc74b10bfb97feb47813ebe4f83e18c57510892c2597da7734502f68869` | Completed ordinary buy lifecycle: two subrounds, paid 0.5 entry, charged buy mode, and zero-payout financial surface. |

I independently opened both PNGs. They are legible and show the stated
rendered rows; the images and transcript are collection evidence only.

## Weighted seeded package continuation (2026-10-15)

One additional fresh isolated Studio profile is retained at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-12-75a0b3989d3dd707/run-2026-10-15T00-11-59-396Z/transcript.json`.
It reused the same authenticated current-candidate build, authored the
weighted `reelSequences` whole-array fixture `v2c12-weighted-followup`, built
its TypeScript package, and opened the visible package handoff. With seed
`v2c12-weighted-seeded-followup`, its completed ante result visibly showed
denomination `0.05`, stake `0.07500000000000001`, weighted symbols `A C C`,
and charged mode `ante`.

The selected public Session Spin Replay identified the seed, ante mode, full
audit export state and configuration hash
`sha256:870029342b7c1d0700c1d45a45a4d137d4cfaf2ccd97ae384e748eb656233478`.
Its **Download JSON** produced
`spin-0c11f8c6-f598-42e1-b0c0-630a08dae8c4.json` (22,120 bytes; SHA-256
`b7880515ef09f7b136e7c541396083fa7dd16f06e058963498f3175ebb9e5d49`).
The actual bytes agree with the visible record: the same seed, ante mode,
artifact stake, recorded `spin` command at bet `0.05`, stepwise delivery, and
`recorded-commands` mode policy. Screenshot `1-observation.png` (SHA-256
`2729419a978d2714e87f1a4f3035d1ee8f53aba310c97c18c23947685b819935`) was
independently opened; it is legible and shows the stated Play result.

This closes the missing seeded-ante observation for both package mechanisms,
but is still not approval: the complete ordinary/weighted repeated
buy/buy-more continuation rows and corresponding per-step Replay descriptors
remain uncollected.

## Package continuation follow-up (2026-10-15)

The isolated public-Studio runs
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-12-75a0b3989d3dd707/run-2026-10-15T00-16-47-670Z/transcript.json`
and `run-2026-10-15T00-23-26-843Z/transcript.json` reused the authenticated
candidate build and exercised newly authored ordinary and weighted
`reelSequences` package fixtures through visible JSON authoring, TypeScript
package Build, and Open as Project.  The weighted package was visibly a
read-only `Playable game` added from the local package; its Replay showed
whole-sequence selections and configuration hash
`sha256:b207eb595cfccd894daace2a218722b3d468740aa66b14eb45b8a605b79c984e`.

The ordinary package completed buy (entry `0.5`, final visible Replay stake
`0`) and buy-more (entry `1.25`, three zero-stake continuations, final Replay
stake `0`); its actual public downloads were respectively 30,806 bytes,
SHA-256 `2e128c7ba1eaa39b748c179be30e4d290bff3a1815655576b91473039ad1c9d7`,
and 82,058 bytes, SHA-256
`6b798345d2f755d1a1f3fed196a248ce6809c90848dfd97cea4cf0b6bb908277`.
Both descriptors retain their paid entry, zero-stake continuation(s), mode,
charged-mode event, and logical-round total (`0.5` or `1.25`).

The weighted package visibly completed buy (`0.5`) and buy-more (`1.25`, four
subrounds) with charged modes, including the displayed final buy-more Replay
row `stake 0`, `mode buy-more`, and whole-sequence selections.  Its downloaded
buy and buy-more descriptors were 46,654 bytes,
SHA-256 `a5448b31bea2eb90ce23a8c7c3dfa7fef4ca1faeffcafe224e1f8ca359c75de8`,
and 122,388 bytes, SHA-256
`5bdfe85aeee0d16fcec43ea547e87ad37e07c7dee5e72c23777dc8568def67d3`.
Their delivery stakes are `[0.5,0]` and `[1.25,0,0,0]` and their logical-round
totals are `0.5` and `1.25`, respectively. I independently opened the retained
ordinary and weighted financial/Replay screenshots; they were legible and
agree with these observations.

This remains bounded partial evidence, not approval. The required subsequent
weighted buy-more `1.25` purchase was not collected: after the completed
round the visible mode reset to base, and the two attempted later Spins were
rendered as base `0.05` rows rather than the requested purchase. No product
defect is asserted from that unfulfilled collection path.

## Weighted repeated-buy recovery (2026-10-15)

The persistent harness retained one fresh public Studio run at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-12-75a0b3989d3dd707/run-2026-10-15T00-32-41-132Z/transcript.json`.
It reused the authenticated candidate build, authored the weighted
whole-array `reelSequences` fixture `v2c12-weighted-recovery`, built its
TypeScript package, and opened the package as a read-only `Playable game`.
With visible seed `v2c12-weighted-recovery-seeded`, its initial buy completed
at `0.5`.  The completed one-shot feature no longer exposed mode controls;
the public **Reset Play session** recovery path restored the visible base/buy
mode selector.  After explicitly selecting `buy`, the later session's entry
rendered `0.5` with charged mode `buy`, then completed with the final visible
Replay row `Stake 0`, `Bet mode buy`, and charged-mode event.

The selected public Replay identifies session
`abe30afa-215b-4670-bc62-c093572a316e`, seed
`v2c12-weighted-recovery-seeded`, configuration hash
`sha256:7a76696843d3e539a1afc0c36622a5a23b90f2ccbdfa71ffa1346f25daf345f1`,
and whole-sequence selections `C/A/C`. Its actual **Download JSON** file was
`spin-abe30afa-215b-4670-bc62-c093572a316e.json` (46,680 bytes; SHA-256
`e809c467f94bcf7c58669bb4643e3048bb39c98642e79fd919e413ba7343c0f5`).
Reading those downloaded bytes confirmed the `buy` command, paid entry stake
`0.5`, zero-stake continuation, charged mode, and logical-round total `0.5`.

This is still not approval: the required repeated weighted buy-more `1.25`
purchase and its matching Replay/descriptor are not collected.

## Weighted repeated buy-more completion (2026-10-15)

The remaining branch was collected in the fresh isolated public-Studio run at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-12-75a0b3989d3dd707/run-2026-10-15T00-43-51-410Z/transcript.json`.
It publicly authored weighted whole-array `reelSequences` fixture
`v2c12-weighted-later-buymore`, built its TypeScript package, and opened the
result as a read-only `Playable game`. The generated package used config hash
`sha256:8f27f079fbdb5f1d025925c6dce0b4dea63ef14bc1296b87253293d6c0e2f5e6`.

With seed `v2c12-weighted-later-buymore-seeded`, the first completed public
buy-more round was used only to reach the recovery boundary. The visible
**Reset Play session** path reset the selection to base; the collector then
explicitly reselected `buy-more` at denomination `0.05` and submitted the
later purchase. Its rendered entry and continuations showed charged mode
`buy-more`, paid stake `1.25`, then three zero-stake continuations, completing
four subrounds. The selected public Replay record identifies session
`095f90cc-4a80-485e-bea8-3dd348e7ac3b`, round/request
`84f53b02-8df0-42df-99a3-dbf25487c1c6`, the same seed and config hash; its
final visible row shows `Stake 0`, `Bet mode buy-more`, `Charged mode
buy-more`, and whole-sequence `C/C/C` selections.

The actual public **Download JSON** file is
`spin-095f90cc-4a80-485e-bea8-3dd348e7ac3b.json` (122,611 bytes; SHA-256
`e6256c62a7a03c9332672025ef0c75b8710313fdb765abc1905a8538f22674de`).
Reading its bytes confirmed the recorded `spin` command at bet `0.05` and
mode `buy-more`, stepwise continuation cursors 1–3, per-step stakes
`[1.25, 0, 0, 0]`, logical-round total `1.25`, recorded-command mode policy,
and charged-mode events. The screenshots were independently opened: the Play
terminal image is legible with the completed four-subround financial surface
(`1-observation.png`, SHA-256
`b5aab27b8a07476570fa4be6578e20baa30327108e826f26fda85d353d9d073a`), and
the Replay image is legible with the selected public record, seed, package
identity and exportability (`2-observation.png`, SHA-256
`24b521b6e35c53729c26e7c36e11f640149d2767350b00f339eda58af1c8f021`).

Together with the retained ordinary/weighted antecedent, buy, omitted-seed,
and initial buy-more evidence above, this completes the previously missing
weighted later buy-more Replay/descriptor branch. Runtime artifacts remain in
the assigned harness and are not committed.

## Seeded package Replay financial viewport (2026-10-15)

Candidate product identity remains `c480a805286ea4a93ed141b8e1cebf36ac9a308f`.
The fresh public Studio run at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-12-23105d651b032fb6/run-2026-10-15T01-14-32-143Z/transcript.json`
(SHA-256 `50e4794f340aaf90efe87de3edf54bc6adbcf1305b57d72245f0c25eb2e2f6ad`)
reused the authenticated current build (output SHA-256
`87b0f47abe27909daeae3eb8dd63224e87cd420201c3a65a4c4f6429ac1673f2`).
It publicly built and opened a weighted whole-sequence TypeScript package, then
ran its `ante` 0.05 session with seed `v2c12-c480-replay-seeded`.

The selected-spin descriptor (`spin-e03daa1e-de60-44dc-8442-76514dc1bfc9.json`,
22,057 bytes, SHA-256
`1662d04f2ea65c3ab397c53967b2418489db10bd5736f8fbdd84fcd6389916ca`) and
the completed public **Replay Artifact → Reproduce** descriptor
(`v2c12-c480-replay-1.0.0-998820d763534329b92619d2e0a177e0.json`, 32,299
bytes, SHA-256 `03cd2b7bb589afad5635c067c44c19f2f8823efbccf0e810f409ec92b75ff538`)
both contain `artifact.stake: 0.07500000000000001`, `artifact.betMode: "ante"`,
the charged-mode event, `recorded-commands` mode policy, and the one executed
0.05 ante spin command. The Replay result itself rendered job
`998820d763534329b92619d2e0a177e0`, session
`07cf581a-55df-4be8-b010-a47e34d9f6a9`, package bet mode `ante`, and policy
`recorded-commands; 1 executed step commands`, followed by completed 1/1 and
an audit-verified match.

I independently opened both retained captures. `1-observation.png` (SHA-256
`43dc8d2476b53718c5e59939e60f2a44d8859eb3d61dcc64c6e39b0f44e51756`)
legibly shows the completed Replay job, package bet mode and policy.
`2-observation.png` (SHA-256
`5dd85c08479b52582b7a8906eea7d2d15cd9ffac170337a6096a9bb60ae5f1ab`)
legibly shows the same Replay's Bet mode `ante`, Stake
`0.07500000000000001`, charged mode `ante`, and whole-sequence selections.
The screenshots are runtime-only; this bounded receipt retains only their
checksums and the transcript locator.

## Recent Simulation all-mode producer boundary (2026-10-15)

Candidate product identity remains `cf08dbafb1d3cf6799e5c35526a6beeae8d78e8d`.
The persistent harness reused the authenticated candidate build (output
SHA-256 `87b0f47abe27909daeae3eb8dd63224e87cd420201c3a65a4c4f6429ac1673f2`)
and opened the retained ordinary whole-sequence package through the public
Projects intake. In the visible Simulation flow it selected **All modes**,
set five rounds, one worker, and seed `v2c12-ordinary-recent-sim`, then
activated **Run Simulation** once. That exact action rendered `Simulation
queued — 0/5 rounds`; its local terminal then rendered `Simulation failed —
10/20 rounds` and `Bet mode "buy" forces feature entry and cannot be selected
while a zero-stake feature round is already active`.

The runtime-only transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-12-a6452b8c3c3e9238/run-2026-10-15T01-47-16-044Z/transcript.json`
(SHA-256 `305601ea6b44cbc33c135065c61cec308cba440600dfef5b3b0b7b848e3c0e83`).
It records no download and no screenshot. The user-visible queued/failed
states expose no operation id, so this receipt does not invent one or claim a
Replay descriptor. The narrow source boundary is
`cli/studio/simulation/StudioSimulationService.ts` (its all-mode loop passes
each declared mode to `ParallelSimulationRunner`) and
`src/simulation/FixedBetModeForNextSimulationRoundSetting.ts` (which is
intended to swallow a forcing-mode selection while a continuation is active).
The retained package carried its own `@fromstan/pokie` dependency; no package
contents were modified in this verification.

## Recent Simulation route probe (2026-10-15)

Candidate product identity is `cf08dbafb1d3cf6799e5c35526a6beeae8d78e8d`.
One fresh Studio profile opened the retained weighted generated package through
the public Projects path, then completed a five-round, one-worker seeded
simulation and selected it through public **Replay → Recent Simulation**.
After selecting round 1 and **Load**, one **Run again** created replay job
`ff9fe367c41f41dcad8ac4423a2ed29a` and completed 1/1 at session
`7d153320-8931-4f35-a5c4-3147fdd753c8`.

The result visibly reported seed `v2c12-cf08-weighted-recent-sima`, package
mode `base`, and `repeat-when-available; 1 executed step commands`. Its actual
public download `v2c12-c480-replay-1.0.0-ff9fe367c41f41dcad8ac4423a2ed29a.json`
was 4,072 bytes, SHA-256
`bf6d3d4875446b81be3d65d48f80f60cff1f5737d89db7d9aecdf4e11654fc29`.
Reading those bytes confirmed the same seed, `modePolicy` selection
`repeat-when-available`, one base spin command, artifact stake `0.05`, base
bet mode, config hash
`sha256:35ad9aeda498b49d0224663491da5d5b32c86d7a0b38e9d9325de19b57f77ba0`,
and total bet `0.05`.

The runtime-only transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-12-a6452b8c3c3e9238/run-2026-10-15T01-34-23-428Z/transcript.json`
(SHA-256 `fc190c9ccb3caacf2e776461edd970708365bcecdb1757abe1b547504b3b0813`).
I independently opened `1-observation.png` (SHA-256
`911421156e1abc3f97b7311151969833c757617634084ad07835306053f873ed`): it
legibly shows the completed job, seed, requested/actual round, package mode,
repeat policy, and download control. This is partial evidence only: it is a
weighted base route probe, not the required ordinary-and-weighted ante/buy/
buy-more financial matrix.
