# PC-18 independent host verification — driver inconclusive

Candidate code SHA: `938d6bfe61f13ff2dd80f1f984b2d4706bfa8646`.
This evidence commit is a docs-only descendant of that candidate.

## Retained complete-file boundary

The controller-verified serialized command ran once on the candidate with all
eleven requested files. Result: **11 suites / 60 tests passed**. The candidate
was rebuilt with `npm run build-cli`; the already-passing test command was not
rerun.

## Fresh Studio recovery

Four isolated Studio/browser launches used new registries and profiles and
started only with `node ./dist/cli/pokie.js --no-open`. The single retained
harness carried the clean creation, Play, cancellation/retry, replay, Outcome
Library, Stake handoff, caller-owned-destination, source-drift, and stale/cross
project checklist.

The last complete rendered journey established:

```text
Create game -> Created in Studio; Editable; Valid
Play -> New Play session -> Spin -> Spinning… -> Round complete
Simulation Run -> queued — 0/10000 -> Cancel -> Confirm
  -> Cancelled after 0.2s — 3000/10000 rounds completed
  -> Configure -> Run Simulation -> queued -> RTP result (completed)
Replay / Recent Simulation -> Load -> Ready -- plays a fresh session forward
  -> Run again -> no pending/job, terminal, or local error rendered
Build/Export -> Generate exact outcome library (base)
  -> Generated 1,024 outcomes for mode "base" using exact (RTP 100.78%)
Outcome Library -> Stake Engine export -> caller-owned nonempty directory
  -> Status: Choose a different destination; Build disabled
  -> “Build will not overwrite it.”
```

The last launch repaired the earlier offscreen-field driver issue by scrolling
the rendered Stake output field into view; the visible field then contained the
test path and the local safety guard rendered. The harness did not send Delete
after selecting that field to restore the default, so it could not activate an
enabled Stake Build control. No extra launch remains. The replay action likewise
retained its local ready state after activation without an accepted lifecycle
record or terminal result. Neither is a correlatable product failure. Replay
terminal, successful Stake handoff, source drift, and cross-project/stale
terminal variants remain unreached; this is **inconclusive (driver)**.

No generated projects, outputs, profiles, screenshots, harness source, or raw
logs are retained.
