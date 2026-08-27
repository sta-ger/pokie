# PC-03 — blind Studio workflow attempt

Candidate: `a84c906d60d220cbf93a0a9e80646dc06acd6e11`.

## Boundary

On 2026-08-27, this verifier built the candidate once, then made the two
permitted fresh-profile Studio launches from this checkout with exactly
`node ./dist/cli/pokie.js --no-open`. Each Chromium profile and Studio runtime
directory was newly isolated and removed after the session. The exploration
used rendered Studio controls and the public Docs index only; it did not
inspect source, call private APIs, inject application state, or alter product
code or tests.

`fresh-start.png` is the sole retained screenshot (SHA-256
`1b2fdea9d3852957c65915af722a85c4f0f2528c2d6db683727d3b5c65ed7b3d`).

## Rendered ledger

| Entry point / action | Rendered result | Natural recovery or next action |
| --- | --- | --- |
| Fresh Studio start | `Start a game` → `Design Your Game`; the form showed editable Game id (`starter-slot`), Game name (`Starter Slot`), Version (`0.1.0`), optional Description/Author, Game basics/Layout/Symbols/Reels/Paytable/Bets tabs, `Create game`, `Choose a different start`, and advanced file/JSON controls. | Enter the required design values, or choose a different start. |
| Automatic validation | Initially `Studio is checking this game design automatically`; it then visibly settled to `Valid — no issues found`, with every listed design tab marked `valid`. | `Create game` became the visible next action. |
| Public documentation | The visible `Docs index` link opened the public `pokie/docs` README in Chromium. | Returning to Studio leaves the design form intact. |
| Project creation | On the first fresh session the expected `Use the starter game` control was not rendered, so no click was emitted. On the second fresh session the rendered `Create game` control was clicked once. The UI driver then stopped receiving a response before any success, error, loading, dialog, or navigation state could be rendered or observed. No native picker was visible. | A non-idempotent creation action was not retried. The Studio runtime and fresh profile were terminated and removed. |

## Unreached workspace surfaces

Edit was reached only as the rendered Design form and validation was reached
only through its automatic valid state above. Because the one project-creation
attempt yielded no later rendered state, the project-scoped Play, Simulation,
and Replay entrypoints, their forms/dialogs, and their success/error/empty/
stale/disabled/recovery states were not reached. No duplicate or contradictory
capability was observed; this is an absence of discovery, not a remediation.

This is a harness/driver inconclusive result rather than a product finding:
there is no rendered product error and no evidence that the `Create game`
request completed. Generated profiles, project/output trees, logs, browser
automation, and all non-representative screenshots were removed.
