# Constrained same-type math optimization

`pokie optimize SOURCE --policy request.json [--out NEW_DESTINATION]` and
Studio Project → Overview → **Optimize math** use `ProjectOptimizationService`,
the same operation available from the package root to ESM and CommonJS callers.
Studio checks tuning support, starts a durable cancellable job, retains its
verdict/evidence across reload, and saves a reviewed candidate only on request.
The ordinary `pokie` / `pokie SOURCE` Studio startup is unchanged.
Conversions remain `build SOURCE --target TARGET`.

```json
{
  "targets": [{"metric": "rtp", "unit": "ratio", "value": 0.75,
    "tolerance": {"kind": "absolute", "value": 0}}],
  "policy": {
    "strategy": "exact-finite-v1", "seed": "review-1",
    "budget": 3, "maxOutcomes": 10000,
    "mode": "base", "stake": 1, "scope": "logical-round",
    "tunables": [{"path": "/paytable/A/3", "values": [2, 3, 4]}],
    "locks": ["/paylines", "/reelStrips", "/mechanics"],
    "constraints": {"maxWin": {"value": 10, "unit": "betMultiple"}}
  }
}
```

Locks must identify existing fields. Omit `/mechanics` when absent. Paths are
JSON pointers (`~0` encodes `~`, `~1` encodes `/`); array entries use indexes.
Only explicitly granted existing numeric leaves are writable. Complete parent
locks protect presence, values, order, and descendants. Overlapping tunables,
ancestor/descendant lock conflicts, unknown fields, unsupported units,
nonfinite values, and contradictory fixed/count/sum declarations are rejected.
`protectedFiles` lists relative file paths whose exact bytes must survive;
a byte lock on a file that the tuning workflow must update is a preflight error.
All undeclared model fields are compared after native serialization/readback,
even when the user supplies no locks.

| Input/output ProjectType | Concrete finite workflow and authority |
| --- | --- |
| Blueprint | Existing authored paytable multipliers; literal strips or weighted whole-sequence reels; existing authored bets. Returns Blueprint JSON. |
| PAR workbook | Existing paytable cells in a canonical lossless workbook; edits the workbook in place in a detached copy, updates its provenance hash, and reimports it. Ignored/defaulted/formula features fail before candidate writes. Returns XLSX. |
| TS package | An author-declared `pokie-tuning.json` v1 contract binds a JSON parameter Blueprint, permitted paytable paths, every custom source-file hash, and executable `getConfigHash()` / exact enumeration. Copies the package and edits only parameters and their contract hash; preserves custom code bytes and evaluates the real loaded candidate. No build script is launched. Returns a loadable package. |
| Outcome Library | `/modes/MODE/outcomes/ID/weight` numeric weights, scoped to one mode. Preserves IDs, artifacts and other modes; the native writer rebuilds indexes, hashes, totals and analysis; deep validation/readback precedes measurement. Returns a native bundle. |
| Stake | The same weight paths, with canonical uint64 **decimal strings**, never JavaScript numeric weights. Retains IDs, payout units, mode costs, books and events, and reads the directory with `StakeEngineOutcomeSourceReader`. Returns a native Stake directory. |
| WASM | An explicitly bound canonical component with a `pokie.wasm-tuning.v1` companion containing source, paths, source hash, module hash and builder version. Recompilation must reproduce the original bytes before search. Tunes literal-reel, feature-free source, rebuilds WASM and companions, and checks the executable over every stop tuple. Returns canonical WASM. |

`declarePackageTuning(packageRoot, parameterFile, paths)` is an explicit authoring
operation that writes a new contract. Authors must make the executable load the
parameter file and expose the corresponding `computeGameBlueprintHash` through
`getConfigHash`; `createExactEnumerationSession` must drive that same executable
math with the supplied deterministic combinations generator. A convenient
`createTunableBlueprintGame(model)` assembly is provided for data-backed packages;
custom packages can implement this contract without replacing their own code.
The optimizer does not infer tuning permission from a model descriptor or from
runtime execution capability. Missing, stale or tampered source authority fails
before executable acquisition and candidate writes. Detached candidates and saved packages
bind declared runtime dependencies to the same installed packages resolved from the source
project (including project-local installations), rather than resolving from scratch ancestry.
These external installations must remain available; saving does not vendor them. Saved
packages retain source/build timestamps for stale-entry detection. Exact candidates are loaded
and measured at the destination before publication is accepted. Seeded candidates retain their single
reviewed assessment without resampling. Their evidence separately binds installed dependency bytes
and the resolved transitive dependency graph (including the host runtime). Search/assessment and save
reject dependency drift or disappearance. Save loads the destination and verifies its model binding
before accepting publication, then releases its game resources and loader lease.
Every load copies the resolved runtime dependency graph to invocation-owned paths, including
transitive and peer dependencies and the host runtime. Enumeration, search, held-out assessment and
publication therefore cannot reuse exports from an earlier installation revision. Existing live
consumers keep their own modules; releasing a runtime removes only its private files and CJS cache.
Dependencies remain ordinary external package dependencies;
`node_modules`, `.git` and loader caches are excluded from authored-byte identity.
Filesystem aliases in authored input/publication paths are rejected.

