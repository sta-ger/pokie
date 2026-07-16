[← Back to docs index](README.md)

# External Adapter SDK

`externaladapter/` is a small, generic SDK for deploying canonical [`WeightedOutcomeLibrary`](weighted-outcome-library.md)
content to an *external* target — a specific external format or RGS/aggregator-style consumer — without POKIE
itself needing to know anything about that target's own wire format. It's the same relationship
[Stake Engine Export](stake-engine-export.md) has to the real Stake math-sdk format, generalized: instead of one
fixed exporter for one fixed format, this SDK is a set of contracts a target author implements once, plus a
shared `ExternalDeploymentTargetRegistry`, `ExternalDeploymentCompatibilityValidator`, and `ExternalDeploymentService`
orchestrator.

**Scope:** this package ships the contracts, the registry, the validators, the orchestrator, and one simple,
fully working local-filesystem example target (`createLocalJsonExternalDeploymentTarget`) used to exercise the
SDK end to end. It does **not** ship — and will not accept — a concrete integration for any specific private
RGS/aggregator; wiring a real target's own wire format/transport is left to whoever owns that integration, by
implementing the contracts below directly.

## The pipeline — `ExternalDeploymentService`

```
descriptor validation    ExternalDeploymentTargetDescriptorValidator (always) + extra (additive)
        │  (no error-severity issues)
        ▼
compatibility validation ExternalDeploymentCompatibilityValidator (always) + extra (additive) — before
        │  (no error-severity issues)                                                           any file exists
        ▼
projection                target.roundProjector.project(outcome.artifact) for every outcome —
        │  (no error-severity issues)                                       run by the service itself
        ▼
generation                target.artifactGenerator.generate(projectedModes) — fully in-memory,
        │  (no error-severity issues)                                        already-projected input only
        ▼
artifact validation       StandardExternalArtifactValidator (always)
                           + target.artifactValidator (additive)
                           + extra (additive)                              — structural checks on the output
        │  (no error-severity issues)
        ▼
diagnostic (optional)     target.diagnostic?.diagnose()
        │  (report.ok !== false)
        ▼
delivery (optional)       target.runtimeAdapter?.deliver(result)
```

`ExternalDeploymentService.deploy(target, modes)` runs every stage above, in that fixed order, and stops at the
first stage that reports an error-severity issue — every stage after that is simply never run (its field on the
returned `ExternalDeploymentResult` is `undefined`, not an empty placeholder). This is the recommended single
entry point: calling the individual collaborators (registry, validators, generator, diagnostic, runtime adapter)
directly is still possible for finer-grained control, but `ExternalDeploymentService` is what guarantees the
invariants below actually hold, rather than leaving it to every caller to reimplement correctly:

- **The three built-in validators (descriptor/compatibility/artifact) always run, in full, and cannot be
  disabled or replaced.** They are not constructor parameters — the constructor only accepts an *extra*
  validator per stage, whose own issues are always concatenated onto (never substituted for) the built-in ones.
  A permissive extra validator (one that always returns no issues, whether by design or by accident) can
  therefore never make a genuinely broken target/deployment/artifact set look clean.
- **Projection happens exactly once, inside `deploy()` itself, and nowhere else.** The service calls
  `target.roundProjector.project(...)` for every outcome in every mode — never the generator — and hands the
  generator only the resulting, already-projected input. A generator has no `RoundArtifact`, no
  `ExternalRoundProjector` reference, and nothing generic over the symbol-alphabet type parameter to project
  through, so it has no way to select, ignore, or diverge from the target's own declared projector.
- **A thrown exception from descriptor validation, compatibility validation, projection, generation, or
  artifact validation is always caught and turned into a single error-severity `ValidationIssue`** on that
  stage's own issues — exactly as if the collaborator had reported the problem the normal way — rather than
  propagating out of `deploy()` and rejecting the whole call. Every stage after the one that threw is still
  simply never run.
- **`target.diagnostic`/`target.runtimeAdapter` are never called once an earlier stage has failed** — whether
  that failure was a normally-reported issue or a caught exception.

