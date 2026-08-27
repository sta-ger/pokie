# P8-06 built Studio quality audit — driver-inconclusive

Evidence is bound to candidate `4b1c6b49bc1e58f50db8fe3f8ca450e6dba0b718`. The public built Studio entrypoint was launched from this checkout with `node ./dist/cli/pokie.js --no-open`; each of the two runs used newly isolated Studio and visible Chromium profiles.

The retained run reached Home Design at 1280px in 327 ms with no document-level horizontal overflow; named, focusable regions were `Design Your Game` and `Projects`. The New Blueprint dialog was named `Start a new game` and initially focused `Use the starter game`. After a rendered Game name edit, the dirty confirmation initially focused `Cancel`; Cancel returned focus to `Choose a different start`; Discard returned to the starter-choice state captured in `01-dirty-discard-choice-1280.png`.

The browser recorded no console events and one failed request: `404 /favicon.ico`. The attempt stopped when CDP keyboard dispatch did not produce the rendered Home Projects transition within the bounded semantic wait; no rendered product error appeared. With the two-launch budget exhausted, this is a driver-inconclusive result, not a product finding. Therefore 405px, Project Dashboard, create/save, and delayed-loading portions remain unverified.

Retained payload: this README, the concise transcript, measurements, and one spatial screenshot. No profiles, automation source, server logs, generated projects, or raw logs are committed.

SHA-256: `01-dirty-discard-choice-1280.png` `5bb89b6f5167eb10e9abefdb4daf9eac2e89adba059af73d51ad6818c2649f70`.
