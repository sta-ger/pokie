# P6-02 browser runtime-isolation verification

Independent fresh host-browser rerun of candidate
`b5905c96977ae3aa555393a51d4790099ca97f7d` on 2026-08-14. The candidate's
CLI and Studio client were rebuilt under Node `v24.18.0`, then launched through
the public `pokie studio <Project A> --port 49326 --host 127.0.0.1 --no-open`
command. A new Chrome profile interacted only with rendered Studio controls
and native `Alt+Left`/`Alt+Right` browser-history input; the driver made no
product endpoint calls or DOM/application-state assignments.

Result: **finding P1** (`p6-02-browser-runtime-isolation`). Project A was
opened through the legacy Play entry, given a real session and Spin. Project B
was detected, registered, opened, and given a distinct real session. Native
Back reached scoped Project A Play, with neither Project B identity nor the
earlier Project A round rendered. Native Forward reached `#/home/design` on
the first keypress and remained there for all seven remaining keypresses; it
never restored scoped Project B Play.

Essential artifacts:

- `00-candidate-identity.txt` and `00-candidate-runtime-build.log` establish
  the exact candidate and fresh local build.
- `02-fresh-studio-server.log`, `03-fresh-chrome-terminal.log`, and
  `04-cdp-version.json` establish the fresh runtime.
- `04-browser-back-restores-project-a-scoped.*` and
  `05-browser-forward-restores-project-b-scoped.*` capture the actual Back
  and Forward destinations.
- `06-browser-action-transcript.txt` is the complete rendered-browser action
  transcript; `05-browser-driver-terminal.log` records the fresh driver
  command and its finding exit status.