```ts
import {ExternalDeploymentService} from "pokie";

const result = await new ExternalDeploymentService().deploy(target, modes);

if (result.descriptorIssues.some((i) => i.severity === "error")) { /* nothing else ran at all */ }
if (result.compatibilityIssues.some((i) => i.severity === "error")) { /* projection/generation never ran */ }
if (result.projectionIssues.some((i) => i.severity === "error")) { /* target.artifactGenerator was never called */ }
if (result.generation === undefined) { /* generation never ran (projection failed) */ }
if (result.artifactIssues.some((i) => i.severity === "error")) { /* target.runtimeAdapter was never called */ }
result.diagnostic; // ExternalDeploymentDiagnosticReport | undefined
result.delivery;   // ExternalDeploymentDeliveryResult | undefined
```

## The contracts

| Contract | Kind | Role |
|---|---|---|
| `ExternalDeploymentTarget<T>` | interface | Bundles one target's identity (`id`/`version`), declared contract (`requirements`/`capabilities`), and collaborators (`roundProjector`/`artifactGenerator`, plus optional `artifactValidator`/`runtimeAdapter`/`diagnostic`). Usually built as a plain object literal from a factory function — see `createLocalJsonExternalDeploymentTarget`. |
| `ExternalDeploymentTargetRegistry<T>` | class | A stateful catalog of targets, keyed by `id`. Runs `ExternalDeploymentTargetDescriptorValidator` and refuses a malformed target (`ExternalDeploymentInvalidTargetError`) or a duplicate/case-colliding id (`ExternalDeploymentDuplicateTargetError`). Freezes a successfully registered target (and its `capabilities`/`requirements`) so its identity can never drift after the fact. |
| `ExternalDeploymentTargetDescriptorValidator<T>` | class | Checks a target's own descriptor is well-formed — independent of any content — non-empty `id`/`version`, well-shaped `requirements`, a unique `capabilities` list, and every required/optional collaborator implementing its own contract's method. Run by both the registry and `ExternalDeploymentService` (always, in full — see above). |
| `ExternalDeploymentCompatibilityValidator<T>` | class | Checks one target's `requirements`/`capabilities` against a specific deployment's content, before projection/generation. Always runs via `ExternalDeploymentService`. |
| `ExternalRoundProjector<T>` | interface | One target's own `RoundArtifact<T>` → `JsonObject` projection. Called only by `ExternalDeploymentService`, once per outcome, never by the generator. |
| `ExternalArtifactGenerator` | interface | One target's own already-projected content → files/payloads generation step. Fully in-memory and synchronous — no disk/network I/O. Deliberately *not* generic over `T` and takes `ExternalDeploymentProjectedModeInput[]` — plain JSON, never a `RoundArtifact<T>` or a projector. |
| `ExternalArtifactValidator` | interface | Validates an already-generated `ExternalArtifactGenerationResult`'s own structure. `StandardExternalArtifactValidator` is the SDK's generic, format-agnostic default, and always runs via `ExternalDeploymentService`. |
| `ExternalDeploymentDiagnostic` | interface | Optional self-check of a target's own operational readiness (e.g. "is the output directory writable"), independent of any specific content. |
| `ExternalDeploymentRuntimeAdapter` | interface | Optional transport contract: how an already-generated, already-validated result actually reaches the target (local disk, HTTP push, a queue, ...). Deliberately separate from `ExternalArtifactGenerator` so the same generator is reusable across targets that differ only in how they publish. |
| `ExternalDeploymentService<T>` | class | The single-call orchestrator described above. |

## Target descriptor validation

`ExternalDeploymentTargetDescriptorValidator` checks a target's own shape, regardless of any content:

| Code | Meaning |
|---|---|
| `external-deployment-target-id-invalid` | `id` isn't a non-empty string |
| `external-deployment-target-version-invalid` | `version` isn't a non-empty string |
| `external-deployment-target-requirements-invalid` | `requirements` isn't an object |
| `external-deployment-target-min-pokie-version-invalid` | `requirements.minPokieVersion` doesn't parse as `major.minor.patch` |
| `external-deployment-target-symbol-alphabet-invalid` | `requirements.symbolAlphabet` isn't `"numeric"`/`"any"` |
| `external-deployment-target-requires-homogeneous-provenance-invalid` | `requirements.requiresHomogeneousProvenance` isn't a boolean |
| `external-deployment-target-capabilities-invalid` | `capabilities` isn't an array of non-empty strings |
| `external-deployment-target-duplicate-capability` | the exact same capability declared twice |
| `external-deployment-target-capability-case-collision` | two capabilities differing only in case |
| `external-deployment-target-round-projector-invalid` | `roundProjector` has no `project` method |
| `external-deployment-target-artifact-generator-invalid` | `artifactGenerator` has no `generate` method |
| `external-deployment-target-artifact-validator-invalid` | `artifactValidator` is present but has no `validate` method |
| `external-deployment-target-diagnostic-invalid` | `diagnostic` is present but has no `diagnose` method |
| `external-deployment-target-runtime-adapter-invalid` | `runtimeAdapter` is present but has no `deliver` method |

