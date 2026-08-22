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

## Conclusive exact-candidate recovery attempt 9 (2026-08-22)

The retained harness was repaired in place and run with a fourth newly isolated registry/profile. It used only `node ./dist/cli/pokie.js --no-open` from this source checkout, rendered an empty Home, and completed Recommended/Random/Blank/final-Recommended, all model sections, native-picker artwork import, literal and generated reel preview/apply, project creation, Bets & Modes save, persisted scatter-triggered free games, ordinary and configured-feature Play, and a 1,000-round Simulation. Replay rendered, but offered no Inspect/Reproduce action.

The visible **Generate exact outcome library** action rendered a local product error: `"valera-mathematician" does not implement createExactEnumerationSession(); its outcome space cannot be exactly enumerated.` Its one UI request completed; it was not retried. After that failure, **Run Stake Engine Export** was unavailable, so Stake Export and close/reopen persistence were not reached. This is a P1 finding: the required exact Outcome Library workflow is unsupported for the model that Studio's own rendered journey creates.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-92bd710-attempt9-conclusive-rendered-transcript.txt` | Concise exact-SHA, fresh-profile rendered journey and blocked downstream state | `0afe38271c3a46351c3654528609ff51756e1b6dedd5882a400097036a3a6643` |
| `candidate-92bd710-attempt9-outcome-library-error.png` | Rendered Outcome Library error after the visible UI action | `79e27d8aaca975673630ea44039293f35420d3a09db038efc3521867569f1914` |

## Candidate `891197a45d46900ec570aaba6001f9aaacb1436d` independent rerun (2026-08-22)

The current candidate was built before the rerun. Two isolated launches used
only `node ./dist/cli/pokie.js --no-open`, each with a new Studio HOME/registry
and a new visible Chromium profile. The second, repaired launch rendered the
empty Design Game entry, Recommended, and the Random form; it accepted the
rendered seed `20260815` and name `P6V03 Random`, then accepted one visible
**Generate** click.

No generated result, pending state, or rendered product error appeared during
the bounded semantic wait. The click was not duplicated and, after the second
permitted public-workflow launch, no later operation was reachable. This is
readiness-inconclusive rather than a product finding; it neither confirms nor
contradicts the current free-game enumeration repair. No screenshot is retained
because no additional successful state was rendered.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-891197a-full-journey-transcript.txt` | Exact-SHA, fresh-registry/profile rendered-action transcript and bounded readiness outcome | `dcfc255d19d3708bc54b567dce8b175156cf6964d0c1a33950be4847500eae3b` |

## Focused Random-render recovery (2026-08-22)

The retained current-SHA evidence and its checksum were rechecked before this
recovery. Two further fresh Studio HOME/registry and visible Chromium-profile
launches used only `node ./dist/cli/pokie.js --no-open` from this checkout,
whose source differs from `891197a45d46900ec570aaba6001f9aaacb1436d` only by
this evidence directory. The repaired harness proved Random through the
specific enabled **Use this blueprint** control rather than an exact generated
sentence.

The first launch used the prior seeded rendered form; the second used the
rendered unseeded default. Each accepted exactly one visible **Generate**
click, and the second ordinary UI request returned HTTP 200. Neither rendered
an enabled **Use this blueprint**, a pending transition, or a local product
error within the bounded semantic wait. No click was repeated and no later
workflow operation was reachable. This is readiness-inconclusive under the
controller contract, not a product finding.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-891197a-recovery-full-journey-transcript.txt` | Seeded fresh-profile recovery attempt | `85e18bbf553f5a514c96b31e0eacf59df208eeafaa97e3b1c391c27b2046a38c` |
| `candidate-891197a-recovery2-full-journey-transcript.txt` | Unseeded fresh-profile recovery with bounded request-status diagnostic | `832608f5f67983a2c11d31e0eacf59df208eeafaa97e3b1c391c27b2046a38c` |

## Current-SHA Random control recovery (2026-08-22)

The retained current-SHA transcripts were rechecked before this focused recovery.
The candidate Studio client was rebuilt once, and four permitted fresh visible
Studio launches each used a distinct disposable Studio HOME/registry and Chrome
profile, with only `node ./dist/cli/pokie.js --no-open` launched from this
checkout. The final run scoped the action to the rendered Random modal's
**Generate** control and verified its screen hit target before dispatching the
one click.

