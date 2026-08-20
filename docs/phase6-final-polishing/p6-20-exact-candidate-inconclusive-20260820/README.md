# P6-20 exact-candidate host rerun — inconclusive

Candidate source was `147e182de681431c4c73393069c4206ae7fb216d`; this
evidence commit is documentation-only, and the non-documentation diff from the
candidate to the pre-evidence checkout was empty. The supplied read-only
`pokie-examples` checkout was clean at
`6bb67dee3d2e8e98bab754e1000019701a17266b`.

The candidate was rebuilt before the run. A candidate-built archive was used
both by a temporary copy of the exact companion checkout and by a package
generated through the candidate's public `pokie build`; the latter was served
through its public `pokie dev` entrypoint. Physical visible mouse/keyboard
input rendered the deterministic `fixture-round` grid `A/C/A | A/A/C | A/A/A`
on both Player surfaces.

A fresh Studio was started from this source checkout exactly as
`node ./dist/cli/pokie.js --no-open`. Through its rendered Projects UI, the
generated package was detected and registered, and the resulting **Open**
action rendered. The display server was then terminated externally before the
Open click, Studio Play, Studio Replay, and the close/reopen recovery could be
completed. This is a readiness interruption, not a rendered product failure;
the missing criteria remain unverified.

`ACTION-TRANSCRIPT.txt` is the complete retained proof. No generated package,
archive, browser profile, automation source, or raw log is committed.
