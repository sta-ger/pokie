# P6V-06 exact-candidate hard closeout — finding

Candidate verified: `88894fdb1a300978ccdcee1e9ae831de5423c9e1`.
Companion inspected read-only: `1e2c8c00457f3af389c0168432c08e63ca441465`
(clean). The candidate is an evidence-only descendant of
`782810b91be076b254ae110e0037725101fb90c1`: its intervening paths are only
this final record and the independent audit record.

The retained 405px Studio run used the candidate build and exactly
`node ./dist/cli/pokie.js --no-open`. Its concise rendered transcript is
[`transcript.txt`](transcript.txt). It reached the listed Valera model, Play,
Simulation, Outcome Library, Stake Export, close and reopen states. Replay had
no rendered Inspect/Reproduce action, so it remains unproved.

This recovery invocation built the candidate once, restored the generated
barrel drift before recording evidence, and used two fresh isolated public
workflow runs. The first completed the physical native-picker PAR/XLSX round
trip. The repaired second run rendered the same deterministic Player result on
candidate CLI Replay, candidate-built package `npm start`, candidate Studio
Play, candidate Studio Replay, and a byte-for-byte runtime copy of the exact
companion public client. The first Player continuation attempted a second
Studio while its PAR Studio still held the listener; the resumed matrix fixed
that driver boundary. Its final legacy comparison tried to read an absent CLI
`winningPositions` field *after* all five surfaces had rendered. That legacy
post-observation error is driver-only; however, the values it had already
captured expose the separate P2 Player-parity finding below. No new screenshot
was needed for that already-represented surface class.

## One-to-one final map

| Immutable step | Exact-candidate evidence now available | Closeout verdict |
| --- | --- | --- |
| P6V-01 retained-evidence hygiene | Current retained scopes: 131 Markdown/text records, 15 relative links, 0 broken links. The P6-10 index now names only its present browser transcripts and five screenshots. This directory has four files, 510,513 bytes before this concise update; all files are below 5 MiB and no scoped file exceeds 5 MiB. | **Partial map only.** Static hygiene and exact-tree checks passed, but the unified final criterion also requires fresh P6V-02–04 proof and cannot clear the Player P2 below. |
| P6V-02 Design/UX | Fresh 405px model and Build/Export states are retained below; the historical complete desktop/cold-start inventory names `540a60ebd2a1f3a5c9d4cdf0bfcde96f8085b4b0`, not this SHA. | **Not complete.** No fresh full Design/UX journey. |
| P6V-03 Valera Mathematician | Fresh candidate-bound model, Play, Simulation, Outcome Library, Stake Export, and reopen journey is retained. | **Not complete.** Replay offered no rendered inspect/reproduce action. |
| P6V-04 Valera Producer | The retained Producer record names `bc810a69dba8ee4e036906fd9c10dda9fefb5680`. | **Not complete.** No fresh Producer journey ran in the two-launch budget. |
| P6V-05 PAR/XLSX and Player | Fresh physical native PAR import/edit/save/export/re-import had equal canonical JSON. Candidate CLI, Studio Play, Studio Replay, and exact-companion client rendered `[[A,C,A],[A,A,C],[A,A,A]]`; the candidate-built package client instead rendered `[[B,B,A],[B,A,A],[C,B,A]]` for the same `fixture-round`, round 1. | **P2 finding.** Package-client Player parity is broken, although both displayed win 5 and the same paytable/bet. |

No P0 or P1 was observed, but the P6V-05 Player mismatch is a material P2.
P6V-02–04 also remain incomplete, so this is not approval evidence.
`check:release`, packaging, push, publication, and Drive round trip remain
controller-owned and were not run or claimed.

## Retained files

| File | SHA-256 | Purpose |
| --- | --- | --- |
| `transcript.txt` | `a03517a91ebe2983201f548d7a68954e183b16c6477345b73fa9ba26b9de87e9` | Concise exact-candidate rendered and tree-state record. |
| `03-model-mobile-405.png` | `62b00117c93f2f0d2a973697f637f342688627075a80f4b282c49b05e8bc7397` | 405px model/reels/paytable/bets state. |
| `10-stake-export-mobile-405.png` | `f5d6fd34be55e69a87494e33f5103eae98ede9f8c77f57ed46eaeba48f004c1f` | 405px successful Stake Engine export state. |

No generated project/output tree, browser profile, harness, PID file, raw log,
or generated workbook is retained.