`bindCanonicalWasmTuningSource(wasmPath, blueprint, paths)` is the separate,
explicit source-binding action. It writes a new `.tuning.json` companion only
when compiling that source with the canonical descriptor reproduces the module
bytes. Canonical integrity alone, legacy sidecars, an embedded model, or an opaque
custom component cannot authorize regeneration. WASM candidates preserve compact
runtime state and the existing host RNG contract.

Stake tuning preserves native integer precision. Its distribution is no longer
the one described by an old POKIE export's reconstructed-library hash. That old
manifest is retained verbatim as `optimization-input-pokie-manifest.json`, and a
`pokie-native-weights.json` inventory binds all current native files. Project
resolution recognizes this integrity-bound native candidate. Standalone native
readback/analysis remains authoritative; a claim of lossless reconstruction into
a number-weighted POKIE Outcome Library is not made. Original books/event bytes,
including tiny positive native probabilities, are retained. Native candidates expose only
inspect/analysis capabilities. Import and build/re-export require the original compatible
POKIE export; they are unavailable for native-only candidates. Use explicit candidate save
to retain native uint64 weights and books without reconstruction.

Targets and exactness:

- RTP is a return **ratio**, not a percentage. Hit frequency is the probability
  of positive payout. Volatility requires `variance` or `standardDeviation`, in
  payout-multiple units squared or payout-multiple units respectively.
- Feature frequency is the probability that a selected outcome contains at
  least one event with the supplied `event` type. Its denominator is selected
  outcomes, not event occurrences. Native Stake uses its exact native event type.
- Distribution targets specify nonoverlapping half-open payout-multiple buckets
  `[min,max)`; `max: null` means infinity. Values are probability mass, together
  at most one; a partial collection of buckets need not cover all mass.
- Maximum win uses `currency` or `betMultiple`. `constraints.maxWin` is an output
  bound in the same selected population, never an installed payout cap. Native Outcome
  Library and Stake weights must be positive; zero-weight tuning domains are rejected
  during preflight. Authored zero paytable/grant values and zero-weight reel variants
  keep their separate canonical contracts.
- Tolerances are nonnegative finite numbers. Omitted tolerance means exact
  binary64 comparison (the same as explicit absolute zero); explicit zero is
  preserved in evidence. Relative tolerance multiplies the absolute target
  value, so a zero target has zero relative allowance. Binary64 rounding can
  require a small explicit tolerance, including at fractional stakes.
- Authored base-mode workflows use `paid-entry` or, for feature-free games,
  `logical-round`. Free-game entry enumeration supports only `paid-entry`;
  it does not prove a generating game's full feature-round target. Other
  advanced/stateful mechanics fail as unsupported. Native weights require
  `native-outcomes`: even a sampled input bundle establishes only that bundle's
  distribution, never its generating game's full-round RTP.

`constraints.fixed` contains `{path,value}` entries; fixed fields cannot also be
tunables. `constraints.sums` contains `{paths,value}` entries, using strings for
exact native integer sums, which may exceed uint64 although each Stake weight must
fit uint64. `constraints.counts` contains `{path,scope,value}`:
`outcomes` counts all declared outcome identities, `symbols` counts entries in a
symbol list or one strip, and `variants` counts declared sequence variants,
including zero-weight entries. These are checked before search and after native
readback; representation and missing-versus-zero authored values are preserved.

`exact-finite-v1` traverses the Cartesian product in submitted order, with the
last dimension varying fastest, selecting the first match. Seed is a nonempty
string of at most 256 characters, retained verbatim; exact selection uses no
random draw. Each attempted candidate costs one deterministic budget unit,
including constraint rejection, materialization, validation and measurement.
`budget` and the separate per-candidate exact reel/native-population `maxOutcomes` cap
are integers in `[1,1000000]`. Zero, negative, fractional, nonfinite, unsafe or
string-encoded budgets are invalid. A population cap or unfinished candidate
search returns `exhausted`; only complete supported search returns `infeasible`.
Acquisition, evaluation, native-validation and cleanup failures return `failure`.
Cancellation cannot establish infeasibility. Evidence includes source revision,
adapter/strategy versions, request units/tolerances/population, finite domains,
seed, caps, work counts, ordered evaluations, metrics, diff and readback checks.

Library usage:

