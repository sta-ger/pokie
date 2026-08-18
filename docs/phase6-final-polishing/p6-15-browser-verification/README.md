# P6-15 independent browser verification — passed

Candidate: `b087a690df3c6cc450ef1fab5de7f0a8766b2372`.

A fresh built Studio server and fresh Chrome profile ran this exact candidate.
The rendered UI alone created the fixture (**New Blueprint → Blank → advanced
JSON → Create Project**) and drove all paging/repeat actions. No Studio API,
DOM/state injection, or pre-seeded history was used.

The deterministic model has six literal 300-stop reels, 48 symbols, 192
paytable rows, and four paylines.

| Rendered surface | Terminal visible state | Browser observation |
| --- | --- | --- |
| Game Model | positions 200–299 of 300 | 4,904 DOM nodes; 28.3 MiB JS heap |
| Reel Strip Modeler | Reel 6 symbols 201–300 of 300 | 4,450 DOM nodes; 43.0 MiB JS heap |
| Simulation | Showing runs 101–150 of 150 | 735 DOM nodes; 12.1 MiB JS heap |
| Replay | Showing replays 201–250 of 250 | 989 DOM nodes; 14.1 MiB JS heap |

The public server-backed histories retained all 150 simulation reports and 250
replays. Both terminal pages were reached through their visible 50-item pagers.
`final-replay-page.png` is the sole representative terminal Replay capture;
SHA-256: `be427289f467ebd24f6d4ffba8ca6551ee76bef8f06a46a1f2a92196f2c6aaf7`.
