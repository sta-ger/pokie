# P8-04 Studio polish browser audit

`scripts/p8-04-studio-polish-browser-audit.mjs` is the product-bound Chromium audit for this step. It starts the built `dist/cli/pokie.js` Studio rather than importing a component fixture, drives rendered navigation, asserts document-level overflow at each viewport, and writes this directory's screenshots and transcript.

The audit records the following viewport classes:

- `wide-overview.png` — 1440×900, Design/project workflow entry.
- `compact-project.png` — 1024×768, Projects workflow alongside desktop navigation.
- `small-navigation.png` — 390×844, mobile navigation open.

Run it only after a fresh Studio build: `node scripts/p8-04-studio-polish-browser-audit.mjs`. The transcript names every viewport, action, captured state, and overflow assertion.
