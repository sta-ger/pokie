# P6-02 browser runtime-isolation rerun

Candidate `326b32dc153e096bd4df3d3f494731cf495edf9f` was built with local
Node `v24.18.0` (`00-current-candidate-build.log`) and launched with the
public `pokie studio <Project A> --no-open` command.  A fresh 1440x1000
Chrome profile drove only visible Studio controls and native browser
Back/Forward keyboard shortcuts.  The driver made no Studio product API calls
and did not write browser DOM or application state.

Result: **finding (P1)**.  The legacy Project A Play entry upgraded to the
project-scoped A URL, a visible A session spun a round, and Project B was
detected, registered, opened, and given a separate visible session.  Browser
Back then reached the project-scoped Project A Play URL with Project B's
identity and the prior A round absent.  Browser Forward did not restore Project
B: its first visible `Alt+Right` reached `#/home/design`, and seven further
visible Forward attempts remained there.  `05-*` is the actual final browser
destination, not a reused capture.

The evidence is limited to the fresh build/server/Chrome logs, the browser
action transcript, and captures of the visible A, B, Back, and Forward states.
`04-*` records the isolated successful Back destination; `05-*` records the
Forward failure that prevents completion of the required workflow.
