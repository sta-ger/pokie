# P6-08 canonical Player runtime parity

This is the bounded record of a successful generated-package and Studio
deterministic-round check for candidate
`e00e80180b90292551e19e7a90a5e9b624923345` (Node `v24.19.0`).

The workflow generated the `fixture-slot` package from the fixture Blueprint,
installed the candidate package, and launched its `npm start` Player surface.
The browser then exercised rendered controls only: Player Spin/Paytable,
Studio Play with seed `fixture-round`, and Studio Replay of round 1 with the
same seed.

Retained evidence:

- `runtime-transcript.txt` — concise successful browser and CLI observations.
- `20-generated-package-npm-start-player.png` — representative generated
  package Player surface.
- `21-studio-play-seeded-round.png` and
  `22-studio-replay-seeded-round.png` — representative matching seeded rounds.
- `parity-checksums.txt` — stable checksum of the shared deterministic result.

The Play and Replay result is seed `fixture-round`, round 1, stake `1.00`,
screen `A C A / A A C / A A A`, and total win `5.00 (5.00x)`.

Generated trees, packed archives, process files, exhaustive inventories,
developer-tool dumps, and superseded or failed attempts are intentionally not
retained.
