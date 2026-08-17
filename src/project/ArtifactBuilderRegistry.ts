import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import {ArtifactBuildConflictError} from "./ArtifactBuildConflictError.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import type {ArtifactBuildTargetDescriptor} from "./ArtifactBuildTargetDescriptor.js";
import type {ArtifactDestinationCheck} from "./ArtifactDestinationCheck.js";
import type {ArtifactTargetType} from "./ArtifactTargetType.js";
import {describeUnsupportedProjectOperation} from "./describeUnsupportedProjectOperation.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import {OutcomeLibraryArtifactBuilder} from "./OutcomeLibraryArtifactBuilder.js";
import {ParWorkbookArtifactBuilder} from "./ParWorkbookArtifactBuilder.js";
import type {PokieProject} from "./PokieProject.js";
import {
    BUILD_OPERATION,
    OPERATION_REQUIRED_CAPABILITY,
    OUTCOME_LIBRARY_BUILD_OPERATION,
    PAR_EXPORT_OPERATION,
    STAKE_ENGINE_EXPORT_OPERATION,
    WASM_EXPORT_OPERATION,
    type PokieOperation,
} from "./PokieOperation.js";
import {PROJECT_TYPE_CAPABILITIES} from "./ProjectCapabilities.js";
import type {ProjectType} from "./ProjectType.js";
import {StakeAdapterArtifactBuilder} from "./StakeAdapterArtifactBuilder.js";
import {TsPackageArtifactBuilder} from "./TsPackageArtifactBuilder.js";
import {BlueprintStakeOutcomeLibraryWorkflow} from "./BlueprintStakeOutcomeLibraryWorkflow.js";
import {loadGameBlueprint} from "../generated/loadGameBlueprint.js";

// Which PokieOperation actually produces each ArtifactTargetType as a brand-new artifact -- "build" writes a
// tsPackage, "outcomeLibrary.build" writes an outcomeLibrary bundle, "stakeEngine.export" writes a stakeAdapter
// export, "par.export" writes a parWorkbook file, "wasm.export" would write a wasm build. Every other
// PokieOperation (sim, replay, validate, ...) reads an already-built project rather than producing a new
// artifact type, so has no entry here -- this map is deliberately only the "build direction" subset of
// PokieOperation.
const TARGET_OPERATION: Readonly<Record<ArtifactTargetType, PokieOperation>> = {
    tsPackage: BUILD_OPERATION,
    outcomeLibrary: OUTCOME_LIBRARY_BUILD_OPERATION,
    stakeAdapter: STAKE_ENGINE_EXPORT_OPERATION,
    parWorkbook: PAR_EXPORT_OPERATION,
    wasm: WASM_EXPORT_OPERATION,
};

// Explicit, per-target statement of what building that target does NOT promise -- see
// ArtifactBuildTargetDescriptor's own "unsupportedNotes" field doc comment for why this exists as prose rather
// than being left for a reader to infer from an empty/narrow "supportedSources" array alone.
const UNSUPPORTED_NOTES: Readonly<Record<ArtifactTargetType, readonly string[]>> = {
    tsPackage: [
        'Builds a runnable package from its own GameBlueprint source only -- never compiles or targets WASM, ' +
            "and a built package cannot itself be converted into any other target type.",
    ],
    outcomeLibrary: [
        "Packages already-computed weighted outcomes into a bundle -- never re-derives or recovers the game " +
            "model/blueprint that produced those outcomes; that recovery is not supported by any builder.",
    ],
    stakeAdapter: [
        "Exports an already-computed canonical outcome library (or, for a Blueprint, first resolves or generates and registers its compatible canonical outcome library) into Stake " +
            "Engine's own book-line format -- never re-derives or recovers the game model/blueprint that produced " +
            "those outcomes; that recovery is not supported by any builder.",
    ],
    parWorkbook: [
        "Exports an already-loaded PAR sheet model to its own .xlsx workbook format only -- does not derive a " +
            "PAR sheet from a package/blueprint on its own.",
    ],
    wasm: [
        'No ProjectType grants the capability this target requires and no builder is registered for it -- ' +
            'POKIE has no arbitrary package-to-WASM compiler today (see ProjectType.ts\'s own "wasm" doc comment).',
    ],
};

