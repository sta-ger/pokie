# P8-06 current-candidate validation audit

Audited product SHA: `aa9f2c5b86dd37d01931c490f5d2e2b9e5c76bd9`. The candidate was built before this rerun and launched from this checkout exactly with `node ./dist/cli/pokie.js --no-open`, using new isolated Studio HOME/XDG directories and a new visible Chromium profile.

A local forwarding proxy held exactly one browser-originated `POST /api/home/blueprints/validate` response for 4 seconds. While the rendered UI announced `Validating…` in a polite status region, the visible `Create game` button was disabled with `aria-busy=true`; the rendered Game name input was enabled and writable. A real visible Game name edit initiated a later validation which recovered to `Current Revision Audit`; the stale starter result was absent.

The two screenshots are representative rendered states: `01-controlled-validation-loading.png` SHA-256 `3851cc0beb60c6ca36715b8e0ae8b10bec93d296c8172ef2fc1dfc85bb0669aa`; `02-current-revision-recovered.png` SHA-256 `28fdac7b63fecb85a0bde3d435aab2a544a8fb0eb18f37137f180a8b55a9afd0`. `transcript.txt` and `measurements.json` retain concise action/provenance plus browser console and failed-network observations. No profiles, generated projects, raw logs, or automation source are retained.
