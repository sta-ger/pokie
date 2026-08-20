# P6R-04 independent host verification

Candidate: `398e62df147a68709b60e0e461716b9e07c6536c`.

## Bounded result

One fresh candidate build and one fresh Studio launch were used. Studio was
launched from this checkout exactly as `node ./dist/cli/pokie.js --no-open`.
The public root rendered successfully. Visible Studio controls created and
opened a project, spun Play, completed a 25-round Simulation, loaded Replay,
generated 1,024 exact outcomes, and completed Stake Engine Export (four
files). No rendered product error was observed.

The Modeler selection and the final Replay action each exceeded the driver's
fixed wait without rendering a product error. The later rendered states showed
the Play tab and a loaded Replay request, respectively; these are recorded as
driver/readiness-inconclusive rather than product findings. They prevent this
record from approving the *complete* workflow.

The required single complete-file targeted Jest command completed with exit
code 0; see `targeted-results.txt`.

## Retained surfaces

| Surface | File | SHA-256 |
| --- | --- | --- |
| Projects desktop | `projects-desktop.png` | `dd70ef6735f3c913e45f8d32e8b06f37c143f9d9f2f7d40a5f60e9619e41e35d` |
| Projects 405px | `projects-405px.png` | `d4a46a69a261997fe2342e4b7305187ebf89a87cf16dd4d448896002f23f97d5` |
| Build/Export desktop | `build-export-desktop.png` | `707b91357e8aea2177974dfd3268f68a1f29e2513608d1de850ec8f7dfe28447` |
| Build/Export 405px | `build-export-405px.png` | `1bfc42f7a4a8dcbabf2268a13170a5ecaf3826ce6948aa9c463553f124e7e748` |

Only this README, concise transcripts/results, and four representative
screenshots are retained. Generated project/output trees, profile, logs, and
automation sources are excluded.
