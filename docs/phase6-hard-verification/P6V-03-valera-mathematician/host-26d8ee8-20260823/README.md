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
