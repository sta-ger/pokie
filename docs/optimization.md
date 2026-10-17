# Finite same-type math optimization

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
packages are loaded and measured at the destination before publication is accepted.
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
Exit codes: success **0**, operational failure **1**, infeasible **2**, invalid
**3**, unsupported **4**, exhausted **5**, cancelled **6**. Ctrl-C requests
cancellation and waits for owned work to settle. Node orchestration is kept out
of browser entrypoints; Studio imports the same pure policy validator.

Publication rejects destinations inside the owned run workspace. Each save owns
independent authored file bytes, supports cross-filesystem destinations, and survives
candidate discard. External dependency bindings continue to identify the source
installation. Rollback removes only files and directories owned by that save.
Studio support, start and save requests include the expected Project root, alongside
source revisions; changing Projects invalidates the request even for identical files.
Terminal evidence is shown alongside diagnostics, job errors, recovery guidance and
connection/cancellation failures.
