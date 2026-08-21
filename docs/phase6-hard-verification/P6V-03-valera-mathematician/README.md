# P6V-03 independent browser rerun — inconclusive

Candidate product: `b6ca7bccfc6fa28ca3abf504b030c1e5e4b52cc8`.

The retained proof remains truthful: it used isolated HOME/XDG registries and fresh visible Chrome profiles, all launched from this checkout with exactly `node ./dist/cli/pokie.js --no-open`. This recovery invocation repeated that public workflow twice with repaired semantic selectors: the description input is selected by prefix and tabs by `role=tab` plus accessible-name prefix, so status badges cannot invalidate either selector.

The first fresh attempt again reached the rendered Layout tab without a rendered product error. On the second, the first Layout click remained visibly unselected, so its one permitted idempotent rendered retry was sent; the tab then selected and rendered Paylines. The subsequent rendered `Add payline` action produced neither the local fourth-payline transition nor a rendered product error during the bounded wait. The two-launch allowance is exhausted before a retry of that later action could be made. No save request was emitted, so Workspace open, close/reopen, Play, Simulation, Replay, outcome-library, and Stake-export remain unassessed. This is driver inconclusive, not a product finding.

`ACTION-TRANSCRIPT.txt` is the concise bounded proof. No generated projects, profiles, raw logs, or screenshots are retained.
