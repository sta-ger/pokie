# P6V-02 exact-candidate Design and UX audit

Audited checkout: `2b7c96bac89292bfc606521ac7c3877839b68857`.

A fresh Chromium profile drove only rendered controls against Studio launched
from this checkout as `node ./dist/cli/pokie.js --no-open`. The machine-owned
transcript and full screenshot inventory are in `current-candidate/`.

At desktop width the audit cold-started Design Game, exercised invalid-draft
feedback and correction, then completed Workspace, Game Model, Play, one-round
Simulation, Replay, exact Outcome Library generation and Stake Engine export.
At 405px it verified no horizontal overflow (`scrollWidth=405`) in Build/Export
and navigated the editable Reel Strip Modeler. No rendered P0, P1, material P2,
or workflow dead end was found.

The headed native PNG-picker capture remains the earlier immutable recovery
record; it is deliberately not represented as a capture from this exact-SHA
rerun.
