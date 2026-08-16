# P6-05 final workflow verification

**Reviewed record:** `a80816fe8ba7f3d94c32ce1527c00f7dd7e35516` (`evidence: verify P6-05 corrected section saves`).
The browser workflow was run against its implementation parent
`d200dc2d41f5ae982e1bbd58fd8db46fa4e57326`; this record is the concise,
passing evidence committed by the reviewed record.

A fresh local Studio build and a fresh Chrome profile were driven exclusively
through rendered controls and browser input. No Studio API or DOM state was
injected.

- `05-bets-blur-saved.*` shows **Bet 1** changed to `11` and saved by the
  immediately following Save click (which supplied the field blur); View Mode
  reports `Available bets: 11, 2, 5, 10`.
- `07-after-browser-reload.*` shows the saved Layout, Reels, Paytable, Bets &
  Modes, and Mechanics values after a browser reload.
- `08-after-fresh-studio-and-browser-restart.*` shows those values after both
  the Studio process and Chrome profile were replaced.

`workflow-transcript.txt` records the rendered-control actions and observations.
`CHECKSUMS.sha256` checks every retained artifact.
