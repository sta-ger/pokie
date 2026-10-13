# V2C-03 independent acceptance evidence

Product candidate: `ccd94f427b20ac12f56ac41cc4543634c002e75e`.
This directory is a bounded, independently reviewable subset of the authenticated
runtime evidence. It contains ten representative PNGs (about 669 kB total), no
generated project, profile, browser data, or raw log.

## Reused complete-file result

The controller-owned receipt
`/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/b4e1e800b3cb1057206c1dba/result.json`
records the only required command, with clean `candidate_before` and
`candidate_after` at this candidate SHA:

```text
npm run test:targeted -- tests/cli/commands/ReplayCommand.test.ts tests/generated/GamePackageGenerator.test.ts tests/net/Serialization.test.ts tests/project/ParWorkbookArtifactBuilder.test.ts
Test Suites: 4 passed, 4 total
Tests:       152 passed, 152 total
Snapshots:   0 total
Time:        12.669 s
```

Its authorized `stdout.log` and `stderr.log` siblings have SHA-256 respectively
`d43f99291495fdd015b9cab009d8bfc7bac57c97fcaf3ea8d1b490ebbf25b7de` and
`e5c03bca0e95df2858b543b018eb0cbbae6b7d9a1c3b713cbc57aa2012e5b835`.
No test was relaunched; no package or official full gate ran.

## Fixture, public commands, and runtime records

The deterministic overscan fixture records generated `5×7`, visible
`rowOffset=1.25, rows=2.5`, evaluated `rowOffset=2, rows=3`, and seed
`v2c03-overscan-20261013`. The standalone run used the candidate command
`node ./dist/cli/pokie.js dev <fixture> --port 0 --host 127.0.0.1 --client-port 0 --client-host 127.0.0.1 --no-open`.
It created fresh `config` and `Documents` storage recorded in
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-03-dcd58bb683a9bf5d/run-2026-10-13T07-12-08-051Z/transcript.json`,
then accepted one Start new session and one Spin. Its action-local terminal state
is credits `3999`, total win/payout multiplier `3000`, and mapped scatter win
`3000`. Candidate build receipt and command diagnostics are retained in that
same authorized harness; its compiled-output digest is
`a821f066e3711276431769ab0728f45b713195ea7fd0161e8760e6ee811483eb`.

The prior fresh-profile Studio/Replay observations remain candidate-bound in the
same harness: Studio Play `run-2026-10-13T05-49-50-376Z` and Replay/Full artifact
`run-2026-10-13T06-16-10-947Z`. They use the same fixture and one settled Spin;
Replay records stake `1`, payout `3000.00`, its selected `Session 1 — Round 1`,
and no repeated spin.

## Retained images and independent visual assessment

| Image | SHA-256 | What is independently visible |
| --- | --- | --- |
| `standalone-initial-desktop.png` | `e36049a1d26e9b8b4daeab7ca98e2d3ffb413bea3b9e800b566329f5f97c6b1b` | Desktop standalone initial 5×3 viewport and seed. |
| `standalone-initial-mobile.png` | `c50c5e9e912e6ac61448932b4e6459da488a76fdc1532442df98e525baf8b9b1` | Mobile standalone initial viewport. |
| `standalone-settled-desktop.png` | `8c96a04eabba7779cf2b853c49125af015903d7460edd2be46e0facaedf20885` | Desktop settled viewport, highlighted scatter cells, and payout 3000. |
| `standalone-settled-mobile.png` | `f601675ca90a6d00ac2c028b3cc49cca5512a80c5ca28ae165d3530cd7eef36c` | Mobile settled viewport, highlights, and payout 3000. |
| `studio-play-initial-desktop.png` | `61cb6131dc82aa196ca1f3cf38e0da012bc6269b9ba96b97d81253fb05972bbc` | Studio Play initial desktop viewport. |
| `studio-play-settled-desktop.png` | `c4e46bfafb7a0a3ecfb45affe1346ee7874c865805dd6cc78a578bc2b2cac51f` | Studio Play settled desktop viewport, scatter highlights, and 3000.00. |
| `studio-play-settled-mobile.png` | `9808923a4c640333c6ee2bffb08742818928d4288a437f62c801fda6db3e4cf6` | Studio Play settled mobile viewport, highlights, and 3000.00. |
| `replay-session-spin-desktop.png` | `2cfbaae2032f6eb63f4fe483c4b2cbfaa80b676417155f73b1bfd44d73502dd9` | Replay Session Spin record with Full completeness. |
| `replay-full-artifact-desktop.png` | `1a221f05ebbdaf57d1cd9223518b1ccb6b7a61eca8a43c6030c65e884068efa1` | Full-artifact details: generated 5×7, visible 1.25/2.5 and evaluated 2/3. |
| `replay-session-spin-mobile.png` | `d1ad18def62b35fbde206797000fbefe8233fde6bbb0b46a7b1d4ae447351711` | Replay mobile viewport grid and selected recorded round. |

I independently inspected every retained image. At desktop, the first and last
grid rows are visibly three quarters of the central row; on mobile the same
proportion remains apparent. The screenshots show only a 5×3 viewport, never
the generated off-window rows. Settled standalone and Studio views visibly tint
the three scatter cells and agree on payout 3000/3000.00. The Full-artifact
inspection additionally retains `generatedScreen`, geometry, one canonical step,
and original hash `sha256:a784f25adcbdd26d10397bb8bea6473765065f22a2f2e94c9ebc6450948bed02`;
the public Replay viewport remains 5×3. These are visual judgments from the
PNGs, not a DOM-geometry or collector-pass claim.

Prior-step evidence was neither changed nor removed. This evidence commit changes
only the allowed V2C-03 documentation/evidence paths.
