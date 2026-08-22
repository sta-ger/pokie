# P6V-03 — Valera Mathematician independent rendered rerun

Candidate: `de77dccac23f2fdae8ae92ef29d43d3b351fba4d` (verified with `git rev-parse HEAD` before launch).

## Scope and environment

The sole Studio launch was the candidate checkout command required by the request:

```text
node ./dist/cli/pokie.js --no-open
```

It used a new Chrome profile at `.../P6V-03-14cb5fcfbadb0962/run-2026-08-22T12-58-48-397Z/browser-profile`; the first rendered page had no browser-console or network diagnostic. The Studio UI nevertheless saved the created project under its visible default `/home/stager/Documents/POKIE Projects/valera-mathematician-3/` location and the Projects page listed prior projects. This is not a fresh Studio registry, so the fresh-registry requirement is not met.

## Rendered journey transcript

1. Opened **New Blueprint** and selected **Recommended**, **Random**, then **Blank**, observing the rendered “Replaced the current blueprint” state after each; selected Recommended again for the final model.
2. Set `valera-mathematician` / `Valera Mathematician`; the rendered validation became **Valid — no issues found**. Visited Layout (5 reels × 3 rows, lines, three paylines), Symbols, Reels, Paytable, and Bets. The saved model rendered `A • WILD`, `K • SCATTER`, `Q`, `J`, and **Generation mode: Literal reel strips**. The planned artwork picker did not render a native picker, and generated-reel, stacks/constraints, modes, and mechanics were not completed before the later feature failure.
3. Created the project. **Find any win** rendered **Round complete — You won 6.00**. **Find free games** rendered “This session couldn't be completed. Try again.” The one safe retry rendered the identical product error; no further retry was made.
4. Ran the rendered 10,000-round Simulation: **RTP 897.36%**, hit frequency **92.67%**, volatility **5.75**, max win **36.00**, duration **0.7s**. Replayed round 1 from seed `42`; rendered status was **Full — round artifact captured** and **Inspectable AVAILABLE**.
5. Build/Export rendered exact Outcome Library success: **1,024 outcomes**, exact RTP **895.31%**. Stake Engine Export then rendered **Exported 4 file(s)**. Closed the project, reopened its rendered Projects-row entry, and observed the same Valera Mathematician overview and saved ID.

## Result

The ordinary win, simulation, replay, Outcome Library, Stake Engine Export, and close/reopen persistence were independently observed through visible controls. The required free-games feature behavior failed with a rendered product error after its permitted retry. The run therefore has a P1 finding and is not approval evidence.

## Retained rendered proof

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `free-games-scenario-error.png` | Second rendered failure of Find free games | `b90e74b82bc24f6e5bcba1ee66c178287d8c983cc72db56e5a6cfdfbfe8d2bc7` |
| `simulation-results.png` | Completed Simulation results | `0d793cc4b4cfba5211cac326f12c17935dab4b2a15b2150a17ae32f397a4666b` |
| `outcome-library-stake-export.png` | Rendered Outcome Library and Stake Engine export success | `ea755d18b1ebfd7c7fac071daef383cd7f193b25de47e48270dea7762b75abfa` |

## Exact-current candidate attempt (2026-08-22)

Candidate `92bd710ee5fc03e376134f7224eeba465e053a0e` was built, then launched once through the required source-checkout command, `node ./dist/cli/pokie.js --no-open`, with a new disposable `HOME` (therefore a fresh Studio registry) and a distinct Chrome profile. The rendered Home state was empty. Recommended replaced the draft successfully; Random was opened, named, and its visible **Generate** button was clicked. No rendered success, pending, or error state appeared during the bounded interaction wait, so the journey could not safely continue.

