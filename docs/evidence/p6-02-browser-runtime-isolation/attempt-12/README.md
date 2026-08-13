# Attempt 12 — independent host browser rerun

Status: **finding** (`p6-02-browser-runtime-isolation`).

This attempt rebuilt the candidate with Node 24.18.0, started a fresh local
Studio on port 41222 with the two-mode Project A outcome-library fixture, and
launched a fresh headless Chrome profile on port 9236. The recorded driver used
only rendered-control inspection, coordinate mouse clicks, and keyboard input;
it made no Studio API requests and did not mutate DOM or application state.

The rendered A surface visibly selected `buyFeature`, used
`p6-a-visible-session`, and displayed a played round. Opening B through the
visible Projects UI presented B's fresh Play state, with no outcome-mode
picker, no A seed, and no A round. That proves the project-switch clearing
criterion and prevents an A session from being available for action in B's
fresh UI.

However, four visible `Alt+Left` history actions returned to the historical
`#/project/play` URL captured while A was active, while the rendered page was
Project B with B's session state. Browser Forward continued to render B. Thus
the route is preserved but the A-scoped runtime context is not; the required
Back/Forward behavior fails.

`03-browser-driver.log` and `09-browser-action-transcript.txt` are the browser
transcript. `05-*`, `06-*`, `08-*`, and `09-browser-forward-*` contain the
screenshots, visible text, and URLs. `01-*`, `02-*`, `04-*`, and `05-shutdown.log`
record startup, running processes, and clean shutdown.
