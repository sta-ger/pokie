# P6-19 independent Studio readiness finding

Candidate `ab032f2b022aa5da5134efb4b5565e491303a16d` could not start a local
Studio in the host's Node 18.19.1 runtime. After the normal local compile
prerequisite completed without tracked changes, the public `dev-studio-client`
workflow stopped in Vite: its bundled `rolldown` imports `node:util.styleText`,
which this Node runtime does not provide. The package has no `engines` field to
state the newer runtime requirement. No Studio page rendered, so UI creation,
artwork, reels/stacks, save, Play, Simulation, Replay, outcome generation, and
Stake export were not reachable. The required second, uncoached launch was not
attempted because readiness did not pass.

`launch-transcript.txt` retains only the setup result, launch status, and
decisive diagnostic. `SHA256SUMS` verifies the transcript.
