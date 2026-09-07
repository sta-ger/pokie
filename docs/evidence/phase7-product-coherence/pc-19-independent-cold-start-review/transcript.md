# Rendered public-workflow transcript — recovery launches

Each launch used a newly created Studio and Chromium profile and the candidate
source launcher `node ./dist/cli/pokie.js --no-open`. The following one-click
actions had rendered action-local results:

| Ready control | Activation | Rendered local result |
| --- | --- | --- |
| Create game | one click | `Your game was saved` and workspace |
| New Play session | one click | enabled `Spin`, 1,000 credits |
| Spin | one click | completed round (one loss; one 10.00 win) |
| Run Simulation | one click | completed 10,000/10,000-round report with RTP and report controls |
| Session Spin native radio | one click | rendered `Session 1 — Round 1 — Spin` selection, then the selected round’s local inspector |
| Generate exact outcome library (base) | one click per fresh project | `Generated 1,024 outcomes for mode "base" using exact (RTP 100.78%)` |
| Build/Export cards | one focused native-picker selection and one Build click each | TypeScript package, Outcome library, Stake Engine export, and PAR sheet rendered their local ready/completed states |

The asynchronous Simulation and Outcome Library actions each displayed their
completed local result. No page-wide or prior error was used as a terminal state.
The archive CLI also completed Blueprint/Outcome Library/TypeScript/Stake/PAR
round-trips, simulation/replay, and fairness proof verification in an isolated
consumer directory. Desktop/narrow player parity and cancellation/retry
lifecycle coverage remain deliberately unclaimed rather than treated as product
failures.
