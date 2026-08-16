# P6-04 host-side browser verification finding

Candidate `152af9be3dc1544abfef5ce7795a7f4bba682899` was rebuilt with Node
`v24.18.0`, then served as a fresh local Studio on `127.0.0.1:46146` with a
fresh Chrome profile. The browser recorder found rendered controls, clicked
their screen coordinates, and used browser keyboard input only; it never
changed DOM or application state.

The Recommended path does not meet the required manual Name ownership
criterion. The recorder entered `P6 Recommended Owner` through the visible
**Game name** field and clicked visible **Create Project**. The captured
Design Game screen shows that text in **Description (optional)** while **Game
name** remains `Starter Slot`; the resulting Workspace and filesystem agree:
the saved manifest and registered project are `Starter Slot` / `starter-slot`.

- `02-recommended-owned-identity.png` is the visible pre-save Design Game
  screen.
- `04-recommended-persisted-identity.png` is the Workspace opened by the
  visible Create Project action.
- `03-browser-workflow-terminal.log` and
  `failure-capture-browser-transcript.txt` are the browser action transcript.
- `05-filesystem-evidence-terminal.log`, `managed-projects/`, and
  `studio-config/pokie/projects.json` are the saved artifact and registry
  evidence.

Because the primary Recommended creation flow persists the wrong identity,
the Random/Play/Simulation/restart remainder was not treated as an acceptance
pass.
