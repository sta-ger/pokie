# P6-02 current browser runtime-isolation rerun

Candidate `f1e31cfed934300889d7714884229302adc54503` was rebuilt with Node
24.18.0 and launched as a new local Studio process. A fresh Chrome 138 profile
at a 1440×1000 desktop viewport started at the required legacy
`#/project/play` URL. The host driver observed rendered text and controls,
sent only ordinary mouse/keyboard inputs, and made no Studio product API calls
or DOM/state changes.

Result: **finding**. The legacy entry became scoped Project A Play; A was
played, B was imported/opened via the visible Home workflow and given its own
session, and browser Back restored scoped A without Project B state. Browser
Forward then landed at `#/home/design` and remained there through seven
additional Alt+Right inputs, never restoring scoped Project B Play.

`06-browser-action-transcript.txt` is the concise browser transcript and
`03-current-browser-driver-terminal.log` its terminal log. Screenshot/text/URL
triples `00`–`05` capture the required initial, A, B, Back, and rendered
Forward-failure states. `00-current-candidate-build.log`,
`01-current-fresh-studio-server.log`, `02-current-cdp-version.json`, and
`06-final-runtime-shutdown-check.txt` record the rebuilt runtime and cleanup.
The small `fixtures/` packages are the projects used by the visible workflow.
