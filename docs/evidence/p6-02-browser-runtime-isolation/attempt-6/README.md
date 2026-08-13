# Attempt 6 — clean public-UI rerun

Status: **finding** (`p6-02-browser-runtime-isolation`).

This is a fresh local Studio/client run from the candidate worktree. It used a
fresh Chrome profile and an isolated `XDG_CONFIG_HOME` Studio registry. The
Studio command started the real two-mode outcome-library bundle already
preserved in `attempt-4/project-a-multimode` as Project A; this is necessary
because an outcome-library bundle is intentionally not an Open-able registry
row. Project B is the real `fixtures/project-b` package and was registered and
opened using the rendered Studio Projects UI.

`11-browser-driver-final.log` and `09-browser-action-transcript.txt` record
only public route navigation plus visible pointer/keyboard input. The audit did
not call Studio APIs, alter DOM/application state, or manufacture evidence.

Results:

* `05-project-a-play-state.png` and its visible-text file prove that A exposed
  the `Outcome library mode` picker, the browser selected the non-default
  `buyFeature` option, and A produced a visible played round (`Credits -1`,
  `Round detail`).
* `06-project-b-fresh-play-state.png` proves B opened with its own game name
  and a fresh `New session` setup; no A mode picker, A game, played round, or
  A error/run state is visible. `07-project-b-session-state.png` further
  proves the visible action is attached to B's own fresh session.
* The browser's four physical `Alt+Left` Back actions reach the original
  A-created `#/project/play` history entry. Both the captured URL
  (`08-browser-back-historical-a-route-url.txt`) and original A capture URL
  are identical, but `08-browser-back-historical-a-route.png` visibly renders
  **Playable Game With Bonus Round** — B — with B's fresh session controls.
  Browser Forward returns B normally (`09-browser-forward-project-b-route.*`).

Therefore B does not inherit A's visible runtime/mode state, but Back does not
restore A: it merely changes the unscoped tab URL while the server remains on
B. The browser-history acceptance criterion fails. The visible B session is
fresh and has no control for A's prior session/run, so no stale A identifier is
exposed for action while B is open; the failure is the historical
project-context mismatch rather than a credential or external prerequisite.

`01-build-cli.log`, `02-studio-root.html`, `03-cdp-version.json`,
`10-cdp-version-final.json`, `10-chrome-final.log`, and
`02-studio-server.log` provide build/server/browser provenance. Expected
headless Chrome desktop-integration warnings appear in its logs and do not
affect the successful browser transcript or captures.
