# P6-02 browser runtime-isolation verification

Independent fresh host-browser rerun of candidate
`9770b8ac3e310cdc7d3607816655a8d5ecc876fa` on 2026-08-14.  The candidate
was built successfully under Node `v24.18.0` and started through its public
`pokie studio <Project A> --port 49203 --host 127.0.0.1 --no-open` command.
A new Chrome profile then interacted only through the rendered Studio controls
and native `Alt+Left`/`Alt+Right` browser history keys.  The driver did not
call product endpoints or assign DOM/application state.

Result: **finding P1** (`p6-02-browser-runtime-isolation`).  Project A was
opened from the legacy Play entry, given a real session and Spin; Project B
was detected, registered, opened, and given a distinct real session.  Native
Back correctly reached scoped Project A Play with neither Project B identity
nor the earlier A round rendered.  Native Forward then reached `#/home/design`
on its first keypress and remained there for seven more keypresses; it never
restored scoped Project B Play.

Essential artifacts:

- `00-candidate-identity.txt` and `00-candidate-runtime-build.log` establish
  the exact candidate and successful local build.
- `02-fresh-studio-server.log`, `03-fresh-chrome-terminal.log`, and
  `04-cdp-version.json` establish the fresh public Studio and Chrome runtime.
- `04-browser-back-restores-project-a-scoped.*` is the successful Back
  capture; `05-browser-forward-restores-project-b-scoped.*` is the actual
  rendered Forward destination.
- `06-browser-action-transcript.txt` and `05-browser-driver-terminal.log`
  record every visible-browser action and observation.
