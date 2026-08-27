# P8-02 onboarding evidence

Independent rerun passed on candidate `f1511c0e47038a94f266788475e513deb83a915a`.
Fresh Studio and Chromium profiles used this checkout's candidate build via
`node ./dist/cli/pokie.js --no-open` for two launches. The rendered journey
shows Studio's purpose, all four start choices, invalid-location recovery, and
the created Starter Slot workspace. A browser-rendered HTTP 503 for
`GET /api/context` remained at `#/` with the explicit **Choose or create a
game** recovery action, rather than routing to Home.

`current-run/` contains the concise action transcript, provenance/checksums,
and the five representative rendered screenshots only.
