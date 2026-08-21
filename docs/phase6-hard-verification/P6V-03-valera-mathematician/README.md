# P6V-03 independent browser rerun — finding

Candidate: `63441f930267b907dc80fd631cf0c6943d5e1762`.

Fresh-start conditions: the candidate was built in this checkout, Studio was launched once with `node ./dist/cli/pokie.js --no-open`, and Chrome used a newly-created profile. The pre-existing host Studio registry was not empty; existing projects were left untouched.

Rendered checklist and outcome:

- Recommended Blueprint was created and saved as `starter-slot-49`; Random was generated through the modal and saved as `random-audit`; Blank was selected and its required id/name validation was exercised. Blank was not saved because the rendered validator still required symbols and a paytable.
- In the Recommended project, rendered editors saved a fourth payline; `A` as Wild with selected PNG artwork; `K` as Scatter; per-reel generation with a generated Reel 1, count, locked position and minimum-spacing constraint; a changed paytable payout; available bets plus a Base Mode; and a scatter-triggered 3-to-5 free-games award. `edited-mechanics.png` shows the latter rendered state. The project was then closed.
- Filtering the visible registry to `starter-slot-49` and pressing its rendered **Open** button produced the rendered error: “The blueprint file could not be completed. Try again. If it continues, choose the location again and retry.” (`reopen-error.png`). This prevents the required persistence proof and blocks Play, Simulation, Replay, Outcome Library, Stake export, and the second cold-start exploration.

Checksums:

- `edited-mechanics.png`: `29da50f53bb6f0ea758dcbf3d529af8da3b431bd8c81aa7c8cca7d0578e9d093`
- `reopen-error.png`: `982149e3a28a01fbd0685eea642ce98cc84e05b53a4599e7bed9ccfa31b23925`
