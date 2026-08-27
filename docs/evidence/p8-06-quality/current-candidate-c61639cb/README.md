# P8-06 supplemental current-candidate quality audit

Audited product SHA: `69b7ae42256dee1aa7bb79554ac1a48132de077d`. Evidence checkout SHA: `c61639cb77d90c6ae46a380c710393a0b83ea5c4` (a documentation-only descendant of the product SHA).

The candidate was built with `npm run build`, then launched through the public entrypoint exactly as `node ./dist/cli/pokie.js --no-open` with new XDG Studio directories and a new visible Chromium profile. The rendered browser flow measured first Home content (343 ms), Home → Projects (125 ms), opened the starter editor, and found no horizontal document overflow at 1280 px or 405 px on the Home/editor surface.

A forwarding proxy delayed exactly one browser-originated `POST /api/home/blueprints/validate` response by 4,000 ms. The rendered UI showed `Validating…` in a `role=status` / `aria-live=polite` state. While that request was pending, the rendered `Create game` control reported `disabled=false` and no `aria-busy`, despite being a conflicting create action. A real Game name edit during the delayed request recovered through the second validation request, retained `Latency Audit Slot`, and did not paint the stale starter result.

The retained screenshots are rendered evidence only. `transcript.txt` contains the exact observations and bounded failure to reach a dashboard outcome in the first run; the latter is not asserted as a product defect because it had no rendered product error.

SHA-256: `01-home-405.png` `b9daf1451aa00f21775b3745d22d84cf4e89697ba9bb91cf0643f1ba35d39311`; `02-controlled-loading-1280.png` `a8718e09798500ff37cb07efae974cc791761e830f1c1477aeb161651fd8bd10`.
