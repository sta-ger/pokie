# Rendered cancellation/recovery workflow

Run: 2026-09-09T22:32Z, fresh Studio and Chromium profiles.

| Surface | Ready → one action → local terminal observation |
| --- | --- |
| CLI | Candidate CLI built the external 1,000,000-combination package. Its `generate --exact --resume … --progress` emitted `progress 5000 / 1000000`; one SIGINT exited 130 with checkpoint present, no destination, and no staging. One public `generate --resume` then exited 0, published the library, consumed the checkpoint, and left no staging. |
| Studio load | `Show advanced options (file and JSON tools)` → visible `Load from path` accepted and rendered the external blueprint path → `Load` rendered game name `PC-20 Cancellation Slot`. |
| Studio workspace | The loaded design rendered its actual `Save game` control → one activation → workspace rendered with `Build/Export`. |
| Studio cancel | `Generate exact outcome library (base)` was enabled → activation rendered `Generating outcome library: 425000 / 1000000 …` and `Cancel generation` → one cancel rendered `Generation was cancelled at 710000 / 1000000. No incomplete library was published.` plus `Resume exact generation`. |
| Studio resume | `Resume exact generation` was enabled after cancellation → one activation → rendered `Generated 8 outcomes for mode "base" using exact (RTP 48.40%) into outcomelibrary.`; the cancellation/recovery surface was absent after success. |

The first driver failure was repaired in the persistent harness before this
launch: native typing now targets the same visible Chromium tab that CDP
drives, waits for the advanced disclosure's input, scrolls the control into
view, and verifies the rendered value before Load. The two representative
screenshots are `screenshots/studio-cancelled.png` (SHA-256
`b7d53674e4316e7b15063a46bbc7bad0e95afc830b4b769a32f1ecb09c1e8b90`) and
`screenshots/studio-resumed.png` (SHA-256
`19c728f3307f4d9c8b3189b917fc63fda845427b4f0365db2b536d5c2c574b94`).
