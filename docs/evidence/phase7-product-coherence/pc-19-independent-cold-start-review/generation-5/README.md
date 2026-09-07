# PC-19 blind cold-start: generation 5

Candidate product source: `778e3d6eec1d7d7a12c29838e005ee16a0b8ce26`.
The checked-out commit is an evidence-only descendant (`aad05c60dcef225e7cb8e60ed14d302343fb5206`); its diff from the candidate changes only the PC-19 evidence directory.

## Fresh public run

On 2026-09-07, the verifier started Studio from this checkout with
`node ./dist/cli/pokie.js --no-open`, using a new Studio registry and a new Chromium profile. The visible workflow recorded the following action-local results:

| Surface / role mission | Rendered result |
| --- | --- |
| Designer | Starter game was created and the editable workspace rendered valid. |
| Player | New Play session accepted `Spin`, showed `Spinning…`, then its own `Round complete` terminal card. |
| Analyst | `Run Simulation` rendered `queued — 0/10000`, then a completed RTP summary. |
| Replay | Replay surface rendered after the settled round and exposed its fresh-forward replay choices. |
| Release / artifact producer | Exact outcome generation completed, then TypeScript package, Stake Engine export, and PAR sheet builds each rendered their own successful `Built to …` result. |
| Package consumer / player parity | The newly built TypeScript package opened as a read-only playable project; a new local session again showed `Spinning…` followed by `Round complete` (a 2.00 win). |

No action-local product error was rendered in that run. The only first-run selector ambiguity was repaired in the harness and independently rerun: after repair, each build control was scoped to its rendered artifact card and completed successfully.

The retained images are representative UI proof only; the full transient browser profile, Studio project/output trees, and raw transcript were deliberately discarded.

| File | SHA-256 | What it shows |
| --- | --- | --- |
| `build-export.png` | `2d94d39377ddd7020f25545eaadaec7214bbfdfbfc3b2a7b7ffee77d8db9e6b1` | Build/Export workspace from the fresh candidate run. |
| `package-open.png` | `fed4b432fe3ad1dbecf7f3d9600702b090b3b34d678278835a9f615bb3b325ea` | Built TS package reopened in Studio as a playable, read-only project. |

## Gate result

This evidence establishes the reachable main Studio workflow and its primary artifact lifecycle, but it does not establish the full immutable charter's separate CLI parity, examples-player parity, finding-register audit, and independent remediation-delta gate. It therefore supports an **inconclusive**, not a PASS, result; it records no confirmed product-coherence defect.
