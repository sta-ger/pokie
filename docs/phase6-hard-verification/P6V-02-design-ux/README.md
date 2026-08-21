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