`ExternalDeploymentTargetRegistry.register()` throws `ExternalDeploymentInvalidTargetError` (never registering
the target) when any of these come back error-severity; `ExternalDeploymentService.deploy()` surfaces the same
issues as `result.descriptorIssues` and stops before compatibility validation ever runs.

## Requirements and capabilities

`ExternalDeploymentRequirements` (declared by a target, checked against content):

| Field | Meaning |
|---|---|
| `minPokieVersion?` | Lowest `provenance.pokieVersion` this target's format is known to understand (major.minor.patch only — see `internal/compareSemverLite`, a deliberately minimal comparator since POKIE has no semver dependency). |
| `symbolAlphabet?` | `"numeric"` requires every screen/step symbol (`T` in `RoundArtifact<T>`) across every deployed outcome to be a `number`. `"any"` (default) places no constraint. |
| `requiresHomogeneousProvenance?` | When true (the default), every mode in one deployment must share the same game id/version, `configHash`, and `pokieVersion` — the same cross-mode check `StakeEngineExportValidator` runs. |

`ExternalDeploymentCapability` is an open string (mirrors `RoundArtifact`'s own `betMode` convention — see that
type's own doc comment) rather than a closed union, so a target can declare its own vocabulary beyond what this
SDK checks. Three well-known ids are understood by `ExternalDeploymentCompatibilityValidator` itself:

| Constant | Checked when... |
|---|---|
| `ROUND_ARTIFACT_FEATURE_EVENTS_CAPABILITY` | any deployed `RoundArtifact`/`RoundStepArtifact` has non-empty `featureEvents` |
| `ROUND_ARTIFACT_DEBUG_METADATA_CAPABILITY` | any deployed `RoundArtifact`/`RoundStepArtifact` has a `debug` field |
| `MULTI_MODE_DEPLOYMENT_CAPABILITY` | more than one `ExternalDeploymentModeInput` is given in one deployment |

A target that doesn't declare one of these gets an error-severity `ValidationIssue` if the deployed content
actually uses the corresponding feature — rejected before projection/generation, not silently dropped or left
for the generator to choke on.

## Compatibility validation issue codes

| Code | Meaning |
|---|---|
| `external-deployment-modes-empty` | no modes given |
| `external-deployment-mode-name-invalid` | a `modeName` isn't a non-empty string |
| `external-deployment-duplicate-mode-name` | the exact same `modeName` used twice |
| `external-deployment-mode-name-case-collision` | two `modeName`s differing only in case |
| `external-deployment-multi-mode-unsupported` | more than one mode given without `MULTI_MODE_DEPLOYMENT_CAPABILITY` |
| `external-deployment-provenance-mismatch` | a mode's provenance doesn't match the deployment's other modes (and `requiresHomogeneousProvenance` wasn't set to `false`) |
| `external-deployment-pokie-version-too-old` | content's `provenance.pokieVersion` is below the target's `minPokieVersion` |
| `external-deployment-pokie-version-not-comparable` | either version string doesn't parse as `major.minor.patch` |
| `external-deployment-symbol-alphabet-invalid` | `symbolAlphabet: "numeric"` but a non-numeric symbol was found |
| `external-deployment-feature-events-unsupported` | content uses feature events without the capability |
| `external-deployment-debug-metadata-unsupported` | content carries `debug` without the capability |

`WeightedOutcomeLibraryValidator` issues from each mode's own library are forwarded first, with the mode name
prefixed onto `message` and added to `details.modeName` — the same "additive, never replacing" convention
`StakeEngineExportValidator` uses.

## Projection — the service's own job, never the generator's

`ExternalDeploymentService` is the *only* thing that ever calls `target.roundProjector.project(...)` — once per
outcome, across every mode — turning each `ExternalDeploymentModeInput<T>` (a raw `WeightedOutcomeLibrary<T>`)
into an `ExternalDeploymentProjectedModeInput` (plain, already-projected JSON):

