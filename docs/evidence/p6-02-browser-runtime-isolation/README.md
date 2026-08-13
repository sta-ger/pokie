# P6-02 browser runtime-isolation rerun

Candidate `e166b86075a0192ceb586510b289bbe695f21163` was compiled with Node
`v24.18.0` using `npm run build-cli`, then launched through the public
`pokie studio <Project A> --no-open` workflow. A fresh 1440×1000 Chrome profile
drove only rendered Studio controls with ordinary mouse and keyboard input. The
driver made no Studio product API calls and performed no DOM or application-state
writes.

Result: **finding**. The legacy Project A Play entry was upgraded to its
project-scoped Play route; an A session visibly spun a round; and Project B was
visibly detected, registered, opened, and given its own session. Browser Back
restored scoped Project A with neither Project B identity nor a round rendered.
Browser Forward then failed: after the first visible `Alt+Right` reached
`#/home/design`, seven further visible `Alt+Right` attempts remained there
instead of restoring Project B's project-scoped Play route. The final Forward
capture is the Home/Design error surface, not Project B Play.

The evidence is bounded to the current build/server/Chrome/driver logs, browser
transcript, port preflight, and the two Back/Forward destination captures.
`04-*` records the successful isolated Back destination; `05-*` records the
failed Forward destination.
