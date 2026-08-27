# P8-02 onboarding evidence

`scripts/p8-02-onboarding-browser-audit.mjs` is the reproducible, rendered-browser
check for this slice. It starts Studio with an isolated profile, opens a fresh
Chromium profile, and records the first-launch journey in `current-run/`.

The journey verifies that Studio explains the starter, blank, generated, and
saved-design choices; rejects an unrecognised game location without losing the
Projects surface; and creates the starter game into its project-scoped
workspace. The transcript and screenshots are generated evidence: rerunning the
script replaces only files in this P8-02 directory.
