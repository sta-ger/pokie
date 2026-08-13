# P6-02 browser runtime-isolation rerun

Candidate `03a0f6394d197e36d1f0a7b9dabf76ce671ba5b8` was rebuilt with Node
24.18.0 and launched with the public `pokie studio <Project A> --no-open`
workflow. A fresh Chrome profile at a 1440×1000 viewport opened the legacy
`#/project/play` URL. The host driver observed rendered UI and sent normal
mouse/keyboard input only; it made no Studio product API calls or DOM/state
writes.

Result: **finding**. Project A played a round; Project B was imported and
opened through the visible Home/Projects journey and started with its own
session. Browser Back restored scoped Project A with no Project B identity or
round state rendered. Each of eight browser Forward attempts remained at
`#/home/design`; Project B Play was never restored. The final rendered Forward
state appears in `05-*` before the timeout.

`06-browser-action-transcript.txt` and
`03-current-browser-driver-terminal.log` record the interaction. Screenshot,
visible-text, and URL triples `00`–`05` are the captured UI states. The build,
Studio, Chrome/CDP, port-preflight, and shutdown logs document the fresh local
runtime and cleanup.
