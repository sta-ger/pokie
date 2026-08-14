# P6-02 browser runtime-isolation verification

Independent host-side browser rerun of candidate
`d76afedb7df869632f0af09a0c6aaed1dd730b4c` on 2026-08-14.

Result: **finding P1** (`p6-02-browser-runtime-isolation`). The current
candidate was freshly rebuilt with Node `v24.18.0` and served through the
public `pokie studio <Project A> --port 49610 --host 127.0.0.1 --no-open`
workflow. A fresh Chrome profile used only rendered Studio controls and
ordinary browser mouse/keyboard input; the driver did not call any Studio
product endpoint or assign DOM/application state. The host has no display, so
Chrome used `--headless=new`; its rendered Studio screenshots are included.

The visible workflow successfully:

1. opened Project A from the legacy Play URL, which was replaced with the
   project-scoped A Play route, then created a session and spun a round;
2. detected, registered, and opened Project B through Studio's visible
   Projects UI, then created a distinct B session; and
3. used native `Alt+Left` until Back restored the project-scoped A Play route.
   The Back screenshot shows Project A and its New session control, with no
   Project B identity or prior round rendered.

Native `Alt+Right` then failed the required Forward step. Its first keypress
navigated to `#/home/design`; all seven further attempts remained there, and
none restored Project B's scoped Play URL. The final rendered screenshot is
the Design Game page, not Project B Play. Therefore the Forward acceptance
criterion, and hence the complete A -> B -> Back/Forward isolation workflow,
is not met. This is not an external-prerequisite failure.

Essential artifacts:

- `00-candidate-identity.txt` and `00-candidate-runtime-build.log` identify
  and freshly build the candidate.
- `01-project-a-legacy-entry-upgraded-and-played.*` and
  `03-project-b-session.*` show the two distinct real sessions; the `02-*`
  Project B capture shows its fresh Play state has no Project A round.
- `04-browser-back-restores-project-a-scoped.*` records the successful,
  isolated Back destination.
- `05-browser-forward-restores-project-b-scoped.*` records the failed visible
  Forward destination.
- `05-browser-driver-terminal.log` and `06-browser-action-transcript.txt`
  provide the complete public-UI browser transcript. `02-fresh-studio-server.log`,
  `03-fresh-chrome-terminal.log`, `04-cdp-version.json`, and
  `07-runtime-terminal-evidence.log` establish the local runtime.
