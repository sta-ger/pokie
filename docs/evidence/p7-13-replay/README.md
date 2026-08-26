# P7-13 replay determinism transcript

The bounded regression path is a real native outcome-library bundle: create an outcome-source session with a seed,
spin it, then take `replay.seed`, `replay.round`, `replay.modeName`, `replay.libraryId` and `replay.libraryHash`
from the ordinary response. The same `replay` object is available on a seeded Studio Play spin, seeded Studio
Outcome Source sample, and the Studio Recent Rounds record, so the transcript does not depend on hand-constructing
an internal descriptor. Run:

```sh
pokie replay ./bundle --seed recorded-seed --round 1 --mode base --out replay.json
```

Compare canonical fields only: game id/version, library id/hash, mode, selection algorithm, seed, round, outcome
id, artifact, screen, stake, total win and payout multiplier. Ignore session/job ids, timestamps and durations.
The focused regression tests run the same reconstruction twice and check the selected outcome and canonical payout;
they also demonstrate blank seed/mode and a stale library hash fail closed before a reproduction is presented.

For Studio, the chunked replay lifecycle uses the same `derived-round-seed-v1` selection as server and CLI. A
cancelled or failed job has no downloadable descriptor and is removed from the active-job set by the existing
Studio replay cleanup tests; no state snapshot is treated as an exact match when one was not available.
