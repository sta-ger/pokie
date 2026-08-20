# P6R-04 independent host verification

Candidate: `c6a4a119d641483ca0388adf763e79d3294a57a1`.

## Result: P2 finding

The candidate build completed. A fresh Studio launch from this source checkout
used `node ./dist/cli/pokie.js --no-open`; the browser was driven only through
rendered controls from the public root. The recommended Random model remained
valid after generation, but **Create Project** rendered: “The project could not
be completed. Try again. If it continues, choose the location again and retry.”
The Projects registry then rendered “No projects yet”. No Workspace opened, so
the generated-reel, Play, Simulation, Replay, and Build/Export portions were
not reachable. The create action was not retried.

The first interaction wait expiring was treated as readiness-inconclusive. The
later rendered product error above is the finding.

## Machine-owned regression result

One complete-file command covered all eight persisted test paths. It failed:
two suites / five assertions failed; six suites / 408 assertions passed. The
compact result is in `targeted-results.txt`. The candidate build itself passed.

## Retained evidence

| Surface | File | SHA-256 |
| --- | --- | --- |
| Create Project desktop error | `01-desktop-create-project-error.png` | `3c61cec7b510f838f091ecc5a7ed1ba0665ac812cdf645abed8970f5657e3515` |
| Projects desktop | `02-desktop-projects.png` | `c0bb0a9ddde81be6aaa2092780b1d709edbcbbd10d20ecc588aa736ebb378006` |
| Projects 405px | `03-mobile-projects.png` | `d05b09c71f24ea6ca874fd705ca50f45db4fe24037166ca69a243acb6b6db07e` |
| Rendered-control transcript | `browser-transcript.txt` | `92c5af4abf57980b1db5bc76ebc47b2a66622adb82e30e9bf644e9d043f703bb` |

No Build/Export screenshot exists because its workspace is only reachable after
the failed public Create Project operation. No generated project/output tree,
browser profile, raw log, or automation source is retained.
