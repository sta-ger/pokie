# P6-08 canonical Player deterministic-round parity

The public `pokie-examples` index now exposes **Open deterministic round**.
That page creates the same `fixture-slot` session as the generated package:
`fixture-round`, round 1, stake `1`, screen `A C A / A A C / A A A`, A-line
win `5`, credits `1004`, and multiple `5x`. Its visible **Play** button is the
normal Player workflow; no DOM or application-state injection is used.

The representative surfaces below use the shared `renderPlayerRound` entrypoint:
generated package Player, Studio Play, Studio Replay, and the public examples
fixture page.

- `fixture-slot.blueprint.json` — minimal deterministic fixture input.
- `runtime-transcript.txt` — concise generated Player, Studio Play/Replay,
  public examples, and CLI observations.
- `20-` through `23-*.png` — one representative screenshot per surface.
- `parity-checksums.txt` — fixture, round, and screenshot checksums.
