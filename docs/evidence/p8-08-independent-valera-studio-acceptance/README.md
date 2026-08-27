# P8-08 independent Studio UX verification

Candidate: `36003173888e06c3bc20646969b7a98e7fc3d7e1`  
Date: 2026-08-27

The candidate was built successfully (`npm run build`) and Studio was launched
from this checkout with `node ./dist/cli/pokie.js --no-open` in fresh Chromium
profiles. The first rendered preflight confirmed the ready-to-edit starter
journey, automatic validation, create/save confirmation, persisted project
workspace, and all of the advertised Play, Simulation, Replay, and
Build/Export navigation surfaces. No rendered product error occurred.

The second fresh-profile preflight reached Play setup, whose rendered text
contains “Start Play”. The accessibility/control projection did not expose a
matching enabled `Start Play` control, so the harness could not perform the
semantic action. This is recorded as a selector/driver inconclusive result,
not a product defect. The allowed launch budget was then exhausted; no
source-guided or synthetic fallback was used.

Retained evidence is deliberately limited to this transcript. Generated
profiles, screenshots, logs, project trees, and harness files were not
committed.
