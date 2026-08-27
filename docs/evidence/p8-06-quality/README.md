# P8-06 built Studio quality audit

Evidence is bound to candidate `4b1c6b49bc1e58f50db8fe3f8ca450e6dba0b718`. After rebuilding this checkout, a fresh isolated Studio profile and visible fresh Chromium profile used the public entrypoint `node ./dist/cli/pokie.js --no-open`.

At 1280px, Home exposed focusable named `Design Your Game` and `Projects` regions. The named `Start a new game` dialog focused its starter choice; a dirty draft focused Cancel, whose cancellation returned focus to the launch action, and Discard returned focus to the starter choice. Keyboard reached and activated `Projects`, then `Start a game`; it also reached and activated Dashboard `Game Model`. Creating the starter showed its disabled/pending Create control under a controlled 700 ms local network latency before the Project Dashboard appeared.

At 405px, Home Projects remained reachable and named, with document width and scroll width both 405px. The desktop Dashboard was reopened and retained its navigation and project context. See `transcript.txt` and `measurements.json` for the bounded timings, one direct-hash-navigation console warning, and the favicon 404 observation.

Retained payload: this README, concise transcript and measurements, plus the three representative spatial screenshots. No profiles, generated project trees, logs, or automation source are committed.

SHA-256: `01-dirty-discard-choice-1280.png` `5bb89b6f5167eb10e9abefdb4daf9eac2e89adba059af73d51ad6818c2649f70`; `02-home-projects-405.png` `5ebcadbcd7d3238bb50860f8e8b7ab0531a1aad34cf0b8f0ce99653d5df61641`; `03-dashboard-1280.png` `8e9383a1b512d982b6aebb2196ae935be4ab94c5d12f7741ecc53f5d31809966`.
