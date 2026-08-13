# P6-02 current browser runtime-isolation rerun

Candidate `c7dd75c93652acf9a902da4427ee792aca01d1ae` was built with Node
24.18.0 and launched as a new local Studio process. A fresh Chrome 138 profile
started at the required legacy `#/project/play` URL. The host driver observed
rendered controls and text, sent ordinary mouse/keyboard input only, and never
called a Studio product endpoint or changed page DOM/state.

Result: **finding**. The legacy entry immediately became the scoped Project A
Play route; A was played, B was opened through Home and given its own session,
and browser Back restored scoped A without B state. Browser Forward then moved
only to `#/home/design` and remained there through seven further Alt+Right
keystrokes, rather than restoring scoped Project B Play.

The concise browser action/result record is
`06-browser-action-transcript.txt`; the matching terminal log is
`03-current-browser-driver-terminal.log`. The four numbered screenshot groups
record played A, fresh/session B, Back-restored A, and the rendered Forward
failure. `00-legacy-*` records the required starting route, `00-current-*` and
`01-current-*` record the exact rebuilt runtime, and
`06-final-runtime-shutdown-check.txt` records cleanup. The small `fixtures/`
packages are the actual A/B projects used by the visible workflow.
