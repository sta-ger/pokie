# P8-04 Studio polish browser audit

`scripts/p8-04-studio-polish-browser-audit.mjs` is the product-bound Chromium audit for this step. It starts the built `dist/cli/pokie.js` Studio rather than importing a component fixture, creates and opens a real generated project through rendered controls, runs/cancels/completes real simulation jobs, asserts document-level overflow at each capture, and writes this directory's screenshots and transcript.

The audit records the following viewport classes:

- `wide-project-overview.png` — 1440×900, real long-named project Overview after rendered project creation.
- `compact-simulation-running.png` — 1024×768, a real queued/running simulation.
- `compact-simulation-cancelling.png` — 1024×768, cancellation requested while the server reaches a safe cleanup boundary (emitted only if that state is observable before terminal cancellation).
- `compact-simulation-cancelled.png` — 1024×768, the real cancelled simulation result after cleanup.
- `wide-simulation-completed.png` — 1440×900, a real completed simulation report and its output actions.
- `small-navigation.png` — 390×844, mobile navigation open after the project and job workflows.

Run it only after a fresh Studio build: `node scripts/p8-04-studio-polish-browser-audit.mjs`. The transcript names every viewport, rendered action, captured state, and overflow assertion. A verifier can set `P8_04_EVIDENCE_DIR` to collect a disposable run without replacing the checked-in audit evidence.
