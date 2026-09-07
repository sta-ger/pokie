# Generation 7: saved-design harness recovery

Candidate under review: `7e4bf7cd1178fe59a29f924bb72e92b379b6d444`.
This evidence-only descendant used the candidate-built CLI with SHA-256
`ed89a858789e02acbfc66d0fb4a950f0a48678ac9ee530f399d43fc9f9103c83`.
Every fresh Studio launch used exactly `node ./dist/cli/pokie.js --no-open`
with a new Studio registry and Chromium profile.  The persistent harness is
outside this evidence tree.

## Recovered rendered journey

Run `run-1788785727727` selected a candidate-CLI-created JSON from the visible
Server filesystem browser, rendered that selected design in the Game id/name
control, and activated **Save game** once.  Its own accepted state was the
rendered saved/opening message and its local terminal state was the workspace
with **Close project**.  The journey then visibly reached **Game Model**,
**Play**, **Simulation** (queued local state), **Replay**, and
**Build/Export**.  The last surface rendered artifact preflights.  No product
error was rendered.  Transcript SHA-256:

`9e0ad9be9500cb11922cb3f92badaa60115193d96df74c31485826495113d185`.

The exact same journey then stopped after **Close project** because the driver
looked for a `Projects` button where the rendered accessible control was
`Your projects`; no product terminal error was observed.  The harness was
repaired before the next launch.

## Remaining driver limit

In fresh run `run-1788785998571`, the rendered file row remained present after
the first click.  The harness made its one permitted idempotent selection
retry; the picker still did not expose its accepted Load-from-path state or a
local error.  Transcript SHA-256:

`ac513e33c56aa4d7c20cff11c10fc0cb694b7ed32dae31c8b91e88af79bddf10`.

This is driver-inconclusive rather than a product finding: an earlier launch
rendered the same selection and Load success, while this retry rendered neither
an action-local failure nor a contrary recovery surface.  The durable Projects
entry and the complete blind charter therefore remain not reached.  No PASS is
claimed.
