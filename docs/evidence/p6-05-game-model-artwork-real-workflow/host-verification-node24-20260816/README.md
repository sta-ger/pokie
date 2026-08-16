# P6-05 independent host verification — passed

Candidate: `e404d4ad26d298864c8105e89b42b4a1a21cc809`.

The candidate was rebuilt with Node `v24.18.0`, then exercised through a new
local Studio process and fresh Chrome profiles. The browser driver only located
rendered controls, sent physical-coordinate mouse and browser-keyboard input,
navigated the browser address bar, read rendered text, and captured screenshots.
It did not call Studio APIs, inject DOM/state, or use test-only workflows.

## Result

- Symbols Save visibly retained `WILD_FINAL` and its declared PNG after a
  70-second overlapping-refresh settle window (`03-symbol-save-after-settle.*`).
- Game basics saved; Layout, Reels, Paytable, Bets & Modes, and Mechanics each
  exercised their visible edit/cancel/discard paths (`browser-terminal.log`,
  `remaining-terminal.log`, and screenshots).
- A saved `FALLBACK` symbol without artwork visibly rendered as its canonical
  text instead of a broken image (`04-png-fallback.*`).
- Browser address-bar navigation rendered the declared PNG and denied an
  undeclared traversal asset without source disclosure (`06-undeclared-artwork-denied.*`).
- A full browser reload and then a new Studio plus new Chrome instance retained
  the saved `WILD_FINAL` model and artwork (`07-after-browser-reload.*`,
  `08-after-studio-restart.*`).

`persisted-blueprint-after-ui-save.json` is the immutable post-workflow copy of
the real fixture; `persisted-artifact-terminal.log` records its checksum match
with the working persisted Blueprint.

## Evidence map

- `browser-terminal.log` and `remaining-terminal.log` — rendered-control
  transcript and terminal record.
- `03-symbol-save-after-settle.png` — visible authoritative success after
  overlapping refreshes settle.
- `04-png-fallback.png`, `06-undeclared-artwork-denied.png` — artwork fallback
  and denial.
- `07-after-browser-reload.png`, `08-after-studio-restart.png` — persistence
  across lifecycle boundaries.
- `build-terminal.log` — successful candidate rebuild provenance.
