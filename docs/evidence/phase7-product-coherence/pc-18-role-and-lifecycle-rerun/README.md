# PC-18 independent host verification — driver inconclusive

Candidate code SHA: `938d6bfe61f13ff2dd80f1f984b2d4706bfa8646`.
This evidence commit is a docs-only descendant of that candidate.

## Retained complete-file boundary

The controller-verified serialized command ran once on the candidate with all
eleven required files named in the persisted request. Result: **11 suites / 60
tests passed**. The candidate was rebuilt with `npm run build-cli` before this
fresh UI recovery; the already-passing test command was not rerun.

## Fresh Studio recovery (four launches)

Each launch used a new Studio registry and Chromium profile and started the
source-checkout build only with `node ./dist/cli/pokie.js --no-open`. The one
in-place harness contained the ordered checklist for clean creation, Play,
Simulation cancellation/recovery, replay, Outcome Library generation, and
Stake handoff.

Rendered, action-local results across the launches:

```text
Create game -> Created in Studio; Editable; Valid
Play -> New Play session -> Spin -> Spinning… -> Round complete
Simulation Run -> queued — 0/10000 -> Cancel -> Confirm
  -> Cancelled after 0.2s — 3000/10000 rounds completed
  -> Configure -> Run Simulation -> queued -> RTP result (completed)
Replay / Recent Simulation -> selected starter-slot v0.1.0 -> Load
  -> Ready -- plays a fresh session forward -> Run again
  -> no pending/job, local terminal, or local error rendered
Build/Export -> Generate exact outcome library (base)
  -> Generated 1,024 outcomes for mode "base" using exact (RTP 100.78%)
```

The fourth launch's simulation completed rapidly before cancellation could be
confirmed; the rendered local terminal was its RTP result, not a cancellation
failure. Its still-open confirmation sheet was then dismissed, but the harness
did not navigate from the completed simulation state before the launch budget
ended.

No action-local product error was rendered. In particular, the enabled Replay
`Run again` action retained its exact local ready state after activation and
never exposed a request/job lifecycle record, terminal, or error. That does
not satisfy the action-correlation contract for a finding. Replay terminal,
Stake caller-owned-destination safety, source drift, and cross-project/stale
checks remain unreached; the appropriate status is **inconclusive (driver)**.

No generated projects, outputs, browser profiles, screenshots, harness source,
or raw logs are retained.