```ts
const service = new ProjectOptimizationService();
const project = await new ProjectTargetResolver().resolve(sourcePath);
const result = await service.optimize(project, request, {signal, onProgress});
if (result.status === "success") {
    try {
        // Review result.evidence.diff and measured values first.
        await service.publish(result.candidate, request, newDestination, {signal});
    } finally {
        await service.discard(result.candidate);
    }
}
```

Candidates are detached owned workspaces, not automatic source edits. Publication
requires the same service receipt, unchanged source/policy/reviewed candidate,
and a new or empty destination. Occupied and aliased destinations fail; partial
publication rolls back only owned outputs. Call `discard` after reviewing an
unsaved candidate. The CLI discards review-only work after printing evidence;
`--out` retains its output and reports that destination's actual file inventory revision in `output`. Studio retains candidate ownership for explicit save
within its process. After server restart, durable evidence remains available;
rerun optimization to obtain a new save receipt. Closing/switching Project or
cancelling a job discards an unfinished candidate and drains the executor.

CLI JSON is always structured; `--progress` emits progress JSON to stderr.
Exit codes: exact success or sampled attained **0**, operational failure **1**, infeasible **2**, invalid
**3**, unsupported **4**, exhausted **5**, cancelled **6**, sampled inconclusive **7**. Ctrl-C requests
cancellation and waits for owned work to settle. Node orchestration is kept out
of browser entrypoints; Studio imports the same pure policy validator.

Publication rejects destinations inside the optimization scratch root and owned run
workspaces, including other retained candidates. Each save owns
independent authored file bytes, supports cross-filesystem destinations, and survives
candidate discard. External dependency bindings continue to identify the source
installation. Rollback removes only files and directories owned by that save.
Studio support, start and save requests include the expected Project root, alongside
source revisions; changing Projects invalidates the request even for identical files.
Terminal evidence is shown alongside diagnostics, job errors, recovery guidance and
connection/cancellation failures.

## Seeded search and held-out assessment

Set `policy.strategy` to `seeded-search-v1` and supply a complete `sampling` object:

```json
{
  "searchSamples": 400, "searchBudget": 1200, "assessmentSamples": 6000,
  "minSamples": 1000, "minEventCount": 5, "confidence": 0.95,
  "chunkSize": 100, "workers": 1
}
```

The other fields are unchanged from the exact example. For sampling, give each target an explicit
positive tolerance (for example RTP `0.75` with absolute tolerance `0.15`). Omitted or zero tolerance
is retained, but numerical equality cannot be certified from samples. `minSamples` must be at least
30; an assessment budget below it is permitted and returns `exhausted`, not approval. All sample
budgets and counts are integers in `[1,1000000]`, `workers` is at most 16, `chunkSize` at most 1000,
candidate attempts at most 10000, and confidence must be finite in `[0.8,1)`.

| Adapter | Seeded population/support (exact support is unchanged) |
| --- | --- |
| Blueprint | Literal reels or whole-sequence variants; line payouts; feature-free logical rounds or paid entries. Free-game entry triggers may be counted, not their continuations. |
| Lossless canonical PAR | Same supported authored populations; native paytable-cell readback preserves other declarations. |
| Explicitly declared TS package | Feature-free complete rounds with finite executable enumeration, source/dependency binding and model hash. The executable enumeration establishes the return support bound; actual seeded sessions supply observations. The package must honor the `createSession({seed})` RNG contract, including independent seeds. An opaque/hash-only runtime is insufficient. |
| Outcome Library | Selected `native-outcomes` numeric weights, matching artifact stake; event identities come from stored `featureEvents[].type`. |
| Stake | Selected `native-outcomes` uint64 string weights (never rounded to numbers); actual paid cost is denomination times native mode cost. |
| Source-bound canonical WASM | Supported feature-free literal reels, rebuilt reproducibly and checked against every executable stop tuple before using the bound authored population. |

Only RTP, hit probability, named feature-event presence and requested half-open payout-multiple
buckets are sampled targets. For example `{"metric":"featureFrequency","unit":"ratio","event":"bonus","value":0.25,"tolerance":{"kind":"absolute","value":0.04}}`
and `{"metric":"distribution","unit":"ratio","bucket":{"min":2,"max":4},"value":0.25,"tolerance":{"kind":"absolute","value":0.04}}`.
Buckets use payout / actual paid stake, not the legacy currency histogram. Repeated occurrences
of an event in an observation count once. Zero/all-success events cannot pass the required
success/failure coverage check. A native draw is not a generating game's full logical round.
Sample maxima and volatility are unsupported targets/constraints in this strategy; use exact
authority rather than interpreting an observed maximum as a hard bound. Advanced stateful mechanics
and incomplete logical-round populations are explicitly unsupported, not silently approximated.

### Determinism and work accounting