This is readiness/driver-inconclusive rather than a product finding: the UI did not render a product error, and the allowed two public-workflow launches were exhausted (the first exited before Studio launch while resolving the harness's module dependency). The retained exact-SHA transcript records only rendered actions and observations. The screenshots above remain the preserved older failed-run evidence and do not claim to prove this candidate.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-92bd710-attempt2-transcript.txt` | Bounded fresh-registry exact-SHA rendered transcript | `9a8dda6304cba368f1390309ff00689b5097261722394741f543249d73b14567` |

## Exact-current candidate recovery attempt (2026-08-22)

The repaired retained harness again launched the required source-checkout command with a new disposable Studio `HOME` and distinct Chrome profile. It rendered an empty Home registry, then completed Recommended and entered Random. The harness confirmed the supplied seed and name in their rendered fields before clicking **Generate**. The same visible Generate button immediately rendered disabled with `data-loading=true`; this proves the rendered action was accepted, so no retry was made.

After the bounded semantic-result wait, the Random dialog was absent, but the UI had rendered neither generated-success text nor a product error nor a state that could confirm Random replaced the draft. Studio's bounded output contained only its normal listening line. This is readiness-inconclusive, not a product finding. No later workflow action was performed, because Blank/final modelling and all project tabs depend on a confirmable Random outcome.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-92bd710-attempt3-recovery-transcript.txt` | Concise second fresh-registry/profile exact-SHA recovery observation | `0235893b9e865ba00ae657919e30dfa440afeb47cd03ff208f6a743b36a72b2c` |

## Exact-current candidate harness-recovery attempt 4 (2026-08-22)

The retained harness was repaired in place for all prior driver causes: it makes one safe rendered retry only when the New Blueprint dialog did not open during a closing-modal transition, recognizes the Random card by its local rendered result, and does not mistake an earlier replacement toast for a later Random replacement. A newly isolated registry/profile launch then rendered Recommended, Random (including its Generated card and enabled **Use this blueprint** action), Blank, and final Recommended on `92bd710ee5fc03e376134f7224eeba465e053a0e`.

After the final Recommended action, the rendered **Game id** field did not retain the browser-entered `valera-mathematician` value during the bounded semantic transition. No rendered product error, browser-console diagnostic, or network diagnostic appeared. This is driver-inconclusive, not a product finding; the downstream model, persistence, Play, Simulation, Replay, Outcome Library, and Stake Engine workflow was not reached before the launch limit.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-92bd710-attempt4-harness-recovery-transcript.txt` | Concise exact-SHA fresh-registry/profile rendered recovery observation | `83fa6dc6637ee0cd6f7df4f11b313f7bdf713afed9d2e8c1d00518af3ad1b525` |

## Final bounded harness recovery (2026-08-22)

The retained harness was repaired in place for the accepted Game-id keystrokes, status-badged section tabs, and generated-reel source selection. Four permitted fresh-registry/profile launches used only the required candidate-checkout command. They reached the exact candidate's empty Home, Recommended/Random/Blank/recommended replacement path, named Valera model validation, all six model tabs, literal and per-reel reel controls, and rendered generated constraints/stacks.

The final run was blocked by a harness/native-picker focus transition before the generated `Weight` field could be reached. The picker was visibly present; it was activated, focus-verified, and completed using the controller contract, but the earlier transition had already left the harness's bounded semantic wait outstanding. No rendered Studio product error, browser console error, or failed network diagnostic occurred. The four-launch limit precludes another public workflow launch, so no downstream persistence or workspace claims are made and no product finding is asserted.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-92bd710-harness-recovery-final-transcript.txt` | Bounded exact-SHA record of all four final recovery launches and their driver limitation | `1efb7f273fc4fae68c12d8bb438866e203b226c9aa185f0d4566830b3017d5d4` |

## Focused exact-candidate harness recovery (2026-08-22)

The retained harness was repaired in place for every prior driver issue, then used for the four permitted fresh-profile runs. `92bd710ee5fc03e376134f7224eeba465e053a0e` is an ancestor of this evidence-only checkout; the only `candidate..HEAD` paths are in this directory. Every launch ran exactly `node ./dist/cli/pokie.js --no-open` with a new disposable Studio `HOME`/registry and Chrome profile, and each rendered an empty Home.

The final run rendered Recommended, Random (successful Generated card and **Use this blueprint**), Blank, final Recommended, valid Valera game ID/name, all model tabs, literal and per-reel/generated reel controls, the native artwork import, and a selected generated-reel `A` symbol. The rendered artwork row changed to **Change**. The subsequent local Weight control never rendered after the accepted selection; no Studio error, browser-console error, or failed network request rendered. The launch limit was then exhausted, so no downstream workspace criterion is claimed and no product defect is asserted.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-92bd710-focused-recovery-transcript.txt` | Concise four-launch, exact-SHA driver record | `85dd8f9cf43e65426f36c1f2de7ab12638a742a3d00979254dd33cea1d78d09d` |
| `candidate-92bd710-focused-recovery-model-artwork.png` | Final fresh-profile rendered Valera Symbols state with imported A artwork | `34ab38be6517ea283530920ac9728ed12a01d2a9915c347261e84688421008ac` |

## Final exact-candidate recovery (2026-08-22)

Four additional permitted fresh-profile launches used the same repaired harness in place. Each used the exact source-checkout Studio command, a new disposable Studio registry and Chrome profile, and rendered an empty Home. The final run completed the retained successful creation path and rendered the Valera model through generated-reel setup: imported artwork, literal strips, per-reel selection, Generated, Weights, rendered A selection, weight `1`, length `8`, and an added stack rule.

The rendered **Check & preview** action was accepted, but did not render a local Preview, Validation, pending, or error result in the bounded wait. With the four-launch allowance exhausted, persistence and all workspace-only actions remain not reached. This is driver/readiness-inconclusive, not a product defect.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-92bd710-final-harness-recovery-transcript.txt` | Concise exact-SHA four-launch final recovery record | `e31c5c793b7f12059a9bcf3f674bff2b27847ee4dc62b707dc378d6b2f0cb066` |

## Final focused harness recovery (2026-08-22)

Four additional isolated exact-candidate runs repaired the retained selector/readiness causes in place. The final run rendered an empty registry, Recommended/Random/Blank/final-Recommended replacement, a valid Valera model, all model tabs, A wild, K scatter, native-picker artwork import, warning-free wild paytable cleanup, and literal preview success. It then rendered the generated-reel controls through Weight, Length, and stack entry.

Generated **Check & preview** produced no local Preview, Validation, pending, or error result and no preview request in bounded diagnostics. No action was duplicated; the fresh-launch limit exhausted before persistence or workspace workflows. This remains readiness-inconclusive rather than a product finding.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-92bd710-final-focused-harness-recovery-transcript.txt` | Final bounded exact-SHA recovery record | `7af7e43a97116f00a9dab9ac34841d4cdc9065b8651c1ce6f4041f2c87d4118b` |

## Attempt 5 rendered harness recovery (2026-08-22)

Four permitted fresh-profile launches used the retained harness in place and only `node ./dist/cli/pokie.js --no-open` from this source checkout. The final launch rendered an empty Home registry on `92bd710ee5fc03e376134f7224eeba465e053a0e`, completed Recommended/Random/Blank/final-Recommended, final Valera identifiers, all editor sections, wild/scatter, focused native artwork selection, literal preview success, and the generated Weights editor through an accepted A weight.

The generated editor's rendered Symbol picker never exposed Q after its one safe local reopen. No rendered Studio product error, browser-console error, or failed preview request occurred. This is driver-inconclusive; generated apply/persistence and every workspace-only operation were not reached before the launch limit. The retained evidence remains unchanged.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-92bd710-attempt5-rendered-recovery-transcript.txt` | Concise final exact-SHA rendered recovery and bounded driver outcome | `e7653e7567acb1dd671d613adb0c994fb512dec09c8d7d3549fc5cd29f12980b` |

## Stable harness recovery attempt 6 (2026-08-22)

The retained harness was repaired in place for every listed driver cause, then used for its four permitted exact-candidate fresh-profile launches. Each used the required source-checkout command, a distinct disposable Studio `HOME`/registry, and a distinct Chrome profile; each rendered an empty Home registry. The final run rendered the full blueprint entry sequence, valid Valera identifiers, all model tabs, wild/scatter, focused native artwork import, literal Preview success, generated `A` weight, automatic length, and an accepted **Add stack rule** action.

No local `Stack 1:` row, success, or error rendered in the bounded action wait. There was no Studio product error, console diagnostic, or failed request, and the four-launch limit prevents another public workflow run. Generated apply, project persistence, and workspace-only flows remain unclaimed. The retained focused-model screenshot remains the minimal representative proof; this attempt adds no generated artifact or raw log.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-92bd710-attempt6-stable-harness-recovery-transcript.txt` | Bounded four-launch exact-SHA recovery observation | `a892b6730554c3bf254f8d8fff19ada70ad24ba960c05b4fb6ac043ee6dd2228` |

## Stack-transition harness recovery attempt 7 (2026-08-22)

The retained evidence files were rechecked and remain present with their recorded SHA-256 values. Four newly isolated exact-candidate launches used only the required source-checkout command, `node ./dist/cli/pokie.js --no-open`; every launch rendered an empty Studio Home with a distinct disposable registry and Chrome profile.

All four reached the complete retained entry/model path through native artwork import, literal Preview success, generated Weights, source `A` weight `2`, and automatic length `2`. The repaired harness then tried four distinct rendered stack/constraint routes: the Eligible stack symbols picker (one safe reopen), explicit stack length/count plus **Add stack rule**, **No stacks**, and **Show advanced details (constraints JSON)**. None rendered a committed local stack row or advanced textarea; Studio rendered no product error, console error, or failed request. The four-launch allowance is exhausted, so generated apply, persistence, Play, Simulation, Replay, Outcome Library, and Stake Engine Export remain unclaimed.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-92bd710-attempt7-stack-recovery-transcript.txt` | Concise four-launch exact-SHA stack-transition recovery record | `905794277835091617568c2351858810f8546ddd57ad5d222778ea5fb781d4a1` |

## Focused full rendered journey attempt 8 (2026-08-22)

The repaired retained harness used four new isolated exact-candidate Studio registries and Chrome profiles; every rendered an empty Home, and all launches used only `node ./dist/cli/pokie.js --no-open` from this checkout. The final fresh profile completed the literal and generated reel paths, stack and common constraints, generated Preview/Apply, project creation, persisted Bets & Modes and free-game mechanics, ordinary Play win, configured-feature Play, and 1,000-round Simulation. The rendered Replay screen had no Inspect/Reproduce action, and the rendered Outcome Library action returned no local result or error after its 120-second semantic wait despite its one public UI request returning 200. It was not repeated; Stake Engine Export and close/reopen persistence were therefore not reached. No rendered product error or P0/P1/material-P2 product defect was observed.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-92bd710-attempt8-full-journey-transcript.txt` | Bounded exact-SHA rendered journey record | `d82869ded10548778c36c8da46ab52c71457724c11cd241b7f357afbda357f2c` |
| `candidate-92bd710-attempt8-generated-reel.png` | Rendered generated-reel success | `d2413fa0733eea14ab5fb2618fe0022b7b430da23b12a228a6353214f1335a1e` |
| `candidate-92bd710-attempt8-ordinary-win.png` | Rendered ordinary Play win | `49919fa808e00ff4dbb46adafc492f61513a4149165193d1852657fb904161d6` |
| `candidate-92bd710-attempt8-configured-feature.png` | Rendered free-games feature event | `0f7073c7ecd0a297a42e7399e0c508e12d0f87215b97d0e5e3725b24600db175` |
| `candidate-92bd710-attempt8-simulation.png` | Rendered Simulation results | `606dc3d4bcb1836fbf7dc1f17506bdb9701f4507b148c8f0563e0ce6324a469f` |
| `candidate-92bd710-attempt8-replay.png` | Rendered Replay surface, with no available inspect/reproduce control | `f003c0d6db1b14045ce78eabade4558c335811fc11a903ada2daeab8267dc045` |
