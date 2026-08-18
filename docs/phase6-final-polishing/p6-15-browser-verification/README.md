# P6-15 independent browser verification — finding

Candidate: `17dbedb12dc18f7898f76ad34b07eba04b3dbf36` (2026-08-18).

I started a fresh local Studio from this candidate and a fresh Chrome profile,
then drove only rendered Studio controls with mouse/keyboard input. In Studio I
created the deterministic fixture through **New Blueprint → Blank → JSON →
Create Project**: six literal `reelStripGeneration` reels of 300 stops, 48
symbols, four paytable rows per symbol (192 rows), and four six-column
paylines. No project API was called directly and no DOM/application state was
injected.

| Rendered workflow observation | Visible completion / timing | Browser observation |
| --- | --- | --- |
| Game Model | Full strips reached Reel 1 positions 200–299 after two **Next 100** clicks (795 ms). | 18,323 nodes; 29.1 MiB used JS heap. |
| Reel Strip Modeler | Reel 6 reached symbols 201–300 after two **Next 100 symbols** clicks (2,686 ms). | 20,708 nodes; 46.8 MiB used JS heap. |
| Simulation | Tab opened in 541 ms; 21 one-round jobs were completed through **Run Simulation** then **Repeat simulation**. | 1,919 nodes; 9.9 MiB used JS heap after the list refresh. |
| Replay | Tab opened in 524 ms; 21 one-round jobs were completed through **Load**, **Run again**, then **Run again with the same parameters**. | 4,192 nodes; 22.5 MiB used JS heap after the list refresh. |

The first two workflows remained responsive and their final positions were
reachable. The history acceptance criterion does not hold in the public
workflow: after 21 completed Simulation runs, and again after 21 completed
Replay runs, Studio rendered only entries 1–20 of 20. The captured Replay UI
shows that terminal state; both 50-entry pager buttons are disabled, so a
large/long history and its final paged position cannot be reached.

Root cause confirmed in the candidate: the production in-memory repositories
retain at most 20 terminal jobs per project (`DEFAULT_MAX_TERMINAL_JOBS_PER_PROJECT`
and `DEFAULT_MAX_TERMINAL_REPLAYS_PER_PROJECT`), whereas the client paging
fixture requires 150 simulation reports and 250 replays. The component tests
use injected lists and therefore cannot demonstrate that public Studio can
produce or retain those histories.

Representative screenshot (451 KiB):
[`public-history-retention.png`](public-history-retention.png), SHA-256
`792b14710271619461bb6cb3b6c0a98cd003e89f7e09fe91bcc8337a9fa714e6`.
