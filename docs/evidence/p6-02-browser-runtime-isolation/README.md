# P6-02 browser runtime-isolation verification

Independent host-side browser rerun of candidate
`a53f3c2a39f0fec7d24bbf3a76e362a833c5afa4` on 2026-08-14.

Result: **passed**. The current Studio CLI/client was freshly built from the
candidate with `npm run build-cli` under Node `v24.18.0`, then served through the public
`pokie studio <Project A> --port 49611 --host 127.0.0.1 --no-open` workflow.
A fresh Chrome profile in `--headless=new` drove only rendered Studio controls
and ordinary browser mouse/keyboard input. The driver did not call Studio
product endpoints or assign DOM/application state.

The visible Studio workflow opened Project A from the legacy Play URL, which
was replaced with its project-scoped Play route; it created and spun an A
session. It then detected, registered, opened, and created a distinct Project
B session through the visible Projects UI. Native browser Back traversed to
the scoped A Play route. Native browser Forward traversed the same history
stack and restored the scoped B Play route.

The Back capture renders only **Playable Game** with a **New session** control;
the Forward capture renders only **Playable Game With Bonus Round** with a
**New session** control. Neither final capture contains a prior round, active
Spin/session controls, mode/run state, or error state, so no cross-project
state is rendered or actionable.

Essential artifacts:

- `00-candidate-identity.txt` and `00-candidate-runtime-build.log` identify
  and freshly build the candidate.
- `01-project-a-legacy-entry-upgraded-and-played.*`,
  `02-project-b-fresh-play.*`, and `03-project-b-session.*` show two distinct
  visible sessions and B's clean initial Play state.
- `04-browser-back-restores-project-a-scoped.*` and
  `05-browser-forward-restores-project-b-scoped.*` are the final rendered
  Back and Forward destinations.
- `05-browser-driver-terminal.log` and `06-browser-action-transcript.txt`
  provide the complete public-UI browser transcript. `02-fresh-studio-server.log`,
  `03-fresh-chrome-terminal.log`, `04-cdp-version.json`, and
  `07-runtime-terminal-evidence.log` establish the local runtime.
