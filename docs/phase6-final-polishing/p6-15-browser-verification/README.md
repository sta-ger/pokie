# P6-15 independent browser verification — passed

Candidate: `b087a690df3c6cc450ef1fab5de7f0a8766b2372`.

A fresh local Studio server and fresh Chrome profile were started from this
candidate. The Vite Studio client was driven only with rendered mouse/keyboard
controls: **New Blueprint → Blank → advanced JSON mode → Create Project**,
then the visible paging and repeat/run controls. No Studio API, DOM/state
injection, or pre-populated history was used.

The entered deterministic fixture has six literal reels of 300 stops, 48
symbols, 192 paytable rows, and four paylines.

| Rendered surface | Terminal visible state | Elapsed | Browser observation |
| --- | --- | ---: | --- |
| Game Model | positions 200–299 of 300 | 5.93 s | 4,889 DOM nodes; 103.9 MiB JS heap |
| Reel Strip Modeler | Reel 6 symbols 201–300 of 300 | 2.26 s | 4,454 DOM nodes; 104.8 MiB JS heap |
| Simulation | Showing runs 101–150 of 150 | 142.8 s | 739 DOM nodes; 86.7 MiB JS heap |
| Replay | Showing replays 201–250 of 250 | 138.9 s | 987 DOM nodes; 89.1 MiB JS heap |

The public, server-backed histories retained the requested 150 simulation
reports and 250 replays; both terminal pages were reached through their visible
50-item pagers. `final-replay-page.png` is the sole representative capture of
the terminal Replay state (SHA-256
`e125ace4bea261bd326720ed6ff281898ce04f698d840aac25f59f35cd0c4cca`).
