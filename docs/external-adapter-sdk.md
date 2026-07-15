[← Back to docs index](README.md)

# External Adapter SDK

`externaladapter/` is a small, generic SDK for deploying canonical [`WeightedOutcomeLibrary`](weighted-outcome-library.md)
content to an *external* target — a specific external format or RGS/aggregator-style consumer — without POKIE
itself needing to know anything about that target's own wire format. It's the same relationship
[Stake Engine Export](stake-engine-export.md) has to the real Stake math-sdk format, generalized: instead of one
fixed exporter for one fixed format, this SDK is a set of contracts a target author implements once, plus a
`ExternalDeploymentTargetRegistry` and `ExternalDeploymentCompatibilityValidator` shared by every target.

**Scope:** this package ships the contracts, the registry, the compatibility validator, and one simple, fully
working local-filesystem example target (`createLocalJsonExternalDeploymentTarget`) used to exercise the SDK end
to end. It does **not** ship — and will not accept — a concrete integration for any specific private RGS/
aggregator; wiring a real target's own wire format/transport is left to whoever owns that integration, by
implementing the contracts below directly.

## The pipeline

```
register(target)             ExternalDeploymentTargetRegistry
        │
        ▼
validate(target, modes)      ExternalDeploymentCompatibilityValidator   — before any file exists
        │  (no error-severity issues)
        ▼
generate(modes)              target.artifactGenerator                  — fully in-memory
        │
        ▼
validate(result)             target.artifactValidator (or Standard…)   — structural checks on the output
        │
        ▼
diagnose() / deliver(result) target.diagnostic / target.runtimeAdapter — optional, transport-specific
```

Compatibility validation always runs *before* `generate()` — a target's own generator never has to defend
against content it's fundamentally not built to handle (wrong symbol alphabet, an unsupported feature, more
modes than it can express); `ExternalArtifactValidator` runs *after*, against the generator's own output, and
catches a different class of problem (unsafe/duplicate paths, malformed content) regardless of which target
produced it.

Every step here goes through the target's own `roundProjector` for turning a `RoundArtifact` into output — never
a second, independent calculation path (see `ExternalRoundProjector`'s own doc comment, the same rule
`RoundArtifact` itself states for every projection in this package).

## The contracts

| Contract | Kind | Role |
|---|---|---|
| `ExternalDeploymentTarget<T>` | interface | Bundles one target's identity (`id`/`version`), declared contract (`requirements`/`capabilities`), and collaborators (`roundProjector`/`artifactGenerator`, plus optional `artifactValidator`/`runtimeAdapter`/`diagnostic`). Usually built as a plain object literal from a factory function — see `createLocalJsonExternalDeploymentTarget`. |
| `ExternalDeploymentTargetRegistry<T>` | class | A stateful catalog of targets, keyed by `id`. Refuses to register a duplicate or case-colliding id (throws `ExternalDeploymentDuplicateTargetError`). |
| `ExternalDeploymentCompatibilityValidator<T>` | class | Checks one target's `requirements`/`capabilities` against a specific deployment's content, before generation. Implements `ExternalDeploymentCompatibilityValidating<T>` (the usual `ValidationRule<T>`-based interface every validator in this package implements). |
| `ExternalRoundProjector<T>` | interface | One target's own `RoundArtifact<T>` → `JsonObject` projection. Every generator must go through its target's own projector, never recompute independently. |
| `ExternalArtifactGenerator<T>` | interface | One target's own content → files/payloads generation step. Fully in-memory and synchronous — no disk/network I/O. |
| `ExternalArtifactValidator` | interface | Validates an already-generated `ExternalArtifactGenerationResult`'s own structure. `StandardExternalArtifactValidator` is the SDK's generic, format-agnostic default. |
| `ExternalDeploymentDiagnostic` | interface | Optional self-check of a target's own operational readiness (e.g. "is the output directory writable"), independent of any specific content. |
| `ExternalDeploymentRuntimeAdapter` | interface | Optional transport contract: how an already-generated result actually reaches the target (local disk, HTTP push, a queue, ...). Deliberately separate from `ExternalArtifactGenerator` so the same generator is reusable across targets that differ only in how they publish. |

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
actually uses the corresponding feature — rejected before generation, not silently dropped or left for the
generator to choke on.

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

