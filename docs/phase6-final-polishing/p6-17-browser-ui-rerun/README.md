# P6-17 independent browser UI finding

Candidate: `179949452264e90bd716f8adcba279a9c948ca81`
Finding: `p6-17-independent-design-ux-audit` (P2)

A fresh production Studio build from this candidate, isolated Studio registry,
and fresh Chrome profile ran the visible Projects workflow against
`tests/cli/fixtures/playable-game`. Browser automation only located rendered
controls, clicked their displayed coordinates, typed through Chrome's input
channel, and captured the rendered page; it did not call Studio APIs or modify
DOM/application state.

1. Opened **Projects**; the empty-location **Detect** control was correctly
   disabled.
2. Entered the valid absolute package location and clicked the rendered,
   enabled **Detect** control.
3. After 60 seconds, the UI remained on the same Import Project form: it
   showed the resolved path but no detection result, loading state, or error.

Consequently the required Detect → Register → Open workflow cannot reach
Register or Open, so the dashboard portion of the UX review was not run.
The visible dead end is a P2 workflow failure. No product code or tests were
modified.

Representative rendered proof: `02-detect-no-result.png` (SHA-256
`1bab7032d16a1a2d40c5d3184555f3b6f86ae9b381e99981665cf3e8bcea4378`).
