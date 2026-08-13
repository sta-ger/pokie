# P6-02 browser runtime-isolation rerun

Candidate `3d20b75b23f7020374a6a0f42b92929c3194ec40` was compiled with Node
24.18.0 using `npm run build-cli` (the outer `npm run build` is currently
blocked by an unrelated ESLint failure in
`tests/cli/studio/StudioProjectRegistrationService.test.ts:902`). It was then
launched through the public `pokie studio <Project A> --no-open` workflow.
A fresh 1440×1000 Chrome profile drove only rendered Studio controls with
ordinary mouse and keyboard input. The driver made no Studio product API calls
and performed no DOM or application-state writes.

Result: **finding**. The legacy Project A Play entry was upgraded to its
project-scoped Play route; an A session visibly spun a round; and Project B was
visibly detected, registered, opened, and given its own session. Browser Back
restored scoped Project A with no Project B identity or round shown. Browser
Forward then failed: eight visible `Alt+Right` attempts stayed at
`#/home/design` instead of restoring Project B's scoped Play route. The final
Forward capture shows Home/Design, not a Project B Play surface.

The evidence is limited to current build/server/Chrome/driver logs, the
browser action transcript, and the two Back/Forward destination captures.
`04-*` records the successful Back destination; `05-*` records the failed
Forward destination.
