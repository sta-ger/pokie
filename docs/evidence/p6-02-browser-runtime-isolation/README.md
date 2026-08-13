# P6-02 browser runtime-isolation verification

Status: **finding** (`p6-02-browser-runtime-isolation`).

Independent rerun, 2026-08-13: `attempt-3/` rebuilt this exact candidate
with the host Node 24 runtime, started a new Studio server and a new Chrome
profile, and drove the public UI with visible mouse/keyboard events. Its
`04-browser-driver.log` and `09-browser-action-transcript.txt` record the
successful A → B workflow. `05-project-a-play-state.*` shows A's executed
round; `06-project-b-fresh-play-state.*` shows B has no A round (that part of
the isolation requirement works); and `08-browser-back-historical-a-route.*`
shows B on the historical A `/project/play` entry. Thus the back/forward
navigation criterion fails independently. `attempt-5/` preserves the later
fresh forward-navigation rerun setup/logs; it could not complete because the
persisted Studio project registry contains pre-existing rows whose duplicate
visible actions made the browser target ambiguous. That is diagnostic only,
not an external block, and does not alter the successful independent finding.

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

The candidate's project-scoped simulation endpoint changes do protect stale
simulation IDs, but they do not make browser history project-scoped. The
observed defect is therefore in the public navigation/context boundary rather
than a need for credentials or another external prerequisite.

`09-browser-action-transcript.txt` is the successful visible-UI action log;
`04-browser-driver.log` retains the complete terminal transcript, including
earlier setup diagnostics. `01-build-cli.log`, `02-studio-server.log`, and
`03-cdp-version.json` provide build and fresh-runtime provenance.