The displayed Random modal then closed. Its underlying rendered draft identity
remained `starter-slot` / `Starter Slot`; no generated result, pending state,
local product error, browser-console diagnostic, or Random request failure
rendered. The request completed with HTTP 200. Because no success was rendered
and the four-launch recovery allowance is exhausted, the literal model,
persistence, Play, Simulation, Replay, Outcome Library, and Stake Engine
workflow portions were not safely reachable. This is driver-inconclusive under
the controller contract, not a product finding. No screenshot is retained
because this recovery reached no additional successful rendered state.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-891197a-recovery3-full-journey-transcript.txt` | Fourth fresh-registry/profile, exact-SHA rendered-control recovery | `699af45e551de77c18c33f89c6878ebf7e807a167ef6b3194cf9ce1024084573` |

## Current-SHA harness-coordinate recovery (2026-08-22)

The retained current-SHA files and checksums were rechecked. The candidate was
built once, then four newly isolated registry/profile launches used the repaired
persisted harness and only `node ./dist/cli/pokie.js --no-open`. The final
launch removed its incorrect second viewport emulation and reached the exact
visible Random modal **Generate** button by verified rendered hit target; its
single click issued `POST /api/home/blueprints/random` with HTTP 200.

The modal closed while the underlying rendered draft remained `starter-slot` /
`Starter Slot`; no generated card, pending state, local error, or browser
diagnostic rendered. The action was not duplicated. With the four-launch limit
exhausted, Random replacement, Blank/final-model entry, modelling, persistence,
Play, Simulation, Replay, Outcome Library, and Stake Engine Export were not
safely reachable. This is driver-inconclusive, not a rendered product finding;
no screenshot is retained because no additional success was rendered.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-891197a-recovery4-full-journey-transcript.txt` | Fourth fresh-registry/profile current-SHA, rendered-control coordinate recovery | `b2b99cd4b7c5ed3707ecb1fc26b308015fb3d46a04e1f431ef4a57bbd98204f6` |

## Stabilized current-SHA Random recovery (2026-08-22)

The retained current-SHA evidence and checksums were rechecked before this
fresh-profile recovery. The repaired persistent harness stabilized the rendered
control after scrolling, used complete pointer press/release events, and then
performed one visible **Generate** action in a new disposable Studio
HOME/registry and Chromium profile. Studio was launched only with
`node ./dist/cli/pokie.js --no-open` from this checkout.

The rendered action issued `POST /api/home/blueprints/random` with HTTP 200,
but the modal closed while the underlying draft remained `starter-slot` /
`Starter Slot`. No generated result, pending state, local product error, or
browser diagnostic rendered. The action was not duplicated. The later
keyboard/native probes did not emit a UI request and are deliberately not
retained as product evidence. With the invocation launch allowance exhausted,
Random replacement and every downstream modelling, persistence, Play,
Simulation, Replay, Outcome Library, and Stake Engine workflow remain
unreached. This is driver-inconclusive under the controller contract, not a
rendered product finding. No screenshot is retained because no additional
successful rendered state appeared.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-891197a-recovery5-full-journey-transcript.txt` | Exact-SHA fresh-profile stabilized rendered Random recovery | `91b8b9c7fde93a4762a8227d07a6c928843592dca839843ea9d92d9456145788` |

## Focused current-SHA harness recovery (2026-08-22)

The retained current-SHA files were rechecked before recovery. The transcript
below preserves its prior bounded record and appends this new run. One newly
isolated Studio HOME/registry and Chromium-profile launch used only
`node ./dist/cli/pokie.js --no-open` from this checkout; its only
candidate-to-HEAD changes are this evidence directory. The persistent harness
was repaired in place for every listed prior cause: it used the Random dialog's
own directly resolved visible **Generate** button, verified that its centre hit
the button itself, moved to that exact rendered point, and issued one complete
pointer press/release without first changing focus or editing a field.

The click produced neither a Random request nor a local rendered success,
pending, error, or replacement identity during the 120-second semantic wait.
No duplicate action was sent. The Random transition is therefore
driver-inconclusive, not a product finding; Blank/final modelling, persistence,
Play, Simulation, Replay, Outcome Library, and Stake Engine Export remain
unreached. No screenshot is retained because this recovery yielded no
additional successful rendered product state.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-891197a-recovery8-full-journey-transcript.txt` | Exact-SHA fresh-profile direct-hit-target recovery observation | `ec97beb78bab6bd7c89a91c87bfca80e8d6525c7ca58b7422b06e3a1ed6065a0` |

## Current-SHA focused harness recovery (2026-08-22)

Retained candidate-bound evidence and checksums were rechecked before this
recovery. Four permitted fresh Studio registries and Chromium profiles used the
persisted harness repaired in place for the complete recorded failure history.
Each launch used only `node ./dist/cli/pokie.js --no-open` from this checkout.
The final fresh run reached the rendered New Blueprint dialog on its safe retry,
then the rendered **Recommended** action did not produce its specific local
dialog-close transition. No Studio error, browser diagnostic, or failed Random
request rendered. The prior three launches respectively exposed the harness's
idle-as-pending classifier, the New Blueprint transition race, and the invalid
identity assertion for the intentionally identical Recommended draft; those
causes were repaired in the same retained harness before the final launch.

