# P6-02 current browser runtime-isolation rerun

Candidate `212aab942fa592d5b9959851fd85d09493c3b79b` was rebuilt with Node
24.18.0 and launched with the public `pokie studio <Project A> --no-open`
workflow. A fresh Chrome 138 profile at a 1440×1000 viewport opened the legacy
`#/project/play` URL. The host driver only observed rendered UI and sent normal
mouse/keyboard input; it made no Studio product API calls or DOM/state writes.

Result: **finding**. Project A played a round; Project B was imported and
opened through the visible Home/Projects journey and started with its own
session; Back restored project-scoped A with no B identity or A round state in
the UI. Every one of eight visible browser Forward attempts then stayed at
`#/home/design`, so Project B Play was never restored. The final Forward state
is captured before the assertion timeout in `05-*`.

`06-browser-action-transcript.txt` and
`03-current-browser-driver-terminal.log` record the interaction. Screenshot,
visible-text, and URL triples `00`–`05` record the key UI states. The build,
Studio, Chrome/CDP, and port-preflight logs show the fresh local runtime; the
shell cleanup was verified to leave no listeners on ports 43108 or 9223.
