# P6-02 browser runtime-isolation verification

Independent fresh host-browser rerun of candidate
`6c3244eab70b70eb76abf6f22c00eb33bdfe3012` on 2026-08-14. The candidate's
CLI and Studio client were rebuilt under Node `v24.18.0`, then launched through
the public `pokie studio <Project A> --port 49326 --host 127.0.0.1 --no-open`
command. A new Chrome profile interacted only with rendered Studio controls
and native `Alt+Left`/`Alt+Right` browser-history keyboard input; the driver
made no product endpoint calls or DOM/application-state assignments. The host
has no X display, so Chrome used `--headless=new` while retaining the rendered
UI screenshots and native browser input workflow.

Result: **finding P1** (`p6-02-browser-runtime-isolation`). Project A was
opened through the legacy Play entry, given a real session and Spin. Project B
was detected, registered, opened, and given a distinct real session. Native
Back reached the scoped Project A Play route, with neither Project B identity
nor Project A's earlier round rendered. Native Forward instead reached
`#/home/design` on its first keypress and stayed there for all seven remaining
keypresses; it never restored the scoped Project B Play route. Therefore the
Forward acceptance criterion is not met.

Essential artifacts:

- `00-candidate-identity.txt` and `00-candidate-runtime-build.log` establish
  the exact candidate and fresh local build.
- `02-fresh-studio-server.log`, `03-fresh-chrome-terminal.log`, and
  `04-cdp-version.json` establish the fresh runtime.
- `04-browser-back-restores-project-a-scoped.*` captures the successful
  isolated Back destination; `05-browser-forward-restores-project-b-scoped.*`
  captures the failing rendered Forward destination.
- `06-browser-action-transcript.txt` is the complete rendered-browser action
  transcript; `05-browser-driver-terminal.log` records the fresh driver
  command and its finding exit status.
