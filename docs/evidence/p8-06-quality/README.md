# P8-06 current-candidate focus audit — driver inconclusive

Candidate code SHA: `69b7ae42256dee1aa7bb79554ac1a48132de077d`. The candidate was rebuilt with `npm run build` and served through `node ./dist/cli/pokie.js --no-open` using fresh isolated Studio configuration and a visible fresh Chromium profile.

The rendered run confirms keyboard focus on **Seed (optional)** and **Saved game design**, Back to **Use the starter game** from both forms, cancellation to **Choose a different start**, and usable named Home regions. It also rendered the Project Dashboard without an alert. Its region-focus capture is inconclusive because the harness matched a literal label instead of the dashboard's project-title heading reference; the two permitted launches ended before that repaired selector could run. This is not a product finding.

Retained payload is two representative screenshots plus concise transcript and measurements. SHA-256: `01-random-seed-focus.png` `f199ee77133e3de5f23d2c0950c7a9d96edb3680aa0f7d833a5ad0f961b3da8b`; `02-saved-game-focus.png` `a0877cc0d6790fd5012d1e39dc3c2607692b97056a16e58adf2780aafb6ee731`.
