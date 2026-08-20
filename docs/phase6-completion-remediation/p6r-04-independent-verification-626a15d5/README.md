# P6R-04 independent host verification

Candidate: `626a15d5059c9b814c2d04adddbfc3bc28d28c92`.

## Result

The public rendered workflow reached create/open, Play, Simulation, and Replay.
It fails at Build/Export: the project created through the visible recommended
Random flow cannot generate its canonical outcome library, so the dependent
Stake Engine Export cannot run. This is a material P2 workflow block.

The single complete-file targeted command covered all eight persisted paths.
It produced 7 passing suites and 1 failing suite: 4 replay-workflow assertions
failed because their broad `Show advanced details` query now matches multiple
visible controls. See `targeted-results.txt`.

## Boundaries

- Built this candidate once, then launched Studio exactly with
  `node ./dist/cli/pokie.js --no-open` on `http://127.0.0.1:3200`.
- Drove visible Chrome controls from the public root route; no private Studio
  APIs, DOM/state injection, or stale `node_modules/.bin/pokie` launch was used.
- `browser-transcript.txt` is concise rendered-control evidence. The transient
  project/output tree, browser profile, full logs, and automation source were
  not retained.

## Screenshots and checksums

| Surface | Evidence | SHA-256 |
| --- | --- | --- |
| Projects desktop | `projects-desktop.png` | `e9c331a2cce835c4d3bfd71c58a44cb2cdc259363522b8377a736142beec30f0` |
| Projects 405px | `projects-405px.png` | `279058fe303467aba47b80f3c71697ce485dc5ee8df928f48535729d54551e4b` |
| Build/Export desktop | `build-desktop.png` | `137ecc8183a147c348e73e2e60c96c269dd3ed816449bc47a84179454dc82b3b` |
| Build/Export 405px | `build-405px.png` | `b199acbed320e2fe1252a27db9cbc203d84c8144ca67170bf5bcbc362d651e26` |
