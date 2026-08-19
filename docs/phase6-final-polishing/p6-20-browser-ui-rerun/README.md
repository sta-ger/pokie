# P6-20 independent Player-parity rerun — finding

Candidate `00b814a0a764f21933d04d907a32602c599b6365` was rebuilt locally under
Node `v24.18.0`. A generated `fixture-slot` package was built from the tracked
fixture blueprint, with the rebuilt candidate tarball installed into both the
package and a disposable `pokie-examples` copy. The visible browser used a
fresh Chrome profile and only rendered-control coordinate clicks and keyboard
entry; no application API calls, DOM/state injection, or retained generated
trees were used.

The real generated-package `npm start` Player completed the deterministic
`fixture-round` round one: grid `A/C/A | A/A/C | A/A/A`, highlights
`0:0/0:1/0:2`, paytable `A=5/B=3/C=1`, credits `1004`, win `5`, and 5x payout.

P1 finding: in the real public implicit-project Studio workflow, Studio Play
accepted `fixture-round` through its rendered **Seed (optional)** input and a
rendered **New Play session** click. It then remained on the start form for 60
seconds without a session, a loading state, or an error. The deterministic
Studio Play round therefore could not be reached. Studio Replay and the
remaining cross-surface checks were not retried after this product failure.

Only this README and the concise action transcript are retained.
