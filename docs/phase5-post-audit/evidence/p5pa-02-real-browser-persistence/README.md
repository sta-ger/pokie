# P5PA-02 real-browser persistence rerun

Candidate verified: `52e0f1d9daa240e991af4cf8ab2a98af5fe84a2c`.

The audit built this exact worktree, launched a fresh local Studio on port 4212,
and used a fresh Chrome session to operate the rendered Studio UI only. It
registered and opened the tracked Blueprint fixture, opened **Game Model**,
edited Mechanics' `3x` free-games award from `10` to `12`, and clicked the
rendered **Save** control. Studio was then stopped and started again with the
same isolated registry; a fresh browser session opened the registered project
and showed `3x → 12 free games`.

The initial and reloaded visible-text captures also show the Limits explanation:
`Derived from Bets & Modes' own Available bets above -- edit there to change it.`

Evidence:

- `01-build.log` — exact-candidate production build (exit 0).
- `01-initial-game-model-limits.png` / `.txt` — initial UI: `3x → 10` and the
  Limits explanation.
- `02-after-save-game-model.png` / `.txt` — rendered edit/save result: `3x → 12`.
- `03-after-studio-restart-project-reload.png` / `.txt` — a new Studio process
  and browser session reopened the registered project and still rendered `3x → 12`.
- `ACTION-TRANSCRIPT-save.txt`, `ACTION-TRANSCRIPT-reload.txt` — browser mouse
  and keyboard actions at rendered control coordinates.
- `02-studio-save.log`, `03-chrome.log`, `04-browser-save-terminal.log`, and
  `06-browser-reload-terminal.log` — terminal/browser logs.
- `blueprint-game-model-fixture.json` — the persisted fixture after the UI save.
- `07-terminal-evidence-checksums.txt` — candidate SHA, screenshot checksums,
  and text assertions extracted from the visible captures.

`browser-ui-rerun.mjs` is the CDP action recorder. It locates rendered controls,
then drives them by browser mouse/keyboard input; it does not call Studio APIs
or inject page state.