const ALL_PROJECT_TYPES = Object.keys(PROJECT_TYPE_CAPABILITIES) as ProjectType[];

function buildDescriptor(target: ArtifactTargetType): ArtifactBuildTargetDescriptor {
    const operation = TARGET_OPERATION[target];
    const requiredSourceCapability = OPERATION_REQUIRED_CAPABILITY[operation];
    if (requiredSourceCapability === undefined) {
        throw new Error(`ArtifactBuilderRegistry has no OPERATION_REQUIRED_CAPABILITY entry for "${operation}".`);
    }

    const supportedSources = ALL_PROJECT_TYPES.filter((type) => PROJECT_TYPE_CAPABILITIES[type].includes(requiredSourceCapability));

    return {
        target,
        operation,
        requiredSourceCapability,
        supportedSources,
        unsupportedNotes: UNSUPPORTED_NOTES[target],
    };
}

// Every target with a real, atomic builder today -- "wasm" is deliberately absent (see UNSUPPORTED_NOTES.wasm
// above and ArtifactBuilderRegistry.test.ts's own "truthfully reports wasm as buildable from no source type
// today"): no ProjectType grants WASM_EXPORT_CAPABILITY, so there is nothing a "wasm" builder could ever be
// invoked against, and none is registered.
function buildDefaultBuilders(pokieVersion: string): ReadonlyMap<ArtifactTargetType, ArtifactBuilder> {
    return new Map<ArtifactTargetType, ArtifactBuilder>([
        ["tsPackage", new TsPackageArtifactBuilder(pokieVersion)],
        ["outcomeLibrary", new OutcomeLibraryArtifactBuilder(pokieVersion)],
        ["stakeAdapter", new StakeAdapterArtifactBuilder(pokieVersion)],
        ["parWorkbook", new ParWorkbookArtifactBuilder(pokieVersion)],
    ]);
}

// The single place a caller asks "what does building <target> require, and from which source types is that
// supported today" (describe/listTargets/supportsConversionFrom -- computed once from the same
// OPERATION_REQUIRED_CAPABILITY/PROJECT_TYPE_CAPABILITIES contracts describeUnsupportedProjectOperation already
// reads, never a second, independently-authored requirement), AND the single place that actually executes a
// build: build() re-checks the same capability describe() reports, then hands off to the concrete
// ArtifactBuilder already wired to POKIE's own already-atomic per-target writers (GamePackageGenerator,
// OutcomeLibraryBundleWriter, StakeEngineImporter/StakeEngineExporter, ParSheetImporter/ParSheetExporter) --
// see each builder's own doc comment for exactly what it reads/writes. Every builder here is deliberately a
// same-type republish (blueprint->tsPackage is the direct conversion; blueprint->stakeAdapter is the one
// registry-owned prerequisite workflow, resolving a canonical Outcome Library before delegating back to the
// Stake builder; every other target only republishes an already-built artifact of its own type) -- see
// UNSUPPORTED_NOTES for what each target's build explicitly does NOT promise.
export class ArtifactBuilderRegistry {
    private readonly descriptors: ReadonlyMap<ArtifactTargetType, ArtifactBuildTargetDescriptor>;
    private readonly builders: ReadonlyMap<ArtifactTargetType, ArtifactBuilder>;
    private readonly blueprintStakeWorkflow: BlueprintStakeOutcomeLibraryWorkflow;

