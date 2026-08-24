# P6V-06 independent host follow-up — inconclusive

Candidate: `aa091dd0290c53e4cc4f4638b27790c10aabe930`.
Companion: clean, read-only `1e2c8c00457f3af389c0168432c08e63ca441465`.

`npm run build-cli` completed. One sequential targeted command passed 9 suites
and 111 tests covering PAR import/export, managed saves, reel modeler, Game
Model/Play workflows, Player round rendering, browser runtime, and outcome
generation. A fresh, isolated visible Studio run launched from this source
checkout with exactly `node ./dist/cli/pokie.js --no-open`; rendered controls
created a Workspace, reached Game Model, settled Play, completed Simulation,
exposed Replay and Build/Export, and kept Build/Export unclipped at 405px.

A separate isolated Studio run used the real active-window native picker to
select `examples/parsheets/starter.par.xlsx`. Studio rendered PAR diagnosis and
the Design Game canonical-import hand-off. Its rendered **Continue to Preview
canonical model** action did not produce the semantic preview control within
the bounded wait and rendered no product error. This is a readiness/driver
inconclusive interaction under the P6V contract, not a product finding. The
full P6V-03/P6V-04 journeys and physical PAR re-export/reimport parity were
therefore not approved in this follow-up.

Transient profile, picker output, screenshot and harness transcript remain in
the controller-owned harness workspace and are intentionally not committed.

## Focused recovery follow-up

On the exact candidate evidence descendant, the persistent harness was repaired
in place to discover visible controls by semantic prefix and to record bounded
local control/network diagnostics. A freshly isolated Studio used exactly
`node ./dist/cli/pokie.js --no-open`; its real active-window native picker
selected `examples/parsheets/starter.par.xlsx`, then Studio rendered the PAR
diagnosis and its warning/provenance details.

The rendered **Continue to Preview canonical model** remained enabled and
unchanged after the initial click. Its bounded diagnostics contained the
successful registry-preview, PAR-import and validation resources, but no
preview transition resource and no rendered error. Because the unchanged
enabled idempotent action proved the first click was not accepted, the harness
made its one permitted rendered retry. The same control still produced no
local preview continuation, validation result, pending state, or error.

This is a readiness-inconclusive interaction under the contract, not a product
finding. It does not approve the required physical export/reimport comparison
or the dependent exact-current closeout rows. The full raw transient log,
profile, picker data, and automation remain outside Git in the assigned harness
workspace.
