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
