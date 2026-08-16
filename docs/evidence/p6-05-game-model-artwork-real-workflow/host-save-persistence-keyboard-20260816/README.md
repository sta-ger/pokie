# P6-05 host-side save-persistence verification — finding

Candidate verified: `8a2314ccefe204f118180d24f0759e70c3165c01`.

A Node `v24.18.0` rebuild was exercised against a fresh local Studio and a
fresh Chrome profile. The driver located rendered controls, clicked their
rendered coordinates, and issued browser key-down/key-up text events. It did
not call a Studio API or inject browser/DOM/application state.

## Finding: P1 — Bets & Modes Save does not persist its visible mutation

The same visible workflow successfully saved Layout (`Rows: 4`), Reels
(`Generation mode: Default`), and Paytable (`A`, three matches, payout `5`).
In **Bets & Modes**, it entered `11` into the rendered **New bet amount**
control, clicked the rendered **Add bet** button, and clicked the section's
rendered **Save** button. Studio returned to View mode, but the visible value
remained `Available bets: 1, 2, 5, 10`; the immutable post-attempt Blueprint
also contains that unchanged array.

The same unchanged visible Bets value is captured after a real browser reload
and after a fresh Studio process plus fresh Chrome profile. Because the
required section mutation is lost before persistence, the remaining Mechanics
save is not a meaningful continuation of this bounded all-section persistence
workflow. The acceptance criterion requiring real-Studio Save persistence for
every listed Game Model section is therefore not met.

## Evidence map

- `browser-terminal.log` and `workflow-browser-transcript.txt` — visible
  rendered-control sequence through the failed Bets & Modes Save.
- `02-layout-saved.*`, `03-reels-saved.*`, `04-paytable-saved.*` — successful
  preceding section saves.
- `06-after-browser-reload.*` — Browser reload still renders the original
  available-bets list.
- `07-after-studio-and-browser-restart.*` — fresh Studio/fresh Chrome result
  is likewise unchanged.
- `persisted-blueprint-after-save-attempt.json` — immutable persisted artifact
  after the user-visible Save attempt; its `availableBets` array is unchanged.
- `CHECKSUMS.sha256` — anchors the screenshots and persisted artifact.
