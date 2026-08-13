# P6-02 browser runtime-isolation rerun

Candidate `5b627371c807f8df4223c29f2ea502b9f35fea94` was rebuilt with Node
24.18.0 using `build-client` and `build-studio-client`, then launched through
the public `pokie studio <Project A> --no-open` workflow. A fresh 1440×1000
Chrome profile drove the visible Studio UI with normal mouse/keyboard input
only; it made no Studio product API calls or DOM/state writes.

Result: **finding**. Project A opened from the legacy Play URL, was upgraded
to its project-scoped route, and played one visible round. Project B was then
detected, registered, opened, and given its own visible session through the
Studio UI. Browser Back stepped through Project B Overview, Home/Projects,
and Home/Design, but further Back attempts stayed at `#/home/design`; it
never restored Project A's project-scoped Play route. The failure is captured
in the current `04-*` screenshot, rendered text, and URL, with all eight
attempts in `03-current-browser-driver-terminal.log` and
`06-browser-action-transcript.txt`.

The retained artifacts are limited to the current source-built rerun: UI
triples `00`–`04`, the action transcript, build/runtime metadata, port
preflight, and shutdown check. No Forward artifact is retained because the
required Back destination was never reached.