    constructor(pokieVersion = "0.0.0", builders: ReadonlyMap<ArtifactTargetType, ArtifactBuilder> = buildDefaultBuilders(pokieVersion)) {
        const descriptors = new Map<ArtifactTargetType, ArtifactBuildTargetDescriptor>();
        for (const target of Object.keys(TARGET_OPERATION) as ArtifactTargetType[]) {
            descriptors.set(target, buildDescriptor(target));
        }
        this.descriptors = descriptors;
        this.builders = builders;
        this.blueprintStakeWorkflow = new BlueprintStakeOutcomeLibraryWorkflow(pokieVersion, loadGameBlueprint);
    }

    public listTargets(): readonly ArtifactTargetType[] {
        return Array.from(this.descriptors.keys());
    }

    public describe(target: ArtifactTargetType): ArtifactBuildTargetDescriptor {
        const descriptor = this.descriptors.get(target);
        if (descriptor === undefined) {
            throw new Error(`ArtifactBuilderRegistry has no descriptor for target "${target}".`);
        }
        return descriptor;
    }

    // Whether `source` grants the capability `target` requires -- the same check
    // describeUnsupportedProjectOperation performs for a PokieOperation, exposed target-first so a caller
    // building toward a specific artifact doesn't need to know which PokieOperation id backs it.
    public supportsConversionFrom(target: ArtifactTargetType, source: ProjectType): boolean {
        return this.describe(target).supportedSources.includes(source);
    }

    // Executes a real build: re-validates `source` against `target`'s own required capability (the exact
    // capability diagnostic describe()/supportsConversionFrom() already report, checked again here so build()
    // is safe to call directly without a caller re-deriving the same check itself), then hands off to the
    // registered ArtifactBuilder. Throws (never silently no-ops) when `target` has no registered builder today
    // ("wasm") -- with the same unsupportedNotes describe() already exposes, so the message a caller sees here
    // is never a second, differently-worded "not supported" statement.
    public build(target: ArtifactTargetType, source: PokieProject, destinationPath: string): Promise<ArtifactBuildResult> {
        if (target === "stakeAdapter" && source.type === "blueprint") {
            return this.blueprintStakeWorkflow.resolveOrGenerate(source).then((outcomeLibrary) => this.build("stakeAdapter", outcomeLibrary, destinationPath));
        }
        const descriptor = this.describe(target);
        const diagnostic = describeUnsupportedProjectOperation(source, descriptor.operation);
        if (diagnostic !== undefined) {
            return Promise.reject(new Error(diagnostic.message));
        }

        const builder = this.builders.get(target);
        if (builder === undefined) {
            return Promise.reject(
                new Error(`"${target}" has no builder implemented yet. ${descriptor.unsupportedNotes.join(" ")}`),
            );
        }

        return builder.build(source, destinationPath);
    }

    // Reports whether `destinationPath` would be accepted by `target`'s own build() -- the exact same
    // assertArtifactDestinationAvailable() precondition build() enforces before ever invoking a builder, off
    // the same builder-owned destinationKind, but without invoking the builder (and so without ever reading
    // `source` or touching the filesystem beyond the same existence/emptiness check build() itself performs).
    // Lets a caller (a Studio build-preview panel) report the identical conflict a real build would hit
    // before ever attempting one, rather than re-deriving "file" vs "directory" per target itself. Throws
    // (same as build()) when `target` has no registered builder today -- there is no destinationKind to check
    // against.
    public checkDestination(target: ArtifactTargetType, destinationPath: string): ArtifactDestinationCheck {
        const builder = this.builders.get(target);
        if (builder === undefined) {
            const descriptor = this.describe(target);
            throw new Error(`"${target}" has no builder implemented yet. ${descriptor.unsupportedNotes.join(" ")}`);
        }

        try {
            assertArtifactDestinationAvailable(destinationPath, builder.destinationKind);
            return {available: true};
        } catch (error) {
            if (error instanceof ArtifactBuildConflictError) {
                return {available: false, message: error.message};
            }
            throw error;
        }
    }
}
