# PC-19 blind cold-start run 1

Candidate: `2f4ee2dcce7dc7d2392bf750a574a61174456f8e`  
Launch: `node ./dist/cli/pokie.js --no-open`  
Context: new Studio registry and a new Chromium user-data directory; no source,
roadmap, prior evidence, recovery history, or known findings were read before launch.

The built candidate rendered the **Start a game** screen with the `starter-slot`
starter, every design section marked valid, and the local validation message
“Valid — no issues found.”

Ready state: the visible, enabled **Create game** button was focused through the
rendered keyboard navigation and activated once with Return.  No created/queued
job or operation identifier was rendered.  Its immediate action-local terminal
state was the inline error: “Your game couldn't reach POKIE Studio. Start or
restart Studio, then try again.” The visible button remained on the starter
screen and no workspace was opened.

This is a reproducible immediate terminal failure of the enabled public action,
not a readiness timeout. It blocks the requested role missions, artifact
interoperability, parity checks, player review, and independent delta rerun.

Representative rendered terminal-state capture:
[`create_game_terminal.png`](screenshots/create_game_terminal.png)  
SHA-256: `3fc22a60200224fbf136e1a1969c5a7c345e939f8a9fe620aba8c9191d6f7d4a`
