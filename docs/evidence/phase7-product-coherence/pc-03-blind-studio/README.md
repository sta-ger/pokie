# PC-03 — blind Studio workflow ledger

Candidate: `a84c906d60d220cbf93a0a9e80646dc06acd6e11`.

## Boundary

On 2026-08-27, this verifier built the candidate, then used four new isolated
Chromium profiles to drive only rendered Studio controls. Every Studio launch
was from this checkout with exactly `node ./dist/cli/pokie.js --no-open`.
The public Docs index was reached in the retained fresh-profile check. No
source, private API, DOM/state injection, or product code/test change was
used. Each runtime/profile/project directory was isolated and removed after
its session.

Retained screenshots are the smallest representative set (SHA-256):

| File | SHA-256 | Visible state |
| --- | --- | --- |
| `fresh-start.png` | `1b2fdea9d3852957c65915af722a85c4f0f2528c2d6db683727d3b5c65ed7b3d` | Fresh Design entrypoint and public documentation links. |
| `play-outcome.png` | `da3edb19876e450a6d44722bce51c273c9bcac2325ea233ff01c9e8a2aad63d9` | Settled Play round. |
| `simulation-result.png` | `6f009f2575115383e1e27a462ee38666578d4d501e69a7c6563a19bd4f838bad` | Accepted Simulation job in its visible queued state. |
| `replay-result.png` | `da931da1e803aa2e903257b560eb4bc4bafc35347276bbb9109318d687359b97` | Loaded Replay configuration and its accurate not-yet-run state. |

## Rendered workflow ledger

| Entry point / rendered action | Rendered outcome and state | Visible recovery or natural next action |
| --- | --- | --- |
| Fresh Studio → `Design Your Game` | Editable required Game id, Game name, and Version fields; Game basics, Layout, Symbols, Reels, Paytable, and Bets tabs; advanced file/JSON disclosure; `Create game`; `Choose a different start`. | Edit the fields or design tabs, choose another start, or create the valid starter design. |
| Automatic design validation | It first said it was checking; then `Valid — no issues found` appeared and every listed design tab carried `valid`. `Preview Game Model` remained available. | Correct a displayed issue if one occurs; here the valid Create path was available. |
| `Create game` | Created the editable `Starter Slot` workspace. Overview showed `Checking project…` in one pass and the settled `Valid — no issues found` state in the later fresh pass. Reached workspace tabs: Overview, Game Model, Play, Simulation, Replay, Build/Export. | `Open Play`, `Game Model`, or the other rendered workspace tabs. |
| Play → `New Play session` | Initial Play entrypoint offered `Start Play`, advanced seed details, and `New Play session`. The session then rendered Bet, `Spin`, scenario searches, disabled `Find symbol win` before choosing a symbol, and the empty state `No round played yet -- Spin to play.` | `Spin`; `Reset Play session` was the visible session recovery. |
| Play → `Spin` | One click settled a real round: `Round complete — no win this round`, a symbol grid, Credits `999`, Total win `0.00 (0.00x)`, paylines/paytable, `No wins on this step`, and `Inspect round artifact`. | Spin another round, inspect the artifact, use a scenario search, or reset the session. The no-win outcome is a normal rendered game result, not an error. |
| Simulation → configure | The four visible stages were Configure, Run, Review, Export. Initial empty state: `No completed simulations yet`; Review and Export were disabled. The rendered Rounds field was changed from `10000` to `25`. | `Run Simulation`; advanced seed/workers details and `Refresh` were also visible. |
| Simulation → `Run Simulation` | The request was accepted and rendered `queued — 0/25 rounds — elapsed 0.0s`, with `Cancel`; no product error was rendered before navigation continued. | `Cancel` is the rendered pending-operation recovery; remaining stages become relevant after completion. This record deliberately does not claim completion from the queued state. |
| Replay entrypoint | Reached `Recreate from seed`, `Replay Artifact`, `Session Spin`, and `Recent Simulation` choices. Initial empty state was `No replays run yet`; `Load` was enabled and `Download JSON` disabled. | Set target round/optional seed, choose another source, then `Load`. |
| Replay → `Load` | `Loaded replay` rendered for `Recreated -- recreate from seed`: reproducible `AVAILABLE`, but Inspectable, Comparable, and Exportable `UNAVAILABLE`; `Not yet run -- reproduce this round to generate a result`; `Download JSON` stayed disabled. | `Run again` is the visible next action to produce the replayed round; only then can inspection/export become available. |

The terms `Load`/`Loaded replay` followed by the explicitly not-yet-run replay
state are a staged configuration transition, not a second duplicate capability
or a contradictory product result. No other visible duplicate or contradictory
capability was found; nothing was remediated.