The four-launch allowance is exhausted. This is driver-inconclusive, not a
product finding: Random, Blank/final modelling, persistence, Play, Simulation,
Replay, Outcome Library, and Stake Engine Export were not safely reachable. No
new screenshot is retained because no additional successful product state
rendered.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-891197a-recovery9-full-journey-transcript.txt` | Final exact-SHA fresh-profile rendered-control recovery observation | `e0324f42bd0962f48f3419f08ba49a8fac8df81ffda948974258e49fc9986102` |

## Focused harness recovery 10 — exact candidate (2026-08-22)

The candidate Studio client was rebuilt, then four disposable Studio `HOME`
registries and Chromium profiles were used only with
`node ./dist/cli/pokie.js --no-open`. The final fresh-profile run completed
Recommended, Random (its rendered Generated card and enabled **Use this
blueprint**), Blank, final Recommended, the Valera identity fields,
Layout/Symbols/Reels/Paytable/Bets, A wild, K scatter, literal reel input and
its local **Literal strip** preview, and generated-reel A weight plus a common
constraint.

After the visible Eligible stack symbols picker accepted A, its next rendered
Minimum stack length control did not appear. No rendered Studio error,
browser-console diagnostic, or failed network diagnostic appeared, so this is
driver-inconclusive rather than a product finding. Generated apply, project
persistence, Play, Simulation, Replay, Outcome Library, and Stake Engine Export
were not reached; no P0, P1, or material P2 is asserted.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-891197a-recovery10-full-journey-transcript.txt` | Current-SHA bounded rendered recovery transcript | `0955c33fa2372b86259624bf74efb349c68d548021d12cd23506b62e5d564fd1` |

## Focused harness recovery 11 — exact candidate (2026-08-22)

The retained exact-SHA evidence was rechecked before four newly isolated
Studio registry/Chromium-profile runs using only `node ./dist/cli/pokie.js
--no-open`. The repaired persistent harness reached Recommended, Random,
Blank, final Recommended, Valera identifiers, all model sections, wild/scatter,
literal preview, generated Weights, a common constraint, and a committed stack
rule. Its Preview click was verified against the rendered control; the browser
observed HTTP 200, but no generated local Preview result rendered. A bounded
passive diagnostic showed the returned validation payload lacked symbolWeights,
so no unconfirmed select action was promoted to product evidence. No rendered
product error or P0/P1/material-P2 defect was observed; generated apply,
persistence, Play, Simulation, Replay, Outcome Library, and Stake Engine
Export remain unreached.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-891197a-recovery11-full-journey-transcript.txt` | Four-launch, exact-SHA rendered recovery and bounded driver diagnostic | `0b584e8e5e405ea91e2c7fff1cb8b1ea7a64215b0e49e64b96f13cb33f33d35f` |

## Focused harness recovery 14 — exact candidate (2026-08-22)

The retained candidate-bound checksums above were rechecked before the four
fresh-profile recovery launches. The persistent harness was repaired in place
for the recorded dropdown and modeler-step causes: it now selects the visible
combobox option itself, confirms the labelled control's committed value (or its
own rendered MultiSelect pill), and follows Preview → stop-window → Done →
Apply. Every launch used a newly isolated Studio HOME/registry and Chromium
profile, and launched only `node ./dist/cli/pokie.js --no-open` from this
candidate checkout.

The final launch created Recommended, Random, Blank, and final Recommended
drafts; set the Valera identity; reached each model section; marked A wild and
K scatter; locally previewed a non-empty literal strip; and rendered a
successful generated A-weight reel with its occurrence constraint and stack
rule. It applied that reel and created the project through rendered controls.
The subsequent rendered Game Model Save produced no local success, pending, or
error state in the bounded semantic wait. No product error was rendered, so
the remaining persistence, Play, Simulation, Replay, Outcome Library, and
Stake Engine workflow is driver-inconclusive rather than a product finding.

| Persisted criterion | Result and current evidence |
| --- | --- |
| Fresh registry and browser profile on `891197a45d46900ec570aaba6001f9aaacb1436d` | Passed: retained recovery 11 and this recovery use disposable Studio registries and Chromium profiles with the stipulated source command. |
| Complete literal modelling and persistence through rendered controls | Not reached: recovery 14 proves literal/generated model work, apply, and project creation; the unconfirmed Model Save prevents the complete persistence claim. |
| Ordinary/configured Play, Simulation, Replay, Outcome Library, and Stake Engine | Not reached: these depend on the unconfirmed persistence transition. |
| Bounded exact-SHA transcript and minimal rendered proof | Passed: this transcript and one model screenshot are exact-SHA bounded proof; no generated project/output tree or raw log is retained. |

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `candidate-891197a-recovery14-full-journey-transcript.txt` | Exact-SHA fresh-profile recovery transcript | `c064998d2d5cdf2ab7b04bb8453a472f9cb2be2e8eab6779b2bcb5646798997b` |
| `candidate-891197a-recovery14-model.png` | One rendered generated-reel success proof | `d2413fa0733eea14ab5fb2618fe0022b7b430da23b12a228a6353214f1335a1e` |
