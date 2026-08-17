# P6-09 independent browser rerun — finding

Candidate: `f9a759d8bffeb0ccb1ef120fa92fd2523f1e5a0c`.

The final fresh Studio/client run is captured in
`33-browser-verified-workflow-terminal.log`, with browser-only input actions
and assertions in `browser-transcript.txt`. Chrome was launched with a fresh
profile and a 1440×1800 viewport; `browser-ui-rerun.mjs` uses CDP only for
page navigation, rendered-control coordinates, mouse input, rendered text,
and screenshots. It makes no Studio API calls and does not inject DOM or
application state.

The runnable `artifacts/mode-semantics-game` is a minimal local game package
using public Pokie APIs. Its public session serializer exposes the game's real
`base`, `ante`, and `buyFeature` controls. `ante` has a 1.25 stake multiplier;
`buyFeature` has a 50× multiplier and enters one free game, so the next normal
spin is a bounded one-shot reset check.

| Visible workflow | Expected completed artifact | Captured result |
| --- | --- | --- |
| Base spin | `base`, stake `1.00` | Pass (`11-play-base-spin-*`) |
| Ante spin | `ante`, stake `1.25` | **Mode displayed as `base`; stake is `1.25`** (`12-play-ante-spin-*`) |
| Buy feature | `buyFeature`, stake `50.00`; live selector resets to `base` | **Artifact mode displayed as `base`; stake is `50.00`; selector correctly reset to `base`** (`13-play-buyfeature-provenance-and-reset-*`) |
| Subsequent normal spin | `base`, stake `1.00` | Pass (`14-play-post-buy-normal-spin-*`) |
| Replay → Session Spin → completed buy round | `buyFeature`, stake `50.00` | **Mode displayed as `base`; stake is `50.00`** (`15-replay-session-spin-buyfeature-provenance-*`) |

`verification-results.json` contains the machine-readable mismatch list.
The screenshots and paired rendered-text/table files are retained for every
named step. `31-studio-verified-terminal.log` and
`32-chrome-verified-terminal.log` are final host-launch evidence.

Source inspection identifies the root cause: `SpinCommandHandler` constructs a
full-capture `roundArtifactRequest` with round id, provenance, stake, command,
and credits, but omits `betMode`. `captureRoundPokieSessionState` passes that
undefined value to `buildRoundArtifactFromSession`, yielding the artifact's
default `base` mode even though the wallet correctly charged the selected mode.
