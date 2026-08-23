# P6V-03 host-side browser rerun

Candidate: `26d8ee826c1dd74369df5a7bc39a05dfe1d97785`.

Fresh-start conditions: candidate `npm run build` completed before launch; Studio was launched once from this checkout with `node ./dist/cli/pokie.js --no-open`; the Studio process used a newly created XDG config/data/cache runtime directory and Chrome used a new profile. No source, prior evidence, or prior audit harness was used to drive the journey.

## Rendered checklist and outcome

| Item | Outcome |
| --- | --- |
| Recommended Project | Created as `Starter Slot`; initial model rendered valid. |
| Layout and paylines | Added and saved a fourth payline; model rendered `Paylines: 4`. |
| Symbols and artwork | Selected `/usr/share/pixmaps/debian-logo.png` through the active native picker and saved it for `A`; `A · WILD` rendered afterwards. |
| Literal reels | Duplicated a literal `A` stop and saved. |
| Generated reels, constraints, stacks | Opened the per-reel modeler, made a generated Reel 1 draft, added `A: 3`, a minimum-spacing constraint, and a fixed length-2 stack rule. The UI correctly reported that the remaining empty per-reel strips would be invalid; the draft was reverted to valid literal strips. |
| Paytable, bets, modes, mechanics | Paytable was inspected. Bet/mode edit controls were exercised then explicitly discarded. Mechanics/free-games were not configured. |
| Save, close, reopen | Closed `Starter Slot`, reopened it from Projects, and saw the persisted artwork/wild/payline changes plus valid-with-warnings status. |
| Play | A spin completed; `Find any win` produced the rendered success `You won 12.00`. `Find free games` rendered the expected configuration-required message because this configured game has no free-games mechanic. |
| Simulation | Ran exactly one round. Review rendered RTP 0.00%, hit frequency 0.00%, max win 0.00, and the one-round warning. |
| Replay | Loaded the recorded `Find any win` Session Spin; the rendered replay marked it inspectable and exportable. |
| Outcome Library | Generated 1,280 exact outcomes for base mode; rendered RTP was 645.00% for this intentionally modified configuration. |
| Stake Engine | Export completed: rendered `Exported 4 file(s)`. |
| Random Project | Generated `random-gate` with seed `20260815`, used the blueprint, and created its managed Project; UI rendered `Valid — no issues found.` |
| Blank Project | Selected Blank, filled ID/name, and Create Project rendered the expected incomplete-blueprint validation (missing symbols and paytable), rather than creating an invalid managed project. |

This was not a full pass: a saved scatter configuration, saved mechanics/free-games behavior, and a saved paytable/bet-mode edit were not completed. Consequently the required uncoached second launch was not started. No rendered product defect was observed in the completed branches.

## Focused harness recovery (2026-08-23)

Candidate: `26d8ee826c1dd74369df5a7bc39a05dfe1d97785`. The candidate was rebuilt once before the rerun. Each of the four permitted browser launches used `node ./dist/cli/pokie.js --no-open` from this checkout, with a new XDG Studio registry and a new Chrome profile. The persistent assigned harness was repaired in place between runs; no source or test files were changed.

The last rendered fresh journey created Recommended and saved these values in its managed Project: four paylines; `A · WILD`; `K · SCATTER`; `A ×3` payout `11`; available bets `1, 2, 5, 10`; one Base default bet mode; and free games `K`, `3x → 5`. It closed and reopened the Project and rendered those persisted values. Play rendered both a settled `Find any win` result and feature behavior from `Find free games`.

This recovery run did not reach Simulation, Replay, Build/Export, Random, or Blank. The last action was a rendered Simulation transition; the harness could not locate its required `Rounds` field through the label structure, and no rendered product error appeared. This is recorded as browser-driver selector inconclusive, not a product finding. Earlier retained rendered observations for Simulation, Replay, Outcome Library, Stake Engine, Random and Blank remain above, but this recovery did not independently complete the full journey.

## Focused harness recovery, follow-up (2026-08-23)

Candidate: `26d8ee826c1dd74369df5a7bc39a05dfe1d97785`. Four new cold-start attempts used the exact-source `node ./dist/cli/pokie.js --no-open` command, each with a new Studio XDG registry and Chrome profile. The persistent assigned harness was repaired in place after each driver observation; no product or test source was changed.

