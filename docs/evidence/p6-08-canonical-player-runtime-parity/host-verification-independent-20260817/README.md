# Independent P6-08 host verification — finding

Candidate: `c0d98cc22a5346026105c095db7517efbcee5768`.

Result: **P1 finding**. The public browser workflow reached the generated
package Player and Studio Play through fresh local servers and real coordinate
clicks. The generated Player visibly rendered the deterministic `fixture-round`
round (grid `A C A / A A C / A A A`, highlighted A-line, paytable `A=5`,
`B=3`, `C=1`, and post-round credits `1004`). Studio Play rendered the same
round and credits but visibly showed **“Paytable unavailable”**, which fails the
required full-paytable parity criterion.

`01-candidate-studio-build-terminal.log` independently establishes why this is
not a stale-browser-only observation: a fresh Studio TypeScript build fails
because `ProjectDashboardPage.tsx` and `domain/interpret/Replay.ts` read
`ReplayDescriptor.credits`, while the candidate's `ReplayDescriptor` type has
no such field. Thus the repaired source cannot produce a fresh Studio client;
the candidate's packaged client that can be served is the older bundle captured
in `21-studio-play-seeded-round.png`.

Method: `browser-ui-rerun.mjs` uses Chrome DevTools only to navigate, inspect
rendered text, send coordinate mouse/keyboard input to visible controls, and
capture screenshots. It makes no application API calls and never injects DOM or
application state. `browser-transcript.txt` records the actual initial session,
Spin, and Paytable actions. The candidate tarball and generated fixture package
are retained so the run is reproducible; `generated-fixture-slot/node_modules`
is intentionally not evidence.
