# PC-19 blind cold-start rerun — 2026-09-07

Candidate: `778e3d6eec1d7d7a12c29838e005ee16a0b8ce26`

Launch: candidate checkout `node ./dist/cli/pokie.js --no-open` via the controller-retained public UI driver.
Run transcript: isolated harness run `1788769300062` (not retained in this repository).

The clean Studio home/design screen rendered with all six design sections valid. The visible **Create game** control was enabled and, after activation, rendered the action-local acknowledgement: “Your game was saved. Opening its workspace…”. No action-local error was rendered.

The retained generic driver then exited before the workspace opened. Thus the required blind exploration, six role missions, artifact interoperability, parity checks, visual/player review, and finding/delta gate were not reached. This is driver incompleteness, not a product finding.

Representative rendered-image checksums (artifacts intentionally not retained):

* initial screen: `f4bcb359056dd01eeee720e8ad33990a00225e6b28c7d35ffd9dd3098ffb27a0`
* after Create game: `d75b747d36cfe270fde1f4a4bbf0b0e353cf1e47ca69e0449fe98288d3e72ac9`
