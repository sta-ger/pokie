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

## Focused harness-recovery addendum (2026-08-22)

The candidate source checkout was rebuilt, then every Studio run used exactly
`node ./dist/cli/pokie.js --no-open` with a new `XDG_CONFIG_HOME` and Chromium
profile.  The first recovery launch rendered the fresh Design Game page but its
non-PTY command channel was closed; it produced no rendered application error.
The harness was repaired in place to use a PTY, serialized its rendered actions,
and retained semantic-prefix controls plus focused native-picker support.

In the subsequent fresh rendered preflight, direct Create Project opened the
recommended Starter Slot workspace.  The visible New Blueprint flow generated
and used the Random blueprint `Royal Grand Stampede` (seed `20260815`) and then
created its workspace.  The visible Blank selection replaced the current
blueprint and correctly rendered four prerequisite validation errors for its
empty id, name, symbols, and paytable; it cannot yet be created until those
user-editable required values are supplied.  The final fresh-profile, uncoached
one-sentence exploration created Starter Slot from the sole obvious Create
Project control and reached the visible Game Model overview and its local Edit
actions without documentation or source inspection.

This recovery consumed its four permitted public-workflow launches.  No rendered
product failure was observed.  It did not complete the remaining saved
layout/payline, generated-reel, paytable, bets/modes, and mechanics edits, so the
full P6V-03 journey remains driver-inconclusive.  See
`recovery-20260822-transcript.txt` for the compact action record.

## Continued focused recovery (2026-08-23)

After one `npm run build-cli`, three further fresh profiles used exactly
`node ./dist/cli/pokie.js --no-open`.  The retained proof files above remained
present and their checksums matched.  The stable harness then created a fresh
Recommended project and saved a rendered Layout edit from 3 to 4 rows plus a
duplicated payline; the Game Model immediately rendered `Rows: 4` and
`Paylines: 4`.  Literal strips were also visibly edited and persisted in a
separate fresh project.

The repaired reel selector reached the visible per-reel modeler, selected Reel
1, and displayed the actual `Literal` and `Generated` controls.  Selecting
`Generated` rendered its count, locked-position, spacing/occurrence-constraint,
and stack-constraint editors.  The native artwork action did not surface a
visible picker window within the bounded wait and Studio showed no local error;
this is retained as a driver/readiness limitation, not a product finding.  A
later harness fill mis-targeted an editor and Studio visibly rejected the
resulting empty reel-strip draft with specific validation errors; it was not
saved and is not a product finding.

No P0, P1, or material P2 was rendered.  Because saved generated-reel,
paytable, bets/modes, mechanics, and the required uncoached journey remain
uncompleted, this independent host result remains inconclusive.

## Focused recovery attempt 1 (2026-08-23)

The retained files and listed SHA-256 values above were rechecked before this
attempt. Three newly isolated profiles launched this source checkout only with
`node ./dist/cli/pokie.js --no-open`. A visible Recommended project saved a
Layout change to 4 rows and 4 paylines. Its rendered per-reel editor reached
Literal and Generated modes; Generated rendered count, locked-position,
spacing/occurrence, and stack-rule controls. A separate fresh profile created
the generated Random `Royal Grand Stampede` project and exercised Blank through
its visible required-field validation. The final fresh profile performed the
uncoached, one-sentence path Create Project → Open Play → New Play session →
Spin and rendered a settled no-win round.

No rendered product error, P0, P1, or material P2 was observed. The harness's
ambiguous form-field target prevented completing and saving a generated reel or
the minimal Blank paytable in the same bounded recovery; paytable, bets/modes,
and mechanics edits therefore remain unverified. The precise compact record is
`recovery-20260823-attempt1-transcript.txt`; this remains a driver-inconclusive
result rather than a product finding.

## Focused recovery attempt 2 (2026-08-23)

The retained checksums again matched and this checkout completed `npm run
build-cli`. Four further isolated profiles launched only
`node ./dist/cli/pokie.js --no-open`. The repaired stable harness used rendered
field metadata and rendered combobox options, rather than ambiguous label
matches. It reached a saved per-reel generated configuration: `A` count 4,
one stack rule, a rendered invalid-spacing diagnostic, its local correction,
and the local success state “Generated successfully” / “Satisfied every
constraint after 1 attempt(s).” Create Project then opened the resulting
Starter Slot. Its visible Game Model also saved a `mode-1` bet mode with cost
multiplier 2. A mechanics draft correctly exposed the free-games award editor;
it was not saved because its fresh model had no eligible scatter symbol.

The fourth fresh profile was the uncoached path Create Project -> Open Play ->
New Play session -> Spin; it rendered a settled 4.00 J-line win. No product
error or P0/P1/material-P2 issue was rendered. Completed Blank creation and a
single saved/reopened project covering every requested editing surface remain
unreached at the launch limit. See
`recovery-20260823-attempt2-transcript.txt` for the bounded exact record.
