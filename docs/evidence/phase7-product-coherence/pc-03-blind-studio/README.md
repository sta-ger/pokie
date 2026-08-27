# PC-03 — blind Studio exploration attempt

Candidate: `8f23a47b443a578d4351b7d019dddadd7c698b12`
Run: 2026-08-27, two isolated attempts, each with a newly created Chromium
profile and Studio runtime directory. Studio was built from this checkout and
launched only with `node ./dist/cli/pokie.js --no-open`.

This is a bounded **driver-inconclusive** attempt, not a product pass or a
product finding. No roadmap, prior evidence, source-file path, or known finding
was supplied to the UI exploration.

## Rendered observations

1. Fresh Studio rendered the editable starter-design screen: **Create game**,
   **Choose a different start**, game id/name/version fields, validation, and
   Game Model preview. This establishes the clean empty/new-project entry
   state.
2. The rendered start chooser offered starter, blank, generated-idea, and
   **Open a saved game design** paths. Its Browse control opened a visible native
   picker; the picker was activated and given an isolated deliberately malformed
   JSON path. The resulting rendered modal displayed that path and an explicit
   **Open saved game design** confirmation. The driver did not confirm that
   second rendered action, so this is neither an import result nor an error
   finding. A separate visible-picker cancellation returned cleanly.
3. The name field was cleared and restored through visible keyboard interaction.
   Studio rendered `Source changed — checking again…`; no product error was
   rendered. The rendered green notice later confirmed: `Your game was saved.
   Opening its workspace…`.

## Limitation and disposition

After the confirmed save/create state, the input focus left the action above
the viewport. The harness searched only viewport-visible controls and therefore
raised a driver error before it could await the workspace or reach Build/Export,
Play, Simulation, Replay, generated-artifact reuse, or browser history checks.
The same bounded harness repair was tried once with a fresh profile and reached
the same viewport-selection failure. The two permitted public-workflow launches
were thereby exhausted.

No fixed wait expiry, no unconfirmed action, and no driver failure is reported
as a product defect. No generated project or raw driver log is retained.
