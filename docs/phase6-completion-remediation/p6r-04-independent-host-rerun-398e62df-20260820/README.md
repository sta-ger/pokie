# P6R-04 independent host rerun

Candidate: `398e62df147a68709b60e0e461716b9e07c6536c` (this evidence-only
descendant changes no product source). The candidate build completed before
one fresh Studio launch, started exactly with
`node ./dist/cli/pokie.js --no-open`.

## Result

Rendered Studio successfully created and opened a managed Recommended project,
spun a Play round, completed a 25-round Simulation, and loaded a seed-based
Replay request. The Modeler selection, the later Replay run, and exact outcome
generation each had one rendered-control attempt that did not advance during
the bounded observation window and did not render a product error. No retry was
made. Since outcome generation did not render completion, the dependent Stake
Engine Export remained disabled.

The required one-command eight-file targeted Jest run was started serially but
remained CPU-active without a terminal result for 5m10s. It was terminated; it
is not a passing targeted result.

See `browser-transcript.txt` for the concise action record.

## Retained rendered surfaces

| Surface | File | SHA-256 |
| --- | --- | --- |
| Projects desktop | `projects-desktop.png` | `bd3788098984499fd0e5b7805f715e17c2f4719afa68fc407ed2787a1cf81a97` |
| Projects 405px | `projects-405px.png` | `2d1f4c0b9124d6f8c681c075f3d096e74978c827a45c8f4eac41f052743a6cdb` |
| Build/Export desktop | `build-export-desktop.png` | `69de8bbc4c9debdc951511f7615ffebcf3683771ba6f6867d91050cb3c1cb501` |
| Build/Export 405px | `build-export-405px.png` | `9d8e5afd63adb1b5932404af06a40588061f5a98b7cb9831c77fac2d1f542bae` |

Only this README, the bounded transcript, and four screenshots are retained.
Generated project/output trees, profiles, automation source, and full logs are
excluded.
