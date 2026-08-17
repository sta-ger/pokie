# Independent host rerun — candidate `667f614b`

The candidate was built locally with Node `v24.18.0`, packed, and installed
into a generated `fixture-slot` package. A fresh Chrome session drove visible
controls only.

Passing subset: generated package `npm start`, Studio Play, and Studio Replay
all rendered `fixture-round`, round 1 as the same 3×3 grid
`A C A / A A C / A A A`, with stake/bet 1, credits 1004, win 5, and 5×.
The Studio surfaces visibly show 5.00 (5.00×); the standalone Player formats
the same whole-number values as 5 and 5.

Finding: the real public `pokie-examples` UI was started against this
candidate's packed `pokie` dependency and exercised via its visible Play
button. It renders only its own 5×4 Simple video-slot game and exposes no
fixture-slot picker, fixture-round seed control, or round-artifact import.
It therefore cannot render the requested seeded fixture round through its
public workflow.

Key files:

- `08-browser-workflow-terminal.log` / `browser-transcript.txt` — browser action transcript for generated Player, Studio Play, and Replay.
- `10-` through `12-` screenshots, rendered text, and rendered grids — the matching seeded round.
- `10-pokie-examples-browser-terminal.log`, `pokie-examples-browser-transcript.txt`, and `13-` screenshot/text — the live companion UI and the missing fixture controls.
- `01-`, `02-`, `04-` through `07-`, `09-`, and `09a-` logs — build, install, and local-server lifecycle.
