# P6-02 browser runtime-isolation rerun

Candidate `fe3c13cda55ee76d42d5b6dae66bb2ffe705b2b1` was compiled with Node
`v24.18.0` using `npm run build-cli`, then launched through the public
`pokie studio <Project A> --no-open` workflow. A fresh 1440x1000 Chrome
browser rendered Studio, and the driver used only ordinary mouse/keyboard
input against visible controls plus browser Back/Forward. It made no Studio
product API calls and performed no DOM or application-state writes.

Result: **finding (P1)**. Project A's legacy Play entry visibly upgraded to
its project-scoped Play URL; an A session visibly spun a round. Project B was
then visibly detected, registered, opened, and given a new B-only session.
Browser Back reached the expected scoped Project A Play URL with neither
Project B's identity nor the A round rendered. Browser Forward failed: its
first rendered `Alt+Right` landed on `#/home/design`, and seven further
visible Forward attempts remained there rather than reaching Project B's
project-scoped Play URL. Thus the persisted A -> B -> Back/Forward acceptance
workflow is not complete.

The evidence is intentionally limited to the current build/server/browser
logs, the browser action transcript, and the Back/Forward destination captures.
`04-*` proves the successful isolated Back destination; `05-*` records the
actual failed Forward destination.
