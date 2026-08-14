# P6-02 browser runtime-isolation verification

Independent host-side browser rerun of candidate
`6ccdda5615d61fee6d69bc565fe6f9daf92cf25b` on 2026-08-14.

Result: **finding P1** (`p6-02-browser-runtime-isolation`). The Studio client
was freshly built and launched locally for Project A. A fresh Chrome profile
then used only rendered Studio controls and ordinary browser keyboard/mouse
input: it created and spun a Project A session, used visible navigation to
detect/register/open Project B, and created a distinct Project B session.

The first native `Alt+Left` shortcut, followed by seven further attempts, did
not traverse browser history. Every observation remained at the project-scoped
Project B Play URL, with the Project B session controls still rendered and
actionable. Thus Back did not restore Project A, so the required A -> B ->
Back -> Forward workflow cannot meet its Forward or end-to-end isolation
criteria. This is not an external prerequisite failure.

The candidate changes the audit driver's browser shortcut from `rawKeyDown` to
`keyDown`; in this real headless Chrome run those `keyDown` events did not
invoke Chrome's history command. The complete rendered-browser transcript and
the visible failed Back destination are retained below.

Essential artifacts:

- `00-candidate-identity.txt` and `00-candidate-runtime-build.log` establish
  the exact candidate and fresh Studio/client build.
- `03-fresh-chrome-terminal.log`, `04-cdp-version.json`, and
  `07-runtime-terminal-evidence.log` establish the fresh browser and local
  Studio runtime.
- `01-project-a-legacy-entry-upgraded-and-played.*` captures the real Project
  A session and round; `03-project-b-session.*` captures the distinct Project
  B session.
- `04-browser-back-restores-project-a-scoped.*` captures the actual failed
  Back destination, which still visibly renders Project B.
- `05-browser-driver-terminal.log` and `06-browser-action-transcript.txt`
  contain the complete public-UI interaction transcript.
