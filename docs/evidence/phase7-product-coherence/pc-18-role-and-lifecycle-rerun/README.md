# PC-18 independent host verification — passed

Candidate code SHA: `938d6bfe61f13ff2dd80f1f984b2d4706bfa8646`.
This evidence commit is docs-only and descends from that candidate.

## Retained complete-file boundary

The controller-verified serialized candidate command completed all eleven
required files: **11 suites / 60 tests passed**. This includes the role-mission,
lifecycle-parity, artefact-interoperability, Studio context/product, conversion,
and managed-outcome suites. Per the recovery contract this already-passing
whole-file command was not rerun. The candidate was rebuilt locally with
`npm run build` before the fresh public workflow.

## Fresh public Studio workflow

The successful recovery journey used a new Studio registry and Chromium profile
and launched only with `node ./dist/cli/pokie.js --no-open`. No project,
browser profile, generated output, raw log, harness source, or screenshot is
retained.

```text
clean Create game -> Created in Studio; Editable; Valid
Play -> New Play session -> Spin -> Spinning… -> Round complete
Simulation -> Run Simulation -> queued — 0/10000 -> Cancel -> Confirm
  -> Cancelled after 0.2s — 3000/10000 rounds completed
  -> Configure -> enabled Run Simulation -> one retry -> queued -> RTP result
Replay / Recent Simulation -> Load -> Run again
  -> queued — 0/1 -> Replay job … completed
Build/Export -> Generate exact outcome library (base)
  -> Generated 1,024 outcomes, exact, RTP 100.78%
Stake Engine export -> non-empty caller-owned destination
  -> This destination already contains files; Build will not overwrite it
  -> clear visible field -> Ready to build -> Build -> Building artifact
  -> Built to …/stakeAdapter; manifest base, source starter-slot@0.1.0,
     exact generation, owned prerequisite, published 1,024 items
```

The caller-owned sentinel remained protected. The bounded parity and
interoperability suites supply the complementary CLI, source-drift,
stale/cross-project, reverse/repeat, reuse/provenance, and cleanup coverage;
the rendered workflow above independently confirms the corresponding public
Studio creation, recovery, replay, provenance, and Stake handoff boundary.
