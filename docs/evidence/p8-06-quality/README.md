# P8-06 built Studio quality audit — incomplete driver run

This evidence is bound to candidate `4b1c6b49bc1e58f50db8fe3f8ca450e6dba0b718` and records the two permitted fresh-profile launches of the exact public command `node ./dist/cli/pokie.js --no-open`.

The public built client rendered Home Design, exposing named focusable Design and Projects regions. The first launch measured 246 ms from navigation to that rendered Home result; both launches established no document-level horizontal overflow at 1280px. The retained `measurements.json` records the clean second-run 1280px geometry and the browser's console/failed-network arrays through its abort point (both empty).

This is deliberately an **inconclusive driver result**, not a product finding. Run 1 stopped at a repaired first-launch control selector. Run 2 then evaluated before `document.body` existed after navigation. Neither stop produced a rendered product error, and the two-launch cap prevented a further repaired rerun. Consequently, this submission does not claim verification of the dirty-draft dialog, 405px layout, Project Dashboard navigation, create/save, or delayed loading.

Retained payload is only this README, the concise transcript, and the small measurement JSON; no profile, automation source, server log, generated project, or screenshot is committed.

SHA-256: `transcript.txt` `b43be07317c8a910098e0701384e2e935dad1415d67b3a5bad714706b3e78261`; `measurements.json` `9ccf008a064a64577bb73db54913b4c05edc6ecf3bf411eec368bdc0e57b3fd1`.
