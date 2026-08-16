# P6-04 independent host-side verification finding

Candidate `152af9be3dc1544abfef5ce7795a7f4bba682899` was rebuilt with Node
`v24.18.0` and exercised through a fresh local Studio and fresh Chrome profile.
The recorder located rendered controls, drove browser mouse/keyboard input, and
captured screenshots and browser transcripts without changing DOM or client
state.

Recommended and seeded Random creation both passed their initial visible flow:
manual names persisted with deterministic ids, each game opened immediately,
and Play (`New session`, `Spin`) plus a 25-round Simulation completed. The
projects were registered and visible after a Studio/client restart.

## Correction

The original reopen result was a recorder false negative, not a Studio routing
failure. At the captured narrow viewport the table's Actions column is
horizontally scrolled out of view: the reported coordinate (`x=875`) lies beyond
the 765-pixel screenshot. It never reached the rendered `Open` button.

The recorder now tabs to the target row's `Open` action (letting the browser
scroll it into view), then sends native mouse input at that visible button. A
fresh Studio and fresh Chrome profile reopened `P6 Random Owner` into its
Workspace through Projects after restart. The same run retained the existing
filesystem evidence: both manually named managed blueprints and the durable
registry entry. The original timeout logs remain as historical evidence of the
recorder defect.
