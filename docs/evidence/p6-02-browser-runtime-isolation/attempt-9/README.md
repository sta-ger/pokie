# Attempt 9 — clean Node 24 browser UI rerun

Status: **finding** (`p6-02-browser-runtime-isolation`).

This independent rerun rebuilt the candidate using Node 24.18.0, then started
the candidate's local Studio server on port 41219 with the real two-mode
outcome-library fixture as Project A. It launched a fresh Chrome profile on
port 9233 and drove only rendered Studio controls with pointer/keyboard input.
No Studio API was called, and the driver did not mutate the DOM or application
state.

The browser selected A's non-default `buyFeature` outcome-library mode,
created a session, and spun a round. The A screenshot shows the selected mode,
seed, `Credits -1`, and `Round detail`. Through the rendered Projects UI, it
then detected, registered, and opened Project B. B's fresh Play screenshot has
neither A's outcome-mode control nor its played-round details.

Four visible `Alt+Left` browser Back actions returned to the exact same
`#/project/play` URL originally captured for A. But the rendered page is
Project B and contains B's fresh session UI. Browser Forward continues to
render B. Therefore browser history preserves only the tab route, not
project-scoped runtime context; the required Back/Forward A-scoped state
isolation does not hold.

`01-build-cli.log` proves the Node 24 build. `02-*` and `03-*` are Studio and
Chrome startup evidence. `04-browser-driver.log` and
`09-browser-action-transcript.txt` provide the visible-UI transcript.
`05-*`, `06-*`, `08-*`, and `09-browser-forward-*` are screenshots, rendered
text, and URL captures. `11-shutdown.log` confirms both local writers exited
before evidence commit.
