import type {ArtifactBuildTargetDescriptor} from "./ArtifactBuildTargetDescriptor.js";
import type {ArtifactTargetType} from "./ArtifactTargetType.js";
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
        "Exports already-computed weighted outcomes into Stake Engine's own book-line format -- never " +
            "re-derives or recovers the game model/blueprint that produced those outcomes; that recovery is not " +
            "supported by any builder.",
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
        requiredSourceCapability,
        supportedSources,
        unsupportedNotes: UNSUPPORTED_NOTES[target],
    };
}

// The single place a caller asks "what does building <target> require, and from which source types is that
// supported today" -- one descriptor per ArtifactTargetType (see ArtifactBuildTargetDescriptor), computed once
// from the same OPERATION_REQUIRED_CAPABILITY/PROJECT_TYPE_CAPABILITIES contracts
// describeUnsupportedProjectOperation already reads, never a second, independently-authored requirement.
// Deliberately description-only today, same as ProjectMaterializing was contract-only in P3-POLISH-02: this
// registry answers "can I build this, and from what" without invoking any builder or touching a filesystem --
// wiring a concrete ArtifactBuilder per target to POKIE's own already-atomic writers (GamePackageGenerator,
// OutcomeLibraryBundleWriter, StakeEngineExporter/StakeEngineBundleStreamingExporter, ParSheetExporter) is
// exactly the "replacing build semantics" work this registry exists BEFORE.
export class ArtifactBuilderRegistry {
    private readonly descriptors: ReadonlyMap<ArtifactTargetType, ArtifactBuildTargetDescriptor>;

    constructor() {
        const descriptors = new Map<ArtifactTargetType, ArtifactBuildTargetDescriptor>();
        for (const target of Object.keys(TARGET_OPERATION) as ArtifactTargetType[]) {
            descriptors.set(target, buildDescriptor(target));
        }
        this.descriptors = descriptors;
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
}
