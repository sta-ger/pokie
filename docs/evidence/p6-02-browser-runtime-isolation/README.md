# P6-02 browser runtime-isolation evidence

This bounded record retains the final visible-UI finding for candidate
`8e43fb69ce1a50202859c52f2a6be6a88bf8d451` (2026-08-13).

The fresh Chrome workflow opened Project A at its public Play route, played a
round, then opened Project B, created a B session, and used browser Back four
times. The historical A entry was still the unscoped `#/project/play` route
and rendered Project B. This is a **failure** of Back-history isolation for
that candidate. The later repair requires its own fresh browser rerun.

`workflow-transcript.txt` is the concise action/result record.

- `project-a-play-state.png`: Project A's played state.
- `project-b-fresh-play-state.png`: Project B's fresh state after the switch.
- `browser-back-historical-a-route.png`: Project B rendered on the historical
  Project A route.
- `checksums.sha256`: integrity hashes for the retained screenshots.

The `fixtures/` sources are the two small local packages used by the workflow.
No browser profile, cache, PID, process dump, or repeated-attempt archive is
retained.
