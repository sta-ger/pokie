# P6-06 independent Studio browser rerun

Candidate: `4375e57961334d5c7ffdea9e4e9588baf895b691`.

This is a real browser run against a fresh local Studio process serving this
candidate's Node 24 build. CDP was limited to locating rendered controls,
dispatching normal mouse/keyboard input, reading rendered text, and taking
screenshots; it did not call Studio APIs or alter DOM/application state.

- `01` establishes the isolated existing source: literal Reel 1 plus generated
  weight and count reels.
- `02` records the literal reel preview.
- `03` records the inline invalid-count recovery diagnostic.
- `04` records the repaired generated/counts draft plus the UI-authored stack.
- `05` records generated diagnostics and stop-window preview; `05b` records
  Done/Use changes followed by the common Reels Save.
- `persisted-representation.json` and `persisted-blueprint.sha256` record the
  authored disk representation after Save: Reel 4 has `A: 5`, derived length
  35, and a persisted `stack` constraint.
- `06` is from a replacement Studio process and replacement Chrome profile,
  showing that persisted count/stack representation in the public Game Model
  editor.

`workflow-browser-transcript.txt`, `restart-browser-transcript.txt`, the
browser terminal logs, Chrome version records, and Studio terminal logs provide
the execution transcript. `reel-modeler-browser.mjs` is the retained browser
driver. `p6-06-build-terminal.log` retains the initial host Node 18 attempt;
Vite required the installed Node 24 runtime used for the successful Studio
build and rerun.
