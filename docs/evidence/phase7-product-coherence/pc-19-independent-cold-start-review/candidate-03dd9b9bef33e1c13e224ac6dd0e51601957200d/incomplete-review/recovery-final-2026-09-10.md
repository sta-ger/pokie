# PC-20 focused recovery — resolved UI correlations

Candidate: `03dd9b9bef33e1c13e224ac6dd0e51601957200d`.
The retained exact package archive remains `artifacts/pokie-1.3.0.tgz`
(SHA-256 `3ba7cde00e67d1205def985ef20958198ec2aca16ee6207e89ee632a57662622`).
The pre-existing verifier-owned freeze receipt remains outside this review tree at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/PC-20-42fe809212234b68/pc-19-03dd9b9b-freeze-receipt.json`
(SHA-256 `ce24725e1def6bdf673b0c6dca7ddb88255fb5f037260477d87c60688872a92d`).

This recovery used fresh Studio profiles and exactly
`node ./dist/cli/pokie.js --no-open`. The candidate's product and `dist` paths
were unchanged from the candidate SHA; only prior retained evidence differed.
No generated profile or output tree is retained here.

The full fresh-profile run recorded ready state, one activation, and the local
terminal for the formerly uncorrelated workflows. Its verifier-controlled
transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/PC-20-42fe809212234b68/launch-5-output/studio-transcript.txt`
(SHA-256 `20c6515b160b6af7e871bb83fb190203f4441036fa53ce33987809f94660dcfe`).
It created `starter-slot`, settled a Spin, accepted the Simulation as
`queued — 0/100 rounds`, and later rendered that run's completed report. One
`Session 1 — Round 1 — Spin` activation rendered `Loaded replay` and
`Inspectable AVAILABLE`. The exact Outcome Library action rendered its own
`Generating outcome library…` accepted state then `Generated 1,024 outcomes`.
The TypeScript and Stake cards each went from their own ready Build control to
their own `Built to …`/`Open output folder` result.

The first PAR attempt is excluded: it was activated while its visible path
field still read `Resolving…`, so its later path warning is not attributed to a
ready action or treated as a product result. A fresh, final PAR-only recovery
used the card's displayed default destination. Its transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/PC-20-42fe809212234b68/launch-8-output/studio-transcript.txt`
(SHA-256 `95ecf9d4a1def5bbc88e1e9dfe8b4726d7dece75fb3ad21bad87938dcb07bae2`).
The ready card named `parWorkbook.xlsx`; one Build activation rendered the same
card's `Built to …parWorkbook.xlsx`, `Executed plan: publish publish`, and
`Reveal file` terminal. No action-local product failure was observed.

This is bounded recovery evidence, not a replacement blind PC-19 review. The
existing frozen record predates these observations and does not contain the
validator-required complete blind coverage/provenance/comparison record.
Consequently the existing complete-release validation remains unproven; this
document neither rewrites prior blind evidence nor claims a validator pass.
