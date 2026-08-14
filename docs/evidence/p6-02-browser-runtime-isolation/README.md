# P6-02 browser runtime-isolation verification

Fresh host-side browser rerun of candidate
`da377c2e49baf07a528bb9d4e70ec65e3158c152`, built under Node `v24.18.0`
(`00-current-candidate-build.log`) and served through the public command
`pokie studio <Project A> --port 49202 --host 127.0.0.1 --no-open`.

Chrome used a new profile. The audit interacted only through rendered Studio
controls and native `Alt+Left`/`Alt+Right` history keys. It made no Studio API
calls and did not assign application state or DOM.

Result: **finding P1** (`p6-02-browser-runtime-isolation`). The legacy
unscoped A Play entry upgraded to its scoped route; a real A session was spun;
Project B was detected, registered, opened, and given a distinct real session.
Back then restored scoped Project A with no B identity or prior A round
rendered. Forward did not restore scoped Project B: it reached `#/home/design`
on the first keypress and remained there for seven further native Forward
keypresses.

`04-*` is the successful isolated Back capture. `05-*` is the actual failed
Forward destination. `03-current-browser-driver-terminal.log` and
`06-browser-action-transcript.txt` give the browser transcript; the build and
fresh Studio logs establish the candidate/runtime. All writers were stopped
before committing this evidence.
