# Independent host browser verification — P5PA-05

Candidate: `931950adecdac1e5ad13ee74c698cb4ce9da60cf`.

Result: **finding**. A fresh Studio CLI/client build from this candidate was run against the real
`playable-game-with-free-games` package. A fresh Chrome profile used only rendered controls and
visible-coordinate mouse/keyboard input. The fixture was given a normal local `node_modules/pokie`
link to the freshly built candidate package; [`16-fixture-local-dependency.txt`](16-fixture-local-dependency.txt)
records that resolved dependency and its public game manifest.

The visible workflow succeeded through Play:

1. Play → New session → **Find free games** was clicked.
2. The returned rendered Round detail visibly contains the authoritative `freeGamesTriggered` event;
   see [`08-play-find-free-games-artifact.png`](08-play-find-free-games-artifact.png) and its
   matching visible-text capture.
3. Replay was opened immediately, Session Spin was selected, and the newest shared-recorder round
   (round 287 in the same session) was selected.

The selected Replay view retains the same artifact and visibly shows `freeGamesTriggered`, but it
labels its source **`Recorded -- Play tab spin`**. It does not render an `Operation` row or the
required **Find free games** operation label. The actual rendered failure is captured in
[`20-replay-entry-missing-find-free-games-operation.png`](20-replay-entry-missing-find-free-games-operation.png)
and [`20-replay-entry-missing-find-free-games-operation-visible-text.txt`](20-replay-entry-missing-find-free-games-operation-visible-text.txt).
The real browser action transcript and its final assertion timeout are in
[`10-browser-action-transcript.txt`](10-browser-action-transcript.txt) and
[`10-browser-driver-terminal.log`](10-browser-driver-terminal.log).

`browser-ui-rerun.mjs` is the audit driver. It reads only rendered UI, sends CDP mouse/keyboard events
to visible coordinates, and captures screenshots/text. It does not invoke Studio endpoints, inject
DOM, or alter browser application state.

Terminal evidence: [`05-candidate-cli-client-build-terminal.log`](05-candidate-cli-client-build-terminal.log),
[`17-restarted-studio-server-terminal.log`](17-restarted-studio-server-terminal.log), and
[`18-restarted-chrome-terminal.log`](18-restarted-chrome-terminal.log). Earlier failed startup/browser
attempt logs were preserved exactly as already present in this requested evidence directory.
