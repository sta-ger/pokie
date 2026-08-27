# PC-03 current-candidate Studio transcript

Candidate: `3aa0566ac9a338b2287445d057af6597d2243626` (`git rev-parse HEAD` before build and launch).  Studio was built from that checkout and started with `node ./dist/cli/pokie.js --no-open`.

Scope: a new, isolated browser profile; no roadmap, source, architectural material, prior findings, or retained evidence was consulted during the exploration.  The second fresh-profile entry rendered the default **Design Your Game** start screen.  The uncoached intent was: “I want to make a game and see what comes next.”

| Rendered action | Observed complete result / next useful state |
| --- | --- |
| Recommended starter, after automatic validation | All six design sections reported `valid`; **Create game** enabled. |
| Create game | Opened `Starter Slot` project workspace; visible next actions included Play, Simulation, Replay, and Build/Export. |
| Play → New Play session → Spin | A real round settled (`no win`, credits `999`, stake `1.00`); round artifact became inspectable. |
| Simulation, rounds changed to `1` → Run Simulation | Completed 1/1 round; rendered RTP, hit frequency, warnings, report/repeat controls, and a recent-run row. |
| Replay → Session Spin → selected recorded spin | Reused the Play round.  The inspector identified source `Recorded -- Play tab spin`, session/round, completeness `Full`, and `Exportable AVAILABLE`. |
| Build/Export, exact outcome library | Rendered successful exact generation of 1,024 base outcomes, then enabled Stake Engine export. |
| Run Stake Engine Export | Rendered `Exported 4 file(s)` to the local `stakeengine` destination and exposed its output-folder action. |
| Reload Build/Export | Reload returned to the same project/export route without a rendered error; output files remained present for checksum inspection. |

Disabled/recovery observations were rendered rather than inferred: Create game remained disabled while automatic validation was pending and became enabled after valid sections appeared; Stake Engine Export was disabled until the canonical outcome library was generated, then enabled; Replay’s download was disabled until a recorded session spin was selected, then enabled.  No duplicate non-idempotent action was issued while an operation was pending.

Generated-artifact inspection (names and checksums only; no generated tree retained):

```
outcomelibrary/index_base.json  49b531ef7642a50aa1b863c8e83ce7743ee9eb22211b26dc7237c58742dc245a
outcomelibrary/manifest.json    d73de055d1d97233184ba43ca024163a6bad4b56e6de87431149364999cb87bd
outcomelibrary/outcomes_base.jsonl afc90be68bebaa62f3cb01cf2f653c438873b675998ea36802d6951391929745
stakeengine/books_base.jsonl.zst c0dc33f77175b4ee5e1a15afaee2a441360645bee7758e2cf1d829b63c66d901
stakeengine/index.json          57e19f4de9b88cc3e45e7a5a2f11e0940b465ff9e09a5e1553d58b384807a5d5
stakeengine/lookup_base.csv     a6ab06e0ae86547667fff1418a5d62aa3de9c4b53e7cd1d757cde2267c934dc0
stakeengine/pokie-manifest.json c176cb281175e4d635b5c786b96ab4427ff205a5afaa4ac31abfe5164cb91ce4
```

No new screenshot is retained: the rendered state changes, handoff, disabled-to-enabled prerequisites, and reload result are recorded above; pre-existing PC-03 visual evidence is preserved unchanged.  No product or test code was modified.