The final rendered journey created Recommended, saved a fourth payline, opened the real native artwork picker, verified its focused picker process before typing `/usr/share/pixmaps/debian-logo.png`, then saved `A · WILD` and `K · SCATTER`. The view-mode projection rendered the saved wildcard, scatter, and four paylines without a product error. The harness then incorrectly awaited the editor-only `Change` action after it had already returned to the saved view. That selector threshold is driver/readiness-inconclusive, not a product finding. The launch allowance was exhausted before Reel Modeler, persistence/reopen, Play, Simulation, Replay, Outcome Library, Stake Engine, Random, and Blank could be independently continued.

## Final bounded harness repair (2026-08-23)

Candidate: `26d8ee826c1dd74369df5a7bc39a05dfe1d97785`; source differences from that candidate were documentation only. One candidate build completed before four new cold starts. Every start used `node ./dist/cli/pokie.js --no-open` from this checkout, a newly created Studio XDG registry, and a new Chrome profile.

The repaired rendered journey consistently created Recommended, saved four paylines, saved `A · WILD` and `K · SCATTER`, and used the focused native picker for `/usr/share/pixmaps/debian-logo.png`. The final launch repaired the generated-reel Symbol combobox path via the real focused combobox keyboard interaction. It reached the generated Reel 1 confirmation view, which rendered `Reel 1 has unapplied changes`, `Use changes`, `Discard`, and `Back to Preview`; this demonstrates the preceding generated preview/apply transition completed. The harness had awaited its superseded `Modified — not saved` phrase rather than that local success screen. No rendered product error appeared.

The launch allowance was exhausted before `Use changes` could be selected and before paytable, bets/modes, mechanics, close/reopen, Play, Simulation, Replay, Outcome Library, Stake Engine, Random, and Blank could be independently completed. This is driver-inconclusive, not a product finding. The temporary final result record had SHA-256 `08df4458b4df9ef784b8597999436e9f1b067255aa4378df937abc1221eb9999`; it is intentionally not committed.

## Focused recovery continuation (2026-08-23)

Candidate: `26d8ee826c1dd74369df5a7bc39a05dfe1d97785`; the checkout differed only by evidence documentation. Four fresh starts used the already-current candidate build and exactly `node ./dist/cli/pokie.js --no-open` from this checkout. Each had a new Studio XDG config/data/cache registry and Chrome profile. The persistent assigned harness was repaired only in place; no product/test source, DOM/state injection, or private API was used.

| Literal checklist item | Final rendered outcome |
| --- | --- |
| Recommended; layout/paylines; wild/scatter/artwork | Passed: Recommended Project was created; four paylines, `A · WILD`, `K · SCATTER`, and `/usr/share/pixmaps/debian-logo.png` selected through the focused native picker were saved. |
| Literal/generated reels; constraints/stacks | Passed: literal preview and generated Reel 1 (`A: 3`, minimum-spacing constraint, fixed length-2 stack) were previewed, applied through the exact `Use changes` control, and saved as `Generation mode: Per-reel generation`. |
| Paytable; bets/modes; mechanics | Passed: `A ×3` payout `11`, available bets `1, 2, 5, 10`, a Base default mode, and free games `K`, `3x → 5` were saved. |
| Save, close, reopen | Passed: the reopened Project rendered the saved paylines, scatter, free-games, and bets. |
| Play; Simulation; Replay | Passed: a settled ordinary win and free-games behavior rendered; one-round Simulation rendered RTP/results; Replay rendered the recorded Play scenario. |
| Outcome Library; Stake Engine | Not reached: the final run rendered the real `Build/Export` page, but the harness awaited obsolete `Build Export` text and did not issue either action. |
| Random; Blank | Not reached: blocked by the exhausted four-launch recovery allowance. |

No rendered P0, P1, or material P2 product defect appeared. The final raw, uncommitted result record has SHA-256 `bb7bde2d8f6689d81953257d8902f12ba9e77270343f74cfa8dd81810e85a344`. The remaining gap is a driver selector/readiness recovery, so this continuation is inconclusive rather than a product finding.
