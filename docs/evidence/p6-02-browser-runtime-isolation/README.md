# P6-02 browser runtime-isolation verification

Candidate `1088da403649b1da3e05da8726944bac259fc75c` was freshly built with
Node `v24.18.0` (`00-current-candidate-build.log`) and launched with the
public `pokie studio <Project A> --port 49102 --no-open` command. A new Chrome
profile drove rendered Studio controls and native `Alt+Left`/`Alt+Right`
history keys; it made no Studio product API requests and did not write DOM or
application state.

Result: **finding P1** (`p6-02-browser-runtime-isolation`). Project A was
played through the legacy Play route. Project B was detected, registered,
opened, and given a distinct session. Browser Back restored Project A's scoped
Play URL, with neither Project B identity nor A's prior round rendered.
Browser Forward failed: its first `Alt+Right` reached `#/home/design`, and
seven further native Forward attempts remained there rather than restoring
Project B's scoped Play route.

`04-*` captures the successful isolated Back destination. `05-*` captures the
actual failed Forward destination. The logs and `06-browser-action-transcript.txt`
provide the public-workflow terminal and browser transcript; all UI/browser
writers were stopped before this evidence was committed.
