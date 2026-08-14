# P6-02 browser runtime-isolation verification

Candidate `453a3804f73f66853c5472e32a183e41f5b5e9c8` was freshly built with
Node `v24.18.0` (`00-current-candidate-build.log`) and launched through the
public `pokie studio <Project A> --no-open` command. A new Chrome profile then
drove only rendered Studio controls and native browser `Alt+Left`/`Alt+Right`
history shortcuts. The driver made no product API requests and did not inject
DOM or application state.

Result: **finding P1** (`p6-02-browser-runtime-isolation`). Project A was
played through the legacy Play entry; Project B was detected, registered,
opened, and given a separate visible session. Browser Back restored the
project-scoped Project A Play URL with no Project B identity or prior round.
Browser Forward did not restore Project B: the first `Alt+Right` reached
`#/home/design`, and seven additional native Forward attempts remained there.

Essential artifacts are the fresh build/server/browser logs, the action
transcript, and rendered captures of A, B, Back, and the failed Forward
destination. `04-*` proves the Back isolation behavior; `05-*` proves the
Forward acceptance failure on this candidate.
