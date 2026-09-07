# PC-19 blind cold-start rerun — 2026-09-07

Candidate: `778e3d6eec1d7d7a12c29838e005ee16a0b8ce26`

Launch: candidate checkout `node ./dist/cli/pokie.js --no-open` via the controller-retained public UI driver.
Run transcript: isolated harness run `1788769300062` (not retained in this repository).

The clean Studio home/design screen rendered with all six design sections valid. The visible **Create game** control was enabled and, after activation, rendered the action-local acknowledgement: “Your game was saved. Opening its workspace…”. No action-local error was rendered.

The retained generic driver then exited before the workspace opened. Thus the required blind exploration, six role missions, artifact interoperability, parity checks, visual/player review, and finding/delta gate were not reached. This is driver incompleteness, not a product finding.

Representative rendered-image checksums (artifacts intentionally not retained):

* initial screen: `f4bcb359056dd01eeee720e8ad33990a00225e6b28c7d35ffd9dd3098ffb27a0`
* after Create game: `d75b747d36cfe270fde1f4a4bbf0b0e353cf1e47ca69e0449fe98288d3e72ac9`

## Fresh recovery runs — 2026-09-07

Four fresh-profile Studio launches used the same candidate CLI command. Before
consulting this evidence or project source, the reviewer independently reached
the starter design, created a valid project, opened its workspace, started a
Play session, and activated one Spin. The Spin rendered the action-local
terminal `Round complete — no win this round` with a populated 3×5 grid, a
credit balance of 999, and no rendered error.

The same rendered session also opened the Simulation configure screen (10,000
rounds and enabled `Run Simulation`) and the Replay screen (enabled
`Recreate from seed` and `Load`). No simulation, replay, outcome export, CLI
parity, examples-player parity, artifact lifecycle, six-role matrix, finding
register, or independent remediation-delta review was completed. The fourth
driver launch failed only while creating a harness screenshot filename for
`Build/Export`; it did not render a product error and cannot support a product
finding.

Representative rendered-image checksums (artifacts intentionally not retained):

* completed Spin: `f30c4606eba1f4f58d111320768cf50ca0a6418af35cb5333514e2bcf021e28a`
* Simulation configure: `aca17231b12662eda7ab0acacac41ef19efe6ccf2ab1daa15a83843c1d6533c9`
* Replay configure: `b7e0828e4b03e009c587639f450f21d3d7541e41257a257d30777ba23781e9cb`
