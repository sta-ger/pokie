# P6-02 browser runtime-isolation rerun

Candidate `e8c30f629980dad1e122802f147205458da153ae` was rebuilt with Node
24.18.0 and launched through the public `pokie studio <Project A> --no-open`
workflow. A fresh 1440×1000 Chrome profile drove only the rendered Studio UI
with normal mouse/keyboard input; the driver made no Studio product API calls
or DOM/state writes.

Result: **finding**. The legacy Project A Play entry became its scoped Play
route, a visible A session played a round, and a visible Project B session was
created through Detect, Register, Open, and Play. Browser Back then restored
the scoped Project A Play page with no B identity or round displayed. Browser
Forward failed: eight visible `Alt+Right` attempts remained at `#/home/design`
instead of restoring Project B's scoped Play route. The final screenshot and
text confirm that the failure page exposed no cross-project session, mode, run,
or error state.

Current evidence is limited to the build and runtime logs, the visible-browser
action transcript, and captures `00`–`05`. `04-*` is the successful Back
destination; `05-*` is the actual failed Forward destination.
