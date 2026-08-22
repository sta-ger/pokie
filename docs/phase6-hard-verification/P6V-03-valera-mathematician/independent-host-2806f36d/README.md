# P6V-03 independent host rerun (inconclusive)

Candidate: `2806f36d1d08126bfc40572e16fde6d6fe0359c0`.

Fresh-start conditions: rebuilt this checkout with `npm run build-cli`; launched
Studio from it with `node ./dist/cli/pokie.js --no-open`; used a new
`XDG_CONFIG_HOME` and a new Chromium user-data directory.  No installed
self-dependency was launched.  The initial fresh profile did not reach rendered
content before the harness was repaired; it produced no rendered product error.
The second (and final permitted) fresh profile completed the following rendered
preflight observations:

- Recommended project: created, saved, closed, and reopened from Studio's fresh
  registry.  Layout/payline editing saved; `A` was made wild and `K` scatter;
  both selected a PNG via the visible native picker.  The reopened model rendered
  both special labels and artwork.
- Literal strips were rendered.  The per-reel generated-reel modeler was opened;
  it exposed counts, locked positions, spacing/occurrence constraints, and stack
  rules.  One spacing constraint and one stack rule were added in its unapplied
  preview and then deliberately discarded, because generated counts were not
  configured and Studio correctly warned that the stack required occurrences.
- Play created a real session.  One spin settled with no win; rendered `Find any
  win` then settled a 20.00x winning round (line Q plus scatter K).  Simulation
  completed 100 rounds and rendered RTP/results.  Replay loaded that recorded
  winning session round with its full artifact and win details.
- Exact Outcome Library generation completed (1,024 outcomes); Stake Engine
  Export completed (4 files).  Generated output trees are intentionally absent
  from this evidence commit.

The complete P6V-03 scope was not reached: Random and Blank creation, a saved
generated-reel configuration, paytable/bets/modes/mechanics edits, and the
required second uncoached cold-start exploration could not be performed after the
first launch was consumed by the driver/readiness repair.  This is a driver
inconclusive result, not a rendered product finding.

Representative rendered screenshots:

- `symbols-wild-scatter.png` — SHA-256 `8ba5d9c394132f717f4519da44c22d4ef3cdb0310c352457eadcedc6b21a526b`
- `play-round.png` — SHA-256 `08caab6959ad4a1fbb0a1e6823b6e59f05030011ad29598e928fb8b786a9496d`
- `outcome-stake-export.png` — SHA-256 `245ab5ee63117abd4ec6f7e951b5a2571714885fb1ed0bfe205fd33d8230abd8`
