# PC-19 exact-candidate independent rerun — incomplete

Candidate: `cc0219a1088de689781de5bf56ed2786e8d40972`  
Candidate package archive: `artifacts/pokie-1.3.0.tgz`  
Archive SHA-256: `07053aad46507e453d0fadd04a18cf47e03031cceb6d1a80ae49ee5735b509ad`

This verifier made two fresh-profile public Studio launches through the candidate
source command `node ./dist/cli/pokie.js --no-open`. The final lifecycle launch
rendered Create game → workspace, New Play session → settled Spin, a completed
10,000-round Simulation, Game Model, and exact base Outcome Library generation
(1,024 outcomes). No product terminal failure was observed in those actions.

The bounded rerun did not complete Replay loading, TypeScript package build and
export, generated-sibling fairness, desktop/narrow examples parity, artifact
torture/recovery, or the full six role missions. It therefore is not a PC-19
acceptance pass and makes no release finding. `transcript.md` retains the concise
rendered sequence; the verifier-owned freeze receipt is outside this directory.
