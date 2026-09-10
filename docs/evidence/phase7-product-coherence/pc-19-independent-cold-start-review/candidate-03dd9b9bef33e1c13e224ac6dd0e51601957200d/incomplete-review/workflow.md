# Rendered workflow summary

Both isolated Studio launches began at the rendered Design Your Game page with
an enabled `Create game` control. One activation in each context led to the
saved `starter-slot` workspace, which rendered `Valid — no issues found`.

The first launch used public controls to create a Play session, settle one
`Spin` (`Round complete — no win this round.`), accept a 100-round Simulation
job (`queued — 0/100 rounds`), and later render its local completed report
(`100/100 rounds`, RTP, hit frequency, and `Open full report`). Game Model
rendered five reel columns, three rows, literal strips, and the paytable.

For exact Outcome Library generation, the same first launch retained the
ready control, one activation, and the action-local `Generating outcome library
from this project's current build…` state. A too-broad driver matcher then
mistook the unchanged button label for a terminal and closed the launch; no
generated terminal or product error is claimed. The second launch did not
repeat that accepted request.

The second launch again completed a Play round and completed TypeScript Game
Package from its card-local ready state. That same card rendered `Built to …`,
`Executed plan: publish publish`, and `Open output folder`. Its separately
activated Stake Engine export did not retain an unambiguous card-local terminal;
the harness selected a broad ancestor containing the TypeScript success. It is
not claimed as Stake success or failure.

Replay rendered its `Session Spin` choice, but the visible-control driver did
not locate the subsequent activatable session-round item. No request was
accepted there. There was no rendered product error associated with any of the
uncorrelated gaps, so they are driver-correlation gaps rather than findings.
