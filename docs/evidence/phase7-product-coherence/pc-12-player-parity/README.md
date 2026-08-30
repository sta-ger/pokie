# PC-12 exact-candidate player-parity verification

Verified candidate `eaaf65c4b1360639a83a69e6300eae7c41d20b8f` on 2026-08-30.
The candidate CLI was built from this checkout with `npm run build-cli`; Studio was
then launched once from this source checkout by the controller-owned
`PC-12-f3f5a0e3545c130b/current.mjs` harness.  The runner packed that build with
lifecycle scripts disabled, installed the resulting archive into a fresh copy of
`/home/stager/Work/sta-ger/pokie-examples`, and recorded that
`pokie/client/player` resolved from that isolated install.

`current-run/parity.json` records the deterministic free-games fixture identity,
desktop `1280x800` and narrow `390x844` browser sizes, SHA-256 checksums of four
canonical-player captures, and passing semantic, computed-style, layout, overflow,
and pixel-comparison results.  The four PNGs are the minimal paired desktop and
narrow captures; `TRANSCRIPT.txt` is the rendered interaction record, including
win, feature, hover, selection, inspection, recovery, reset, and project-switch
coverage.  `CLEANUP.txt` records that the isolated consumer was removed and all
three local service/debug ports were clear after the run.

The separate companion whole-file result is in `UI-TEST.txt`: one suite and two
tests passed from the exact clean examples checkout.  No generated consumer,
profile, package archive, or raw process log is retained.
