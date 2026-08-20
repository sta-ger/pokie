# P6-20 independent workflow UX audit

Candidate: `39eb11668e9b190203474fa018f9db108e0f493f`  
Audit date: 2026-08-20  
Profile: new temporary Chrome profile; no source, documentation, prior audit evidence, or prepared happy-path script was consulted.

## Launch and natural recovery attempt

Question as a first-time user: “Where do I begin?”

1. Started the candidate public Studio CLI exactly once from this checkout with `node ./dist/cli/pokie.js --no-open`. It announced `http://127.0.0.1:3200`.
2. Opened that announced address in a new browser profile. Destination: the only rendered content was the product response `{"error":"Not found: /"}`. No Studio chrome, project action, navigation, affordance, explanatory recovery, or accessibility-visible control appeared. [Launch screenshot](01-launch-root-error.png)
3. Natural recovery: used the browser Reload control. Destination: the same rendered product error. [Reload screenshot](02-browser-reload-error.png)
4. Natural recovery: used browser Back (Alt+Left), looking for an initial/start screen. Destination: unchanged rendered `Not found: /`; there was no earlier Studio destination. [Back screenshot](03-browser-back-error.png)
5. Natural recovery: used browser Forward (Alt+Right). Destination: unchanged rendered `Not found: /`. [Forward screenshot](04-browser-forward-error.png)

This is a rendered product error, not a readiness threshold. The public entry point provided by the mandated CLI is a dead end, so project creation, editing, save/reopen, Play, Simulation, Replay, Build, Outcome, Stake, tabs/steppers, destructive recovery, defaults, path interactions, keyboard behavior within Studio, and persistence were not reachable. No second Studio launch was used.

## Screenshot checksums

All four are small (9.7 KiB) independent captures of the rendered failure after the stated action.

| File | SHA-256 |
| --- | --- |
| `01-launch-root-error.png` | `4ec42a691a6c9cea6ec964a0c09bc04257ba445b23039db24b161dfef293870e` |
| `02-browser-reload-error.png` | `4ec42a691a6c9cea6ec964a0c09bc04257ba445b23039db24b161dfef293870e` |
| `03-browser-back-error.png` | `4ec42a691a6c9cea6ec964a0c09bc04257ba445b23039db24b161dfef293870e` |
| `04-browser-forward-error.png` | `4ec42a691a6c9cea6ec964a0c09bc04257ba445b23039db24b161dfef293870e` |

## Finding

`p6-20-final-workflow-ux-closure`: P1 — the required public Studio invocation starts successfully but its announced root URL serves `Not found: /`, preventing all first-time-user Studio workflows.
