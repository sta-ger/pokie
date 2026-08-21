# P6V-03 independent browser rerun — inconclusive

Product candidate: `1fd51406388799fdcf65873ed9a2674769859cbf`.

The candidate was built once. Two permitted fresh public Studio launches used
exactly `node ./dist/cli/pokie.js --no-open`, each with a new Studio
`HOME`/XDG registry and a new visible Chrome profile. The first reached the
Recommended editor and stopped because the Layout section had not been opened;
the second corrected that navigation, rendered the Add-payline warning, then
stopped because Symbols had not been opened before its control was selected.

No product error was rendered, so this is not a product finding. The two-launch
limit prevents another public-workflow attempt; therefore Play, Simulation,
Replay, Outcome Library, and Stake Engine were not reached. The concise
`ACTION-TRANSCRIPT.txt` records the exact rendered observations. No generated
project/output tree, browser profile, raw log, PID, or automation source is
retained.
