# PC-04 independent exact-candidate role-mission rerun

Candidate: `44262bae4fd557c33ab64631714b929b3e3ff313`.

Fresh isolated Studio registry/profile contexts were opened at `/home/projects`
for analyst, modeler, runtime operator, simulator, outcome owner, and Stake
deployer before source or retained evidence was read.  Each rendered `Start a
game · POKIE Studio` title.  A second fresh Studio launch used the candidate
entrypoint `node ./dist/cli/pokie.js --no-open`; after activating the visible
Chromium window, the focused `Start a game` action changed the rendered title
to `Starter Slot · Overview · POKIE Studio`, confirming acceptance and useful
recovery state.

The physical `examples/parsheets/starter.par.xlsx` imported to a Game Blueprint,
was inspected, built to a TypeScript runtime package, simulated for 100 seeded
rounds, and rendered as a Markdown report.  The same blueprint built to an
Outcome Library, then a Stake export.  A generic Stake import with `--format
json` passed `inspect` and `validate --deep`; its generated `config.json`
re-exported successfully as a Stake adapter.

The retained run could not establish the requested *stale-state* scenario or
its specific recovery path: the generic host driver had no installed browser
automation client and the visible keyboard traversal exposed only the confirmed
start action.  This is a driver limitation, not a rendered product error.

## Ephemeral artifact checksums

Artifacts stayed in the verifier harness and are not retained in this commit.

| Artifact | SHA-256 |
| --- | --- |
| imported blueprint | `b9cd4d21138deb08a42ef907eaf5b0ca89c0598277200774a988391b59b1e6f2` |
| simulation JSON | `e79191edc903fde07c437ee893c828103c95bf1a1b543c93be7d0d8b32561fc1` |
| generic import `config.json` | `7a712b766eeedb68cb4f948147859861b633b172e665ad4b3db8fdc9b6ee0ec6` |
| config re-export manifest | `34f8c16b0a8afa887d4533bcc9cb2d0eda50acad19a703e6c71071df1e90b9f3` |
