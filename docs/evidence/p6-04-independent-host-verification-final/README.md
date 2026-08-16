# P6-04 independent host-side verification finding

Candidate `152af9be3dc1544abfef5ce7795a7f4bba682899` was rebuilt with Node
`v24.18.0` and exercised through a fresh local Studio and fresh Chrome profile.
The recorder located rendered controls, drove browser mouse/keyboard input, and
captured screenshots and browser transcripts without changing DOM or client
state.

Recommended and seeded Random creation both passed their initial visible flow:
manual names persisted with deterministic ids, each game opened immediately,
and Play (`New session`, `Spin`) plus a 25-round Simulation completed. The
projects were registered and visible after a Studio/client restart.

The persisted Random project could not be reopened after that restart. The
fresh Projects page visibly listed `P6 Random Owner`; its rendered `Open`
control was clicked, but no Workspace appeared during the recorder's 120-second
wait. `06-browser-reopen-terminal.log` contains the action and timeout, and
`11-projects-after-restart.png` shows the registered projects immediately
before the action. `07-filesystem-artifacts-terminal.log` records both saved
blueprints and the durable registry.
