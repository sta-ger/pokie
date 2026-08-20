# P6R-04 independent rendered verification

Candidate: `398e62df147a68709b60e0e461716b9e07c6536c` (verified from its
clean evidence-only descendant; no product source changed after the candidate).

## Bounded result

One candidate build completed before one fresh Studio workflow launch, started
exactly as `node ./dist/cli/pokie.js --no-open`. From the public root, visible
controls created/opened a Random project whose Game Model rendered per-reel
generation, then created/opened the Recommended project used for the complete
runtime workflow. The Recommended project completed a Play spin, a 25-round
Simulation, a seed-based Replay load, and exact outcome generation (1,024
outcomes).

The one visible `Run Stake Engine Export (base)` attempt did not advance within
the bounded wait and rendered no product error. It was not retried; this is a
driver/readiness-inconclusive interaction, not a product finding. The
Build/Export evidence retains the later rendered exact-generation success.

The one required complete-file targeted command passed (279 tests): see
`targeted-results.txt`.

## Retained rendered surfaces

| Surface | File | SHA-256 |
| --- | --- | --- |
| Projects desktop | `projects-desktop.png` | `097fba9d26c367f3d2d7c590bebc6b76c8292d178d1fef3e873c898600521b33` |
| Projects 405px | `projects-405px.png` | `413c9e0baa11b73d85e0beaac12680636f20ea1046807220d451c1ec0ef21a54` |
| Build/Export desktop | `build-export-desktop.png` | `5172e28e15875b8cfc8398d631fa13aae5ae1a0defc7e2ad3d84057dc60f53ac` |
| Build/Export 405px | `build-export-405px.png` | `d1ae32118518f8100df19176dee54c5e460cbc47d2e92fbcefde093d704b1273` |

Only this README, the concise transcript/results, and four screenshots are
retained. Generated project/output trees, browser profile, automation source,
and raw logs are excluded.
