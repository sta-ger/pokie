# P8-06 current-candidate focus audit — inconclusive

This bounded evidence is for candidate `69b7ae42256dee1aa7bb79554ac1a48132de077d`. The candidate was rebuilt and run through the public entrypoint `node ./dist/cli/pokie.js --no-open`, with fresh isolated Studio configuration and a visible fresh Chromium profile.

The rendered flow confirmed keyboard entry from `Generate a game idea` to focused `Seed (optional)`. The subsequent rendered `Back` click had no semantic transition or rendered error within 30 seconds. The allowed two public launches were exhausted, so this does not establish a product defect and the remaining required focus paths were not reached.

Retained payload: one representative screenshot, concise transcript, and measurements; no generated projects, profiles, logs, or automation source. SHA-256: `01-random-seed-focus.png` `0670b2cabb9be02359cbebadb0e238ed306f8ca8573cc90353666fc62a5686f5`.
