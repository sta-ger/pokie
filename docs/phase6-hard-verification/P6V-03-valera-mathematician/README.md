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
