# P6-20 independent host verification — finding

Candidate: `147e182de681431c4c73393069c4206ae7fb216d`.

The required read-only companion checkout remained clean at
`6bb67dee3d2e8e98bab754e1000019701a17266b` before and after this run. The
candidate was built from this checkout; public `pokie build` produced a
temporary Fixture Slot package, public `pokie dev` served it, and a temporary
copy of that exact companion checkout installed the candidate tarball and ran
its public `npm start` workflow.

## Passed rendered Player surfaces

Using only browser navigation plus coordinate mouse/keyboard input, the public
companion Fixture Slot and candidate-built package/dev Player both rendered
`fixture-round`: `A/C/A | A/A/C | A/A/A`, credits `1004`, win `5`, `5x`, and
the `A`/`B`/`C` paytable symbols.

## Finding — P2

A fresh Studio was launched exactly as
`node ./dist/cli/pokie.js --no-open`. At a 1050 px browser viewport, the
visible Projects workflow accepted the generated package location and the
mouse click on **Detect**, but did not finish within the 60-second UI wait.
The later rendered screen reported that it had detected the package, yet the
bounded workflow did not reach Register/Open, Studio Play, Replay, or the
close-and-reopen recovery path. This makes the final Studio parity and Projects
recovery criteria unverified and exposes a visible Projects detection latency
that blocks normal continuation.

`projects-detecting-timeout.png` is the representative rendered proof. Its
SHA-256 is `a15bc47bf5161310cf56d22e92b20195371efe51f3d10f788738d2a584792da2`.

No generated package, tarball, browser profile, automation source, or raw log
is retained.
