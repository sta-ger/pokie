# Attempt 7 — independent browser UI rerun

Status: **finding** (`p6-02-browser-runtime-isolation`).

This rerun built the candidate's Studio client with Node 24.18.0, launched a
fresh local Studio server on port 41217, and drove a fresh Chrome profile on
port 9231. It used the public Studio UI only: rendered controls were located,
then clicked with browser pointer events; typed values and browser navigation
were sent as keyboard events. No Studio API was called by the runner, and it
did not modify DOM or application state.

Project A was the real two-mode outcome-library bundle under `attempt-4/` and
was passed to the public `pokie studio <path>` startup command. The runner
opened the public `#/project/play` route, selected the non-default
`buyFeature` mode, created a session, and spun a round. Project B was the real
`fixtures/project-b` package, detected, registered, and opened through the
visible Studio Projects UI.

Results:

* `05-project-a-play-state.png` and its visible-text capture show A's
  non-default outcome-library selector and an actual round (`Credits -1` and
  `Round detail`).
* `06-project-b-fresh-play-state.png` shows B's distinct title and an empty
  `New session` setup. It contains neither A's mode picker nor A's round.
  `07-project-b-session-state.png` shows B's own fresh session controls.
* Four physical `Alt+Left` Back actions returned to the exact same
  `#/project/play` URL first captured for A (`05-...-url.txt` and
  `08-...-url.txt`), but `08-browser-back-historical-a-route.png` visibly
  renders **Playable Game With Bonus Round** and B's fresh session controls.
  Browser Forward then remains on B (`09-browser-forward-project-b-route.*`).

Consequently, A's selected mode and played state do not leak into B, and no A
session/run control is exposed while B is open. However, browser history is
not project-scoped: the historical A route only restores the tab path while
the server's mutable project context remains B. This violates the required
Back/Forward A-scoped-state isolation criterion.

`01-build-cli.log`, `02-studio-root.html`, `03-cdp-version.json`,
`03-chrome.log`, `04-browser-driver.log`, and
`10-runtime-processes-before-shutdown.txt` are build/runtime/browser
provenance. `09-browser-action-transcript.txt` is the complete visible-UI
interaction transcript. `11-shutdown.log` confirms the local Studio and
Chrome writers were stopped before the evidence commit.
