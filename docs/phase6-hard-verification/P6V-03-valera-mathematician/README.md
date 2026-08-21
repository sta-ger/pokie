# P6V-03 independent browser rerun — driver inconclusive

Candidate: `a407378ba51e91dcbb5f6abddc7a07e4ed140535` (the checked-out HEAD). The candidate was built once before the audit. Two fresh Studio launches used exactly `node ./dist/cli/pokie.js --no-open`, each with a new HOME/XDG registry, Documents directory, and visible Chromium profile.

Both runs reached the rendered Recommended Design Game, typed the Valera Mathematician id/name/description, opened the rendered Layout tab, and added the fourth payline. On both, the visible Symbols tab click did not produce the expected rendered Symbols controls within the bounded observation. No rendered Studio error, save, generated-project request, Workspace transition, Play, Simulation, Replay, outcome-library, or Stake Engine export request occurred.

The first run used exact tab text; the second recovered to the tab's visible status-badged label. The same point remained unconfirmed after the second permitted fresh launch. This is a selector/driver limitation, not a product finding. `ACTION-TRANSCRIPT.txt` is the concise rendered-control record. The retained older screenshot is not evidence for this candidate rerun.
