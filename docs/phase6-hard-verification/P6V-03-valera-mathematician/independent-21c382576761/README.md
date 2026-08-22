# P6V-03 independent rendered verification — finding

Candidate: `21c382576761032a4d44aa833f17f9ffbb1a9158`.

Fresh-start preconditions: the candidate was rebuilt successfully; Studio was launched from this checkout with `node ./dist/cli/pokie.js --no-open` in a newly created Chromium profile and newly isolated registry. The first rendered `Projects` screen said “No projects yet”.

On the second fresh launch, the default Recommended design was valid. Activating the visible **Create Project** control did not open a Workspace or register a project. It instead rendered: **“The project could not be found. Check the path and try again.”** The attached screenshot is the direct rendered proof.

Consequently the requested checklist had these outcomes:

- Recommended creation: **failed** (rendered project-not-found error).
- Random and Blank creation; layout/paylines; symbols/wild/scatter/artwork; literal/generated reels, stacks/constraints; paytable; bets, modes and mechanics: **not reached**, because the initial Recommended project could not be created.
- Save/close/reopen and persistence, Play ordinary/feature rounds, Simulation/RTP/results, Replay, Outcome Library and Stake Engine: **not reached** for the same reason.
- Requirement that every P0/P1/material P2 be fixed and the affected journey rerun: **not met**; this independent candidate still has the blocking creation defect.

This is a P1 finding: the standard fresh-project entry point cannot create or open the project required for the core Studio journey.

Bounded evidence:

- `recommended-create-failure.png` — SHA-256 `5aaf4613a337c17e946ba7d05eb39309c2aa397ccd2fbe0415b1c1e0da75c002` (82,514 bytes).
