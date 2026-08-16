# P6-05 independent host verification — passed

Candidate: `d200dc2d41f5ae982e1bbd58fd8db46fa4e57326`.

`fully-verified-rerun/` records an isolated run against a freshly built local
Studio and a fresh Chrome profile. The driver located only rendered controls,
clicked their visible coordinates, typed through the browser input channel,
and captured rendered text and screenshots. It did not call Studio APIs or
alter browser DOM/application state.

The focused **Bet 1** field was changed to `11` and its section **Save** was
clicked immediately, so the Save click supplied the field blur. Rendered View
Mode then showed `Available bets: 11, 2, 5, 10`. Layout, Reels, Paytable,
Bets & Modes, and Mechanics persisted through a browser reload and through a
new Studio process plus a new Chrome profile.

Evidence map:

- `build-terminal.log` — Node 24 candidate build.
- `fully-verified-rerun/workflow-browser-transcript.txt` and
  `browser-initial-terminal.log` — all visible UI actions and observations.
- `01` through `06` screenshots/text — initial state and each saved section.
- `07-after-browser-reload.*` — persisted values after reload.
- `08-after-fresh-studio-and-browser-restart.*` and
  `fresh-restart-rendered-terminal.log` — persisted values after fresh Studio
  and browser restart, including Rows, Reels generation mode, A x3 payout,
  available bets, and free-game award.
- `workspace/blueprint.json` and `persisted-blueprint.sha256` — saved artifact.
