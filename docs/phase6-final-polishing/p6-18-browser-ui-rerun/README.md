# P6-18 independent cold-start Studio rerun — finding

Candidate: `b68341397529acf0187c421af272cc3485bd3fb7`
Date: 2026-08-19 (Europe/Warsaw)
Finding: `p6-18-mathematician-cold-start-workflow` (P1)

## Result

A fresh Studio/client launch from this candidate reached the real visible Studio
workflow. The verifier used only rendered controls and browser mouse/keyboard
input; no DOM or application state was injected. The run completed Game Model
editing and save/reopen, Play, Simulation/RTP, and Replay. It then blocked at
Build/Export: one click of **Generate outcome library (base)** left that button
disabled for more than 40 seconds, with no rendered progress, completion, or
error feedback. Stake Engine Export remained unavailable because it requires
that outcome library. Per the bounded-rerun rule, this interaction was not
retried.

## Cold-start transcript

1. On **Design Game**, Studio asked: *Choose a playable project to start with,
   or explicitly begin from a blank blueprint.* Available answers were
   **Recommended**, **Blank**, **Random**, and **Load existing**. I chose
   **Recommended**. The next rendered instruction said Studio checks the model
   automatically and offered **Create Project**.
2. I created the managed project, opened **Game Model**, selected the first
   visible **Edit** (**Game basics**), changed the game name to *Valera
   Mathematician Slot* and added a description, then chose **Save**.
3. I chose **Close project** → **Projects** → the first-row **Open**. The
   reopened project displayed the saved name and id `valera-mathematician-slot`.
4. In **Play**, the only startup choice was **New Play session**; a visible
   **Spin** settled a real no-win round (screenshot 2).
5. In **Simulation**, the required **Rounds*** input was set to `25` through
   the browser keyboard. **Run Simulation** completed a `25/25` report with
   rendered RTP `24.00%` (screenshot 3).
6. In **Replay**, I selected the visible **Session Spin** source and its one
   rendered session entry. Studio loaded and inspected the recorded Play round,
   including `Stake 1.00` (screenshot 4).
7. In **Build/Export**, the visible Outcome library and Stake Engine cards
   explained their prerequisite relation. Clicking **Generate outcome library
   (base)** caused the blocked state above (screenshot 5). The relevant
   remediation is to restore a terminal success/failure/progress state, then
   rerun this Build/Export → Outcome library → Stake affected workflow.

## Evidence checksums

| File | SHA-256 |
| --- | --- |
| `01-game-model-saved.png` | `1394c3b0bd5cfcc25a7daf20b12e0e6bbed83a6a30a46ae37fb6f74e88bca0b2` |
| `02-play-settled.png` | `4275a84ca7c16d1bae7bbd99a5027d6394f695e67365fca41d217e0b662f5bab` |
| `03-simulation-rtp.png` | `598e627cc0fa81c7d7eb78c92acb1b856b6bb814b9ead338f8121c49e9707e74` |
| `04-replay-session-spin.png` | `d25217bd09d7eb29453a65ec13e113743d3766a34021802ca129f23d9e9baf03` |
| `05-build-outcome-library-stalled.png` | `de49794b2459a2de46cb60eda7716ca625b20e5b148f51d09fbdf851bfe24714` |
