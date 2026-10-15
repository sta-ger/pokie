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