```ts
type ExternalDeploymentProjectedOutcome = {
    readonly id: string;
    readonly weight: number;
    readonly projected: JsonObject; // target.roundProjector.project(outcome.artifact)
};

type ExternalDeploymentProjectedModeInput = {
    readonly modeName: string;
    readonly libraryId: string;
    readonly libraryHash: string; // computeWeightedOutcomeLibraryHash(mode.library), computed once here
    readonly outcomes: readonly ExternalDeploymentProjectedOutcome[];
};
```

`target.artifactGenerator.generate(projectedModes)` receives only this — never the original library, a
`RoundArtifact`, or the projector itself. That's not just documentation: `ExternalArtifactGenerator` isn't even
generic over `T`, so nothing in its own type signature could reference a `RoundArtifact<T>` even if an
implementation tried to reach for one.

| Code | Meaning |
|---|---|
| `external-deployment-projection-failed` | `target.roundProjector.project(...)` threw for a specific outcome |
| `external-deployment-projection-not-json-safe` | a projector's output for a specific outcome isn't canonical-JSON-safe (`NaN`/`Infinity`, a cycle, ...) |
| `external-deployment-library-hash-failed` | computing a mode's own library hash failed |

Projection issues are collected across every outcome in every mode before stopping (so one `deploy()` call
surfaces every problem, not just the first) — but `generation` is only ever attempted once no projection issue
is error-severity.

## Artifact validation (`StandardExternalArtifactValidator`)

Runs against `ExternalArtifactGenerationResult`, independent of which target produced it, and always runs via
`ExternalDeploymentService` regardless of whether the target also declares its own `artifactValidator`. Never
throws — even a `result` that doesn't remotely match the expected shape (not an object, `artifacts`/`issues` not
arrays, an artifact entry that's `null` or has a non-string `relativePath`/non-string-non-`Buffer` `content`)
comes back as a structured issue, never an exception:

| Code | Meaning |
|---|---|
| `external-artifact-generation-result-invalid` | `result` isn't an object, or `artifacts`/`issues` isn't an array |
| `external-artifact-shape-invalid` | an entry in `artifacts` isn't an object |
| `external-artifact-relative-path-invalid` | an artifact's `relativePath` isn't a string |
| `external-artifact-content-type-invalid` | an artifact's `content` is neither a `string` nor a `Buffer` |
| `external-artifact-path-unsafe` | `relativePath` is empty, absolute, or escapes its own root via `".."` |
| `external-artifact-duplicate-path` | two artifacts share the exact same `relativePath` |
| `external-artifact-path-case-collision` | two `relativePath`s differ only in case |
| `external-artifact-content-empty` | an artifact's content is empty |
| `external-artifact-json-invalid` | a `.json`-named artifact's content doesn't parse |

