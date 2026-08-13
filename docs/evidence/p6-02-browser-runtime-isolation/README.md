# P6-02 browser runtime-isolation verification

Status: **finding** (`p6-02-browser-runtime-isolation`).

The audit built this candidate's CLI/Studio client, launched a fresh local
Studio server and fresh desktop-sized headless Chrome profile, and used only
visible mouse/keyboard input through the public Studio UI. It imported and
opened two real local package fixtures stored in `fixtures/`.

`05-project-a-play-state.*` shows Project A's actual played round. Opening
Project B via Home then produced `06-project-b-fresh-play-state.*`, which
correctly had no A round. The browser Back sequence then returned to the
historical `#/project/play` entry created for A. Its URL is preserved in
`08-browser-back-historical-a-route-url.txt`, but the screenshot and rendered
text in `08-browser-back-historical-a-route.*` show **Playable Game With Bonus
Round** (B), not A.

The URL only contains the tab (`/project/play`), while the Studio server has a
single mutable current-project context. Browser Back changes only that tab
route; it does not reopen the historic project. Consequently B is rendered on
the historical A route, so the A-scoped back/forward criterion is not met.

`09-browser-action-transcript.txt` is the successful visible-UI action log;
`04-browser-driver.log` retains the complete terminal transcript, including
earlier setup diagnostics. `01-build-cli.log`, `02-studio-server.log`, and
`03-cdp-version.json` provide build and fresh-runtime provenance.