The Cartesian domain is permuted by `seeded-affine-cartesian-v1`: hash `[seed,"start"]` and
`[seed,"stride"]` using the existing canonical JSON SHA-256, reduce modulo domain size,
and advance the nonzero stride to the first value coprime to domain size. The last authored
dimension varies fastest within each ordinal. There are no duplicates. Fitness is the sum of
squared target errors divided by `max(tolerance.value, abs(target.value), 1)` squared.
The first visited minimum wins ties, regardless of worker completion timing.

Each attempt, including constraint rejection, consumes one candidate unit. Only surviving native
readback candidates consume search observations, at most `searchSamples` each and never beyond
the separate total `searchBudget`. A final shortened search batch is recorded as such. The best
candidate is frozen before one reserved `assessmentSamples` run. Its seed is
`JSON.stringify([seed,"assessment",0])`; search seeds are `JSON.stringify([seed,"search",attempt])`
with one-based attempt numbers. WorkerSeedStrategy derives per-worker streams. Worker count is
part of reproducibility: changing it changes streams and may change selected parameters.

Evidence records the full validated request, source inventory revision, adapter/strategy/policy
versions, model identity, ordered parameters, per-candidate fitness/seeds/actual samples, total
attempts/rejections/search/held-out samples, executable validation work, selected diff and assessment.
Executable-validation observations (TS enumeration, or authored plus actual WASM stop tuples) are
counted separately from sampled observations and bounded by `maxOutcomes` for each sweep. No hidden
target evaluations occur on save. Supported authored diffs reuse the math-definition reader/differ
in analysis-only mode; that partial declared-model comparison is not itself runtime proof. Native
weight diffs retain integer strings. Scratch paths, timestamps and job IDs are excluded from evidence;
rerun its request against the same identified source and dependencies to compare evidence directly.

### Confidence and truthful verdicts

One fixed held-out assessment uses two-sided Hoeffding intervals, with Bonferroni allocation
`delta=(1-confidence)/numberOfTargets`. Probability observations have range `[0,1]`; RTP observations
use a finite support bound derived from the canonical resolved line/scatter math (including default
paylines over evaluated geometry) or the validated native/executable
population, never a sampled maximum. This deliberately does not reuse the empirical normal interval's
zero-variance shortcut. Existing simulation precision convergence is not optimization attainment.

Every target needs its entire simultaneous confidence interval **inside** its tolerance region,
positive allowance, all requested assessment observations, at least `minSamples`, finite estimates,
and at least `minEventCount` successes and failures. RTP conservatively uses paying/nonpaying
coverage too. Merely containing the target or matching its estimate is insufficient. Rare/unseen
payouts, zero empirical variance and tolerance-boundary overlap therefore cannot create spurious
exact approval. The returned per-target bounds, estimates, regions, coverage reasons and verdicts
describe what was actually assessed. This is a fixed-sample, single-assessment policy, not optional
stopping or repeated assessment until a favorable result occurs. It makes no joint guarantee across
separate user-initiated reruns; do not cherry-pick reruns as stronger evidence.

- `attained`: all requested assessment regions established and the declared search completed.
- `inconclusive`: a candidate exists but assessment is uncertain or missed; even exhaustive **sampling**
  of candidates is not a proof of infeasibility.
- `exhausted`: candidate/search budget stopped the search or assessment cannot meet its minimum;
  evidence retains the concrete stop reason and any best-so-far candidate.
- `infeasible`: reserved for exhaustive exact target exclusion or structural exclusion of every declared
  candidate. Contradictory declarations/target intervals instead return `invalid` before preparation.

Candidate presence never means approval. Direct callers may explicitly `publish` and then `discard`
an `attained`, `inconclusive` or `exhausted` candidate. CLI `--out` and Studio save follow the same
contract, writing a sibling `DESTINATION.optimization.json` with the original verdict, reviewed
candidate revision and full evidence. Saving cannot turn an exhausted candidate into success.
Studio job `completed` means execution ended, not mathematical attainment. Restarted jobs retain
durable evidence but need a rerun for process-local save ownership.

Progress phases are preparing, search, assessment and finalizing; chunked simulations yield to SIGINT/Studio
cancellation. Cancellation, execution/observer failures, native readback drift, stale Project/source
or request identity, and release failures discard owned scratch candidates without changing source
or locks. Invocation ownership releases game hooks and loader leases on every terminal path,
including recipe games and injected games. Workers cooperate through the shared cancellation buffer, acknowledge runtime release and
are terminated before a terminal result. Failed termination or missing release acknowledgement is an
operational cleanup failure (Studio recovery-required), never successful cancellation. Terminal
snapshots are still validated during cancellation drainage; all accepted counts reach partial evidence,
and a late release failure takes precedence over cancellation. Publication
uses existing new/empty destination and ownership-aware rollback rules, including the evidence and
WASM companions. Independent review, production bundle/packaging and controller gates remain separate
from these implementation tests.
