# P6-02 browser runtime-isolation rerun

Candidate `00a2e20de6bd746c93923d6e761c593483012d95` was rebuilt with Node
24.18.0 and launched through the public `pokie studio <Project A> --no-open`
workflow. A fresh 1440×1000 Chrome profile drove only rendered Studio controls
with normal mouse/keyboard input; the driver made no Studio product API calls
or DOM/state writes.

Result: **finding**. The legacy Project A Play entry was upgraded to its scoped
Play route, a visible A session played a round, and a visible Project B session
was created through Detect, Register, Open, and Play. Browser Back restored the
scoped Project A Play page with no B identity or round displayed. Browser
Forward then failed: eight visible `Alt+Right` attempts remained at
`#/home/design` instead of restoring Project B's scoped Play route. The final
Forward screenshot and text show the unrelated Home/Design page, with no
cross-project session, mode, run, or error state rendered or actionable.

This current-run evidence is intentionally bounded: build/server/Chrome/driver
logs, the visible-browser transcript, and only the Back and Forward destination
captures (`04-*` and `05-*`). `04-*` is the successful Back destination;
`05-*` is the failed Forward destination.
