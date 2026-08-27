# P8-06 current-candidate focus audit

Candidate code SHA: `69b7ae42256dee1aa7bb79554ac1a48132de077d`. The candidate was rebuilt with `npm run build` and served through `node ./dist/cli/pokie.js --no-open` using fresh isolated Studio configuration and a visible fresh Chromium profile.

The rendered run confirms keyboard focus on **Seed (optional)** and **Saved game design**, Back to **Use the starter game** from both forms, cancellation to **Choose a different start**, and usable named Home regions. A recovery run rebuilt the candidate and created a game through the visible Studio flow: focus then landed on the Project Dashboard region, whose rendered accessible name was **Starter Slot** and whose heading reference was `project-dashboard-heading`; no rendered alert appeared.

Retained payload is three representative screenshots plus concise transcript and measurements. SHA-256: `01-random-seed-focus.png` `f199ee77133e3de5f23d2c0950c7a9d96edb3680aa0f7d833a5ad0f961b3da8b`; `02-saved-game-focus.png` `a0877cc0d6790fd5012d1e39dc3c2607692b97056a16e58adf2780aafb6ee731`; `03-project-dashboard-focus.png` `82c635e5a105de93f0d8ddff741ca6d08e11189ee71de08213efe038dd6897ad`.
