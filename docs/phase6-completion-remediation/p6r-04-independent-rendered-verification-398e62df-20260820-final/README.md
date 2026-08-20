# P6R-04 independent rendered verification

Candidate: `398e62df147a68709b60e0e461716b9e07c6536c`. This evidence-only
descendant contains no product changes after that candidate.

## Result

One fresh candidate build completed, then one fresh Studio launch from this
checkout was started exactly with `node ./dist/cli/pokie.js --no-open`.
Using only the public rendered Studio UI from its root, the run created and
opened a Random project whose Game Model rendered its per-reel generation
views, then created and opened the Recommended project. It completed a Play
spin, a 25-round Simulation report, a seed-based Replay load, exact outcome
generation (1,024 outcomes), and a single Stake Engine Export action which
rendered completion. No rendered product error was observed.

The required one-command complete-file targeted result passed: 279 tests in
`tests/cli/studio/StudioServer.test.ts`; see `targeted-results.txt`.

## Retained rendered surfaces

| Surface | File | SHA-256 |
| --- | --- | --- |
| Projects desktop | `projects-desktop.png` | `cdfdc6a3434bb952504e7189be2bd8a7228811d5dd3d18a370f9019378400d8b` |
| Projects 405px | `projects-405px.png` | `52222e5c207ebfe2cfc419f15306a0b72dc1a0719b3c4018208b14e079ba2ce8` |
| Build/Export desktop | `build-export-desktop.png` | `125395eda9237a41eea9fb716794f85498498306314c425a834b0871b2063acb` |
| Build/Export 405px | `build-export-405px.png` | `0021274f46c3ddd97605fbb1b03ae7e7c0267e3eb5499d49ab809977565d0db8` |

Only this README, the concise transcript/results, and four representative
screenshots are retained. Generated project/output trees, browser profile,
automation source, and raw logs are excluded.
