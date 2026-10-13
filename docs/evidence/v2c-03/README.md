# V2C-03 verifier continuation evidence

Candidate product identity: `ccd94f427b20ac12f56ac41cc4543634c002e75e`.
This evidence directory contains only the three representative images from the
2026-10-13 fresh-profile continuation; the complete transcript remains in the
authorized runtime harness and is not committed.

## Reused whole-file receipt

Controller receipt:
`/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/b4e1e800b3cb1057206c1dba/result.json`.
It records the one authorized complete-file command, clean `candidate_before`
and `candidate_after` at the candidate SHA, exit 0, four passing suites and
152 passing tests. Terminal Jest lines are retained in the receipt's authorized
`stdout.log` and `stderr.log` siblings. No test, packaging, build, or official
full gate was run by this continuation.

## Rendered continuation

Runtime transcript:
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-03-dcd58bb683a9bf5d/run-2026-10-13T06-16-10-947Z/transcript.json`.
The launcher used fresh browser storage and the retained authenticated Studio
application profile (`config` and `Documents` are recorded in that transcript).
It opened the existing overscan JSON fixture, created one Play session with
seed `v2c03-overscan-20261013`, and settled exactly one Spin for stake 1 and
payout 3000.00. It then selected that action's rendered `Session 1 — Round 1`
row in Replay; no spin was repeated.

| File | Rendered observation | SHA-256 |
| --- | --- | --- |
| `replay-session-spin-desktop.png` | Desktop Replay Session Spin record and complete recorded-artifact card. | `2cfbaae2032f6eb63f4fe483c4b2cbfaa80b676417155f73b1bfd44d73502dd9` |
| `replay-full-artifact-desktop.png` | Desktop advanced inspector; rendered state geometry starts with generated 5×7 and visible 1.25/2.5. | `1a221f05ebbdaf57d1cd9223518b1ccb6b7a61eca8a43c6030c65e884068efa1` |
| `replay-session-spin-mobile.png` | 390×844 Replay inspector; selected recorded round and its viewport grid begin in frame. | `d1ad18def62b35fbde206797000fbefe8233fde6bbb0b46a7b1d4ae447351711` |

The rendered Full artifact showed `generatedScreen`, the same geometry, one
canonical step with its own generated screen/geometry, and original hash
`sha256:a784f25adcbdd26d10397bb8bea6473765065f22a2f2e94c9ebc6450948bed02`.
Its visible screen is 5×3, with mapped scatter positions and payout 3000.00.

Independent visual assessment: the mobile screenshot visibly retains a
three-row viewport with clipped partial-row styling at its edge; the desktop
session and advanced-artifact captures are legible and correspond to the same
recorded round. These images do not establish the still-missing standalone
surface, so this is continuation evidence rather than a passing acceptance
claim.
