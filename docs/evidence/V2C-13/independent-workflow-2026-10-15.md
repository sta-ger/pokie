# V2C-13 independent public-workflow observation

Candidate product identity: `ac581e39e0cd121a870a9b15ee176811f9181f5b`.
The candidate source tree was clean before and after the controller-owned
targeted test receipt and before this verifier's evidence-only record.

## Bound test receipt

The authorized controller receipt at
`/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/13b6da3faae14bec8f560371/result.json`
records the exact candidate before/after as clean, return code 0, and the
terminal summary: 13 suites passed, 866 tests passed. Its stdout SHA-256 is
`b053f1f790fc22d55673cd034329e58826f075f1c89ef4d0ac095130e39bf1a9`;
stderr SHA-256 is
`ecbe1e11846e632665dd7a770150a54dca01b55d63a3dbef1b46a83c1a88af91`.
No test was rerun.

## Candidate build and two fresh Studio launches

The neutral launcher built the candidate once with `npm run build-cli`.
Its authenticated receipt is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/candidate-builds/ac581e39e0cd121a870a9b15ee176811f9181f5b/result.json`:
candidate tree `75aec7b757ff57a160d06b073a4fe346f147a06e`, compiled-output
SHA-256 `631ef38f33bfafab09e25fc1b8e93397afdaf8df9c44aa671631387b59d4e9c0`,
8,776 files, build-log SHA-256
`1461f568b7acb5052e24afb542d2ee2ab5b768ddfa2fb3aefa443e87d299e21b`.

Launch 1 transcript:
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/run-2026-10-15T08-30-55-836Z/transcript.json`
(SHA-256 `bf21db20849189d18c5a4de8c35d49b312df31c2d49f3e4d9c9be762b9de3bc9`).
The rendered Home workflow created/saved the starter project, then Play
completed one spin. A seeded workers=1 Studio simulation accepted job
`97c763c10d044b20af02dc38a89f6fb1` and completed 100/100 rounds. Its real
browser download was 1,994 bytes with SHA-256
`be7c0c3c624a31e89759ad09b1c8d67927cd544887b1ec06508d5a5037142107`;
the downloaded JSON records seed `v2c13-sequential`, config hash
`sha256:d28efc34ce7b0e14651afcf2b2b5ed4489d071cd9b164381440485c7442ddceb`,
and the public reproduction command. Seed replay then completed job
`b4e9465fc6ae40718ce7a5c321ecc644`, session
`a462a306-91d5-4b57-9ac7-5c0f096191ef`, with the same seed and full round
artifact. Visual review was performed on the Home, simulation, and replay
screenshots; each was readable and visually coherent.

Launch 2 transcript:
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/run-2026-10-15T08-33-24-429Z/transcript.json`.
The rendered Home server-side picker listed the isolated fixture and loaded
then explicitly saved `wild-sticky.blueprint.json` as `wild-sticky` v1.0.0.
Studio reported 0 errors and four warnings (two never-land symbols and two
wild-frequency warnings). The independently inspected overview screenshot is
`2-observation.png` in that run.

## Disposition

These are partial observations only. They do not demonstrate all six
capabilities or recovery states, generated ordinary and weighted packages,
XLSX round-trip, workers>1 seed partitioning/state isolation/cancellation, the
known A/W2/W3 payout, or matching HTML/Markdown reports. No product defect is
claimed from those uncollected branches. Both Studio children were closed by
the neutral launcher; no runtime artifact, profile, generated package, or raw
log is committed here. Packaging and official full/release gates remain
deferred.

## Recovery collection revision

This revision reused the authenticated candidate build and did not rerun tests.
Two further fresh-profile Studio launches completed and their owned children
drained before this record was written.

The first transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/run-2026-10-15T08-38-18-862Z/transcript.json`
(SHA-256 `788bee3aa38f94edef2c6f4cb3b531ae3ff2cb7680812d2c6790ee68139329e9`).
Rendered Home and Project screens loaded and saved `wild-sticky.blueprint.json`,
then submitted a Simulation with 200 rounds, seed `v2c13-sticky-workers`, and
`workers=2`. Its queued and terminal receipts identify job
`191065c54c8d40d08e6ca6bc7bc78921`; the full report records 200 executed,
sticky, rule-application and multiplied-component steps, total bet 10.00,
total payout 600.00, config hash
`sha256:e5e82037d6c83e75b726d37327920f5c72e8ddc0bbf7f42b33c23ef0ffe73584`,
and a public reproduction command with `--workers 2`.

The same launch completed TypeScript package job
`6580e02cfeab4d9aa38dbc752b31df14` through rendered Build/Export and then
opened it with the visible `Open as Project` action. Studio rendered a
read-only `Playable game`. A seeded public Play session
(`v2c13-generated-sticky-play`) rendered one completed A/W2/W3 round: stake
0.05 and payout 3.00 (unrounded transport payout `3.0000000000000453`).
Independently inspected screenshots: saved authoring view `1-observation.png`
(SHA-256 `9730995703582790fd0d6bfe5fcb8e67654a57abb38cf8f33c4db95290d9b3d3`),
multi-worker report `2-observation.png` (SHA-256
`eaa263f108905ab6a731321d06ff09a4bd61d15ca20b2a0f40d3bbecf3f005df`), and
Play result `3-observation.png` (SHA-256
`a0f5928a46afdd9e28b135f8d92b7de9068775058d62d895ea72195a9ef4b02a`).

The distinct retry job `d0e56a14d9a34991aa735fc2f5578832` completed 200
rounds before the driver could dispatch Cancel. It is not cancellation-cleanup
evidence and no cancellation result is claimed.

The second transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-13-b86253e3a60d58fd/run-2026-10-15T08-48-16-845Z/transcript.json`
(SHA-256 `56945558723136ef60013e51ef221cd4884b080ade1cef268cdb0d99b7c382b8`).
It loaded and saved `generated-reels.blueprint.json` through Home/Project and
opened its public Outcome Library generator. Its rendered preflight states that
exact enumeration has 12,337,920 raw combinations. This is a mechanism
preflight only, not completed ordinary/weighted execution or an XLSX round trip.

### Current independent disposition

This adds public save/materialization, a generated package loader, seeded
generated-package Play with the known payout, and sticky multi-worker
accounting. It does not prove all six authoring capabilities and their
ordering/coordinates/restrictions/lifetime, malformed/stale recovery, catalogue
sweep, HTML/Markdown reports, ordinary/weighted comparison, XLSX round-trip,
state isolation, or cancellation cleanup. Those rows remain not reached. No
candidate-owned product failure was observed. Packaging and official
full/release gates remain deferred; no runtime payload is committed.