A target with further format-specific invariants (e.g. "every path listed in the index file must exist in the
artifact set") should implement its own `ExternalArtifactValidator` for those — never as a *replacement* for
`StandardExternalArtifactValidator`, only ever alongside it (and `ExternalDeploymentService` enforces that:
`StandardExternalArtifactValidator` is not a constructor parameter, so there's no way to swap it out even by
accident).

## Extra validators — additive only

`ExternalDeploymentService`'s constructor accepts one *extra* validator per stage —
`new ExternalDeploymentService(extraDescriptorValidator?, extraCompatibilityValidator?, extraArtifactValidator?)`
— each layered strictly on top of the corresponding built-in validator, never in place of it. There is no
constructor parameter that replaces a built-in validator; a permissive extra validator (one that always returns
`[]`) can add nothing and take nothing away — the built-in one's own issues are always present regardless. A
thrown exception from any validator — built-in or extra — is caught and converted into a single
`external-deployment-{extra-,}{descriptor,compatibility,artifact}-validator-threw` error issue rather than
propagating out of `deploy()`.

## The local example target

`createLocalJsonExternalDeploymentTarget({id?, version?, outDir})` builds a fully working target that writes one
pretty-printed JSON file per outcome (via the standard `PokieJsonRoundArtifactProjector`, reused rather than
re-implemented — see `LocalJsonExternalRoundProjector`), plus a top-level `index.json`. It declares every
capability this SDK currently knows about, since its own JSON projection has no reason to reject any of them — a
real target should only declare what its own format genuinely supports.

Neither a mode's own `modeName` nor an outcome's own `id` is ever used directly as a path segment — both are
caller-supplied strings this SDK has no reason to trust as path-safe. Every directory/file name is instead
`encodeLocalExternalDeploymentPathSegment(...)` — a deterministic sha256-hex encoding, always exactly 64
lowercase hex characters, so it can never itself be `".."` or contain a path separator — with the original raw
`modeName`/outcome `id` preserved as data inside `index.json`:

```json
{
    "modes": [
        {
            "modeName": "base",
            "directory": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08/",
            "libraryId": "lib",
            "libraryHash": "sha256:...",
            "outcomeCount": 2,
            "outcomes": [
                {"id": "win", "file": "0d0d34d7534b9fcf...json"},
                {"id": "loss", "file": "3ba57f26fce6...json"}
            ]
        }
    ]
}
```

```ts
import {ExternalDeploymentService, ExternalDeploymentTargetRegistry, createLocalJsonExternalDeploymentTarget} from "pokie";

const target = createLocalJsonExternalDeploymentTarget({outDir: "./out/local-example"});

const registry = new ExternalDeploymentTargetRegistry();
registry.register(target); // throws if the descriptor is malformed or the id collides

const modes = [{modeName: "base", library /* a WeightedOutcomeLibrary */}];
const result = await new ExternalDeploymentService().deploy(target, modes);

if (result.delivery?.delivered) {
    console.log(`wrote ${result.generation?.artifacts.length} files under ./out/local-example`);
}
```

### Atomic delivery

`LocalFileExternalDeploymentRuntimeAdapter` delivers via `atomicallyWriteExternalDeploymentArtifactsToDirectory`
— the whole artifact set is built into a fresh temporary sibling directory first, and only swapped into `outDir`
(a directory rename) once every file has been written successfully. That gives the same guarantees
`StakeEngineExporter`'s own directory publish does (see [Stake Engine Export](stake-engine-export.md#rebuild-safety--the-whole-directory-is-replaced-atomically)):
a write failure anywhere before the swap leaves an existing `outDir` completely untouched with no temp directory
left behind; a failure during the swap itself either leaves `outDir` untouched or is rolled back to exactly what
it was; only removing the now-superseded stale backup after a successful publish is treated as cosmetic (a
warning-severity `ValidationIssue` in `delivery.issues`, never a thrown error).

`writeExternalDeploymentArtifactsToDirectory(artifacts, outDir)` — the non-atomic, one-file-at-a-time primitive
both the atomic helper and any other target-specific transport can build on — is exported directly too. Every
`relativePath` is checked to stay inside `outDir` in both helpers; one that escapes via `".."` or is absolute
throws rather than writing outside it.

## Writing your own target

1. Implement `ExternalRoundProjector<T>` for your format's own round shape (or reuse `PokieJsonRoundArtifactProjector`
   directly, the way the local example does, if canonical JSON is close enough). This is the only piece of the
   SDK that ever sees a `RoundArtifact<T>` — `ExternalDeploymentService` calls it for you.
2. Implement `ExternalArtifactGenerator`, consuming `ExternalDeploymentProjectedModeInput[]` — already-projected
   plain JSON, nothing generic over `T`. Never derive a file/path name directly from caller-supplied data (a
   `modeName`, an outcome `id`) — encode it deterministically first, the way
   `LocalJsonExternalArtifactGenerator` does, and keep the original value recoverable as data instead.
3. Declare `requirements`/`capabilities` honestly — only the capabilities your format actually supports, only
   the requirements your format actually needs.
4. Optionally implement `ExternalArtifactValidator` for format-specific output checks beyond
   `StandardExternalArtifactValidator`'s generic ones (additive only — `ExternalDeploymentService` always runs
   `StandardExternalArtifactValidator` regardless), and `ExternalDeploymentRuntimeAdapter`/
   `ExternalDeploymentDiagnostic` for your own transport.
5. Assemble the pieces into an `ExternalDeploymentTarget<T>` (a plain object literal is enough — see
   `createLocalJsonExternalDeploymentTarget`) and register it with an `ExternalDeploymentTargetRegistry`. Once
   registered, the target is frozen — its `id`, `capabilities`, and `requirements` can no longer be reassigned.
6. Deploy through `ExternalDeploymentService` rather than calling the individual collaborators by hand, so the
   ordering/short-circuiting guarantees above always hold. Pass an *extra* validator to the constructor for a
   further, project-specific check — never to replace a built-in one, since that isn't possible.
