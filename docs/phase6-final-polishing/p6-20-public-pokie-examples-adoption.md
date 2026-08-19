# P6-20 public pokie-examples adoption

The independent finding at candidate
`3b9ef34ee961fffc9895477f390a2c7dbdc4579e` remains preserved in
`p6-20-independent-host-verification-3b9ef34e-20260819/`.

The companion `pokie-examples` public-main adoption commit
`09a0889b8d335eeacbdb277c37376d97de96c268` adds the Fixture Slot entry point
and its canonical `pokie/client/player` rendering path, includes
`fixture-slot.html` in Vite's production inputs, and provides `npm start` as a
Vite development-server command. It also retains the committed fixture tests
that assert `fixture-round` renders `A/C/A | A/A/C | A/A/A`, credits `1004`,
and win `5` through the real Play control.
