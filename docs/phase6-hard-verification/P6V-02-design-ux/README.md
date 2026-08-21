# P6V-02 independent rendered verification — inconclusive

Candidate: `976d9d887a6c02ce506c501e3cf38e40f38820e3`  
Candidate CLI: `dist/cli/pokie.js`  
SHA-256: `4643f200188d379630754512e8466ec7339bb715f44753ba9675e9e0f3e86495`

## Bounded transcript

1. Built the exact candidate, then invoked the specified public CLI entry point
   with `--no-open`.  With no subcommand it printed its public command help and
   exited successfully; it did not start Studio.
2. For the permitted readiness preflight, created an isolated playable package
   outside the worktree whose sole `pokie` dependency was a one-time package of
   this candidate build.  It was launched through the candidate CLI as
   `node ./dist/cli/pokie.js dev <isolated-package> --no-open`.
3. The public CLI reported a listening game API and a listening **client UI**.
   A fresh browser profile rendered the following visible product surface:

   ```text
   Playable Game — POKIE client
   Connected to http://127.0.0.1:38981
   Session seed (optional) | Start new session | Restore session
   Bet 1 | Credits 1000 | Spin | Raw response
   ```

   There was no rendered Studio navigation or route to Home, Design Game,
   Projects, Game Model, Reel Strip Modeler, Simulation, Replay, Build/Export,
   or Outcome Library.  Public probes of `/studio-client/`,
   `/studio-client/index.html`, and `/client/` on the launched client server all
   returned HTTP 404.

## Result

The required Studio readiness surface was not reachable through the prescribed
candidate public launch.  No product error was rendered and no product code or
tests were changed.  Consequently the requested Studio surface matrix and the
separate cold-start exploration were not reached; this is recorded as a
`readiness` inconclusive result, not as a defect in an unrendered surface.

## Harness-recovery continuation (2026-08-21)

The candidate was rebuilt successfully from the evidence descendant; its only
delta from `976d9d887a6c02ce506c501e3cf38e40f38820e3` is this evidence file.
The prescribed launch, `node ./dist/cli/pokie.js --no-open`, then rendered
`POKIE Studio listening on http://127.0.0.1:3200`.

With an isolated browser profile the public Studio UI rendered Design Game and
the recommended `Starter Slot`. `Create Project` opened Workspace, and a fresh
profile automatically reopened that saved project. The rendered Workspace
included Game Model, Play, Simulation, Replay, and Build/Export navigation.

Rendered functional observations:

1. Play required the visible `New Play session` control before its `Spin`
   control became available. One Spin completed normally: `Round complete —
   no win this round`, with credits `999` and total win `0.00`.
2. Simulation rendered its Configure/Run/Review/Export flow. The visible
   rounds input was changed through normal keyboard input to `1`; one
   `Run Simulation` action was accepted and rendered `queued — 0/1 rounds`.
   No product error rendered before the browser-driver session ended, so it is
   pending rather than a failure.

This recovery established Studio readiness and the bounded create/reopen/Play
path, but did not complete the required all-surfaces visual matrix, the
separate uncoached cold-start audit, Replay, Build/Export, Outcome Library,
Stake export, or the approximately 405px review. No P0/P1/material-P2 product
defect was confirmed in the reached rendered surfaces.
