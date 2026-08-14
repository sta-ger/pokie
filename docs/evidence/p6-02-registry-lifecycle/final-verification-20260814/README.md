# P6-02 final host-side browser verification

Candidate `183dbcedd265258e70112c5a0dff61eaa48533e8` was freshly rebuilt with
the locally installed Node 24 runtime and served as a new local Studio
instance. Studio configuration, Documents output, and the Chrome profile were
isolated beneath this directory.

The browser lifecycle driver used only normal Chrome mouse and keyboard events
against controls located in the rendered UI. It neither called Studio product
API routes nor injected DOM or application state.

Finding: guided **Save** visibly wrote a managed Blueprint Project
(`04-managed-save-visible-refresh-source.*`). Selecting the visible
**Projects** navigation did not render its row during the full 30-second
browser observation (`12-browser-phase1-terminal.log`). An observation-only
capture afterwards shows the row without a browser reload
(`13-projects-stale-after-managed-save.*`), demonstrating a materially
delayed refresh rather than an immediate UI update. The isolated persisted
registry contains the same managed Blueprint record
(`14-host-persisted-registry-observation.json`).

The visible resumed workflow did confirm canonical relative/absolute/symlink
registration and registry-name update before it hit a browser geometry issue
opening the renamed row (`06-canonical-imports-and-rename.*`,
`12-browser-phase1-resume-3-terminal.log`).

Because the first required acceptance criterion does not refresh promptly,
the bounded lifecycle stopped before later lifecycle conditions could be
recorded as passing.
`12-browser-phase1-terminal.log`, `10-studio-phase1.log`, and
`11-cdp-phase1-version.json` retain the browser, server, and runtime evidence.