## Artifact validation (`StandardExternalArtifactValidator`)

Runs against `ExternalArtifactGenerationResult.artifacts`, independent of which target produced them:

| Code | Meaning |
|---|---|
| `external-artifact-path-unsafe` | `relativePath` is empty, absolute, or escapes its own root via `".."` |
| `external-artifact-duplicate-path` | two artifacts share the exact same `relativePath` |
| `external-artifact-path-case-collision` | two `relativePath`s differ only in case |
| `external-artifact-content-empty` | an artifact's content is empty |
| `external-artifact-json-invalid` | a `.json`-named artifact's content doesn't parse |

A target with further format-specific invariants (e.g. "every path listed in the index file must exist in the
artifact set") should implement its own `ExternalArtifactValidator` instead of relying on this one alone.

## The local example target

`createLocalJsonExternalDeploymentTarget({id?, version?, outDir})` builds a fully working target that writes one
pretty-printed JSON file per outcome (via the standard `PokieJsonRoundArtifactProjector`, reused rather than
re-implemented — see `LocalJsonExternalRoundProjector`) to `<outDir>/<modeName>/<outcomeId>.json`, plus a top-level
`index.json` listing every mode's `libraryId`/`libraryHash`/outcome count. It declares every capability this SDK
currently knows about, since its own JSON projection has no reason to reject any of them — a real target should
only declare what its own format genuinely supports.

```ts
import {
    ExternalDeploymentCompatibilityValidator,
    ExternalDeploymentTargetRegistry,
    createLocalJsonExternalDeploymentTarget,
} from "pokie";

const target = createLocalJsonExternalDeploymentTarget({outDir: "./out/local-example"});

const registry = new ExternalDeploymentTargetRegistry();
registry.register(target);

const modes = [{modeName: "base", library /* a WeightedOutcomeLibrary */}];

const compatibilityIssues = new ExternalDeploymentCompatibilityValidator().validate({target, modes});
if (compatibilityIssues.some((issue) => issue.severity === "error")) {
    throw new Error("deployment is not compatible with this target");
}

const generationResult = target.artifactGenerator.generate(modes);
const artifactIssues = target.artifactValidator?.validate(generationResult) ?? [];
if (artifactIssues.some((issue) => issue.severity === "error")) {
    throw new Error("generated artifacts failed validation");
}

await target.diagnostic?.diagnose(); // {ok, checks} — e.g. is outDir writable
await target.runtimeAdapter?.deliver(generationResult); // writes every artifact under outDir
```

`writeExternalDeploymentArtifactsToDirectory(artifacts, outDir)` — the plain helper
`LocalFileExternalDeploymentRuntimeAdapter` is built on — is exported directly too, for a target that wants local
persistence without a full runtime adapter. Every `relativePath` is checked to stay inside `outDir`; one that
escapes via `".."` or is absolute throws rather than writing outside it.

## Writing your own target

1. Implement `ExternalRoundProjector<T>` for your format's own round shape (or reuse `PokieJsonRoundArtifactProjector`
   directly, the way the local example does, if canonical JSON is close enough).
2. Implement `ExternalArtifactGenerator<T>`, going through that projector for every outcome, reporting a
   per-outcome failure as an error-severity `ValidationIssue` and returning `artifacts: []` when any occur — no
   partial generation.
3. Declare `requirements`/`capabilities` honestly — only the capabilities your format actually supports, only
   the requirements your format actually needs.
4. Optionally implement `ExternalArtifactValidator` for format-specific output checks beyond
   `StandardExternalArtifactValidator`'s generic ones, and `ExternalDeploymentRuntimeAdapter`/
   `ExternalDeploymentDiagnostic` for your own transport.
5. Assemble the pieces into an `ExternalDeploymentTarget<T>` (a plain object literal is enough — see
   `createLocalJsonExternalDeploymentTarget`) and register it with an `ExternalDeploymentTargetRegistry`.
