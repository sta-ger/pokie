import path from "path";
import type {ArtifactTargetType} from "./ArtifactTargetType.js";
import type {PokieProject} from "./PokieProject.js";
import {
    BLUEPRINT_BUILD_CAPABILITY,
    OUTCOME_LIBRARY_GENERATE_CAPABILITY,
    OUTCOME_LIBRARY_READ_CAPABILITY,
    PAR_WORKBOOK_EXCHANGE_CAPABILITY,
    STAKE_ADAPTER_EXPORT_CAPABILITY,
    type ProjectCapability,
} from "./ProjectCapability.js";
import {PROJECT_TYPE_CAPABILITIES} from "./ProjectCapabilities.js";
import type {ProjectType} from "./ProjectType.js";

/** A stable description of the input or output of a conversion. */
export type ArtifactIdentity = {
    readonly kind: ProjectType | ArtifactTargetType;
    readonly canonicalLocation?: string;
    readonly recognitionProvenance?: string;
    readonly capabilities: readonly ProjectCapability[];
    readonly configurationProvenance?: ArtifactConfigurationProvenance;
};

/** Configuration facts that make generated artifacts safe to reuse. */
export type ArtifactConfigurationProvenance = {
    readonly configurationHash?: string;
    readonly pokieVersion?: string;
    readonly generationSemantics?: "exact" | "boundedSample";
    readonly gameId?: string;
    readonly gameVersion?: string;
    readonly manifestIdentity?: string;
};

export type ArtifactConversionStepKind =
    | "publish"
    | "materializeRuntime"
    | "generateOutcomeLibrary"
    | "reuseManagedOutcomeLibrary";

export type ArtifactConversionStep = {
    readonly kind: ArtifactConversionStepKind;
    readonly input: ArtifactIdentity;
    readonly output: ArtifactIdentity;
    readonly choice: "materialize" | "reuse" | "publish";
    readonly estimatedWork: "none" | "read" | "materialize" | "generate" | "publish";
    readonly losses?: readonly string[];
};

export type ArtifactConversionDiagnostic = {
    readonly code: "missing-capability" | "missing-data" | "unsupported-boundary" | "stale-provenance" | "destination-conflict";
    readonly failedEdge: {readonly from: ProjectType; readonly to: ArtifactTargetType};
    readonly message: string;
    readonly recovery: string;
};

export type ArtifactConversionPreflight = {
    readonly destinationKind: "file" | "directory";
    readonly estimatedWork: "none" | "read" | "materialize" | "generate" | "publish";
    readonly losses: readonly string[];
    readonly oneWay: boolean;
};

export type ArtifactConversionPlan = {
    readonly status: "planned" | "unavailable" | "conflict";
    readonly source: ArtifactIdentity;
    readonly target: ArtifactIdentity;
    readonly steps: readonly ArtifactConversionStep[];
    readonly preflight: ArtifactConversionPreflight;
    readonly diagnostic?: ArtifactConversionDiagnostic;
};

// Presentation-only compatibility wording for callers that historically showed the product matrix.  It is
// derived from a planner result (rather than used to choose an edge), so execution and preflight always retain
// the richer failed-edge diagnostic even while long-lived CLI/Studio text remains recognizable.
export function describeArtifactConversionPlanDiagnostic(plan: ArtifactConversionPlan): string | undefined {
    const diagnostic = plan.diagnostic;
    if (diagnostic === undefined) return undefined;
    const sourceNames: Readonly<Record<ProjectType, string>> = {
        blueprint: "Game Blueprint", tsPackage: "POKIE game package", outcomeLibrary: "Outcome Library",
        stakeAdapter: "Stake Engine export", parWorkbook: "PAR workbook", wasm: "POKIE WASM component",
    };
    const targetNames: Readonly<Record<ArtifactTargetType, string>> = {
        tsPackage: "POKIE game package", outcomeLibrary: "Outcome Library", stakeAdapter: "Stake Engine export", parWorkbook: "PAR workbook",
    };
    const prerequisites: Readonly<Record<ArtifactTargetType, {missing: string; next: string}>> = {
        tsPackage: {missing: "a Game Blueprint source", next: "Open a Game Blueprint, then run `pokie build <path> --target tsPackage`."},
        outcomeLibrary: {missing: "a Game Blueprint, POKIE game package, or Outcome Library", next: "Open one of those sources, then run `pokie build <path> --target outcomeLibrary`."},
        stakeAdapter: {missing: "a Game Blueprint, POKIE game package, Outcome Library, or Stake Engine export", next: "Open one of those sources, then run `pokie build <path> --target stakeAdapter`."},
        parWorkbook: {missing: "a Game Blueprint or PAR workbook", next: "Open a Game Blueprint or PAR workbook, then run `pokie build <path> --target parWorkbook`."},
    };
    const {from, to} = diagnostic.failedEdge;
    const sourcePath = plan.source.canonicalLocation;
    const subject = sourcePath === undefined ? `A ${sourceNames[from]}` : `"${sourcePath}" is a ${sourceNames[from]}`;
    return `${subject}. It cannot build a ${targetNames[to]}. Missing prerequisite: ${prerequisites[to].missing}. Next: ${prerequisites[to].next}`;
}

export type ArtifactConversionPlanningOptions = {
    readonly destinationPath?: string;
    readonly generationSemantics?: "exact" | "boundedSample";
    /** A registry lookup may offer a managed outcome bundle. It is reusable only when independently verified. */
    readonly managedOutcome?: {readonly identity: ArtifactIdentity; readonly verified: boolean; readonly staleReason?: string};
};

const TARGET_CAPABILITIES: Readonly<Record<ArtifactTargetType, readonly ProjectCapability[]>> = {
    tsPackage: PROJECT_TYPE_CAPABILITIES.tsPackage,
    outcomeLibrary: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
    stakeAdapter: PROJECT_TYPE_CAPABILITIES.stakeAdapter,
    parWorkbook: PROJECT_TYPE_CAPABILITIES.parWorkbook,
};

const DESTINATION_KIND: Readonly<Record<ArtifactTargetType, "file" | "directory">> = {
    tsPackage: "directory",
    outcomeLibrary: "directory",
    stakeAdapter: "directory",
    parWorkbook: "file",
};

const TARGETS: readonly ArtifactTargetType[] = ["tsPackage", "outcomeLibrary", "stakeAdapter", "parWorkbook"];

// A target capability alone is insufficient: a Blueprint can publish a PAR workbook because it retains
// the game model, while an already-published workbook can only republish itself.  These are the actual
// executable edges, and are deliberately checked against the capabilities stamped on the resolved source.
const EDGE_CAPABILITIES: Readonly<Partial<Record<ProjectType, Readonly<Partial<Record<ArtifactTargetType, ProjectCapability>>>>>> = {
    blueprint: {tsPackage: BLUEPRINT_BUILD_CAPABILITY, outcomeLibrary: OUTCOME_LIBRARY_GENERATE_CAPABILITY, stakeAdapter: STAKE_ADAPTER_EXPORT_CAPABILITY, parWorkbook: BLUEPRINT_BUILD_CAPABILITY},
    tsPackage: {outcomeLibrary: OUTCOME_LIBRARY_GENERATE_CAPABILITY, stakeAdapter: STAKE_ADAPTER_EXPORT_CAPABILITY},
    outcomeLibrary: {outcomeLibrary: OUTCOME_LIBRARY_READ_CAPABILITY, stakeAdapter: STAKE_ADAPTER_EXPORT_CAPABILITY},
    stakeAdapter: {stakeAdapter: STAKE_ADAPTER_EXPORT_CAPABILITY},
    parWorkbook: {parWorkbook: PAR_WORKBOOK_EXCHANGE_CAPABILITY},
};

export function resolveArtifactIdentity(project: PokieProject): ArtifactIdentity {
    return {
        kind: project.type,
        canonicalLocation: path.resolve(project.rootPath),
        recognitionProvenance: project.provenance,
        capabilities: project.capabilities,
        ...(project.configurationProvenance === undefined ? {} : {configurationProvenance: project.configurationProvenance}),
    };
}

/**
 * The sole product conversion graph. It intentionally describes real data flow instead of inferring a
 * conversion from source/target names: Outcome and Stake never regain a game model, PAR is a snapshot,
 * and WASM is inspection metadata only.
 */
export class ArtifactConversionPlanner {
    public listTargets(): readonly ArtifactTargetType[] {
        return TARGETS;
    }

    public plan(source: PokieProject, target: ArtifactTargetType, options: ArtifactConversionPlanningOptions = {}): ArtifactConversionPlan {
        return this.planIdentity(resolveArtifactIdentity(source), target, options);
    }

    public planType(source: ProjectType, target: ArtifactTargetType): ArtifactConversionPlan {
        return this.planIdentity({kind: source, capabilities: PROJECT_TYPE_CAPABILITIES[source]}, target);
    }

    public planIdentity(source: ArtifactIdentity, targetKind: ArtifactTargetType, options: ArtifactConversionPlanningOptions = {}): ArtifactConversionPlan {
        const sourceKind = source.kind as ProjectType;
        const target = this.targetIdentity(targetKind, options.destinationPath, options.generationSemantics);
        const preflight = this.preflight(targetKind, sourceKind, options.generationSemantics);
        const unavailable = (code: ArtifactConversionDiagnostic["code"], message: string, recovery: string): ArtifactConversionPlan => ({
            status: "unavailable",
            source,
            target,
            steps: [],
            preflight,
            diagnostic: {code, failedEdge: {from: sourceKind, to: targetKind}, message, recovery},
        });

        const requiredCapability = EDGE_CAPABILITIES[sourceKind]?.[targetKind];
        if (requiredCapability !== undefined && !source.capabilities.includes(requiredCapability)) {
            return unavailable(
                "missing-capability",
                `This ${sourceKind} was recognized without the required "${requiredCapability}" capability for ${targetKind}.`,
                "Resolve the original artifact again, or use a source whose verified capabilities include the required conversion edge.",
            );
        }

        if (sourceKind === "wasm") {
            return unavailable("missing-capability", "WASM components are metadata-only and cannot be converted into a POKIE artifact.", "Inspect the component manifest or use the original recognized source.");
        }
        if (sourceKind === "parWorkbook" && targetKind !== "parWorkbook") {
            return unavailable("unsupported-boundary", "A PAR workbook is an exchange snapshot, not a native bundle or game model.", "Import the workbook into its supported authoring workflow before building another artifact.");
        }
        if (sourceKind === "stakeAdapter" && targetKind !== "stakeAdapter") {
            return unavailable("unsupported-boundary", "A Stake Engine export is read-only until imported and cannot supply runtime or game-model data.", "Import it into a supported source workflow before requesting this target.");
        }
        if (sourceKind === "outcomeLibrary" && (targetKind === "tsPackage" || targetKind === "parWorkbook")) {
            return unavailable("missing-data", "An Outcome Library does not preserve the game model required for this target.", "Use the original Game Blueprint or POKIE package.");
        }
        if (sourceKind === "tsPackage" && (targetKind === "tsPackage" || targetKind === "parWorkbook")) {
            return unavailable("missing-data", "A POKIE package is not a Game Blueprint and cannot be converted into this target.", "Use the original Game Blueprint.");
        }
        if (sourceKind === "blueprint" && targetKind === "stakeAdapter") {
            return this.planStakeFromRuntime(source, target, preflight, options, unavailable);
        }
        if (sourceKind === "tsPackage" && targetKind === "stakeAdapter") {
            return this.planStakeFromRuntime(source, target, preflight, options, unavailable);
        }
        if ((sourceKind === "blueprint" || sourceKind === "tsPackage") && targetKind === "outcomeLibrary") {
            return this.planOutcomeFromRuntime(source, target, preflight, options, unavailable);
        }
        if ((sourceKind === "blueprint" && (targetKind === "tsPackage" || targetKind === "parWorkbook")) ||
            (sourceKind === "outcomeLibrary" && (targetKind === "outcomeLibrary" || targetKind === "stakeAdapter")) ||
            (sourceKind === "stakeAdapter" && targetKind === "stakeAdapter") ||
            (sourceKind === "parWorkbook" && targetKind === "parWorkbook")) {
            return this.planned(source, target, preflight, [{kind: "publish", input: source, output: target, choice: "publish", estimatedWork: "publish", ...(preflight.losses.length === 0 ? {} : {losses: preflight.losses})}]);
        }
        return unavailable("missing-data", `No conversion edge from ${sourceKind} to ${targetKind} preserves the data this target requires.`, "Use a recognized source that retains the required game-model, runtime, or exchange data.");
    }

    private planOutcomeFromRuntime(
        source: ArtifactIdentity,
        target: ArtifactIdentity,
        preflight: ArtifactConversionPreflight,
        options: ArtifactConversionPlanningOptions,
        unavailable: (code: ArtifactConversionDiagnostic["code"], message: string, recovery: string) => ArtifactConversionPlan,
    ): ArtifactConversionPlan {
        if (options.managedOutcome !== undefined && !options.managedOutcome.verified) {
            return unavailable("stale-provenance", `The managed Outcome Library cannot be reused: ${options.managedOutcome.staleReason ?? "its provenance was not verified"}.`, "Regenerate the Outcome Library from the recognized source.");
        }
        if (options.managedOutcome?.verified) {
            return this.planned(source, target, preflight, [{kind: "reuseManagedOutcomeLibrary", input: source, output: options.managedOutcome.identity, choice: "reuse", estimatedWork: "none"}]);
        }
        const runtime: ArtifactIdentity = {kind: "tsPackage", capabilities: TARGET_CAPABILITIES.tsPackage};
        return this.planned(source, target, preflight, [
            {kind: "materializeRuntime", input: source, output: runtime, choice: "materialize", estimatedWork: "materialize"},
            {kind: "generateOutcomeLibrary", input: runtime, output: target, choice: "materialize", estimatedWork: "generate"},
        ]);
    }

    private planStakeFromRuntime(
        source: ArtifactIdentity,
        target: ArtifactIdentity,
        preflight: ArtifactConversionPreflight,
        options: ArtifactConversionPlanningOptions,
        unavailable: (code: ArtifactConversionDiagnostic["code"], message: string, recovery: string) => ArtifactConversionPlan,
    ): ArtifactConversionPlan {
        const outcome = this.targetIdentity("outcomeLibrary", undefined, options.generationSemantics);
        const outcomePlan = this.planOutcomeFromRuntime(source, outcome, this.preflight("outcomeLibrary", source.kind as ProjectType, options.generationSemantics), options, unavailable);
        if (outcomePlan.status !== "planned") return outcomePlan;
        const prerequisiteOutput = outcomePlan.steps[outcomePlan.steps.length - 1]?.output ?? outcome;
        return this.planned(source, target, preflight, [...outcomePlan.steps, {kind: "publish", input: prerequisiteOutput, output: target, choice: "publish", estimatedWork: "publish"}]);
    }

    private planned(source: ArtifactIdentity, target: ArtifactIdentity, preflight: ArtifactConversionPreflight, steps: readonly ArtifactConversionStep[]): ArtifactConversionPlan {
        return {status: "planned", source, target, steps, preflight};
    }

    private targetIdentity(kind: ArtifactTargetType, destinationPath?: string, generationSemantics?: "exact" | "boundedSample"): ArtifactIdentity {
        return {kind, ...(destinationPath === undefined ? {} : {canonicalLocation: path.resolve(destinationPath)}), capabilities: TARGET_CAPABILITIES[kind], ...(generationSemantics === undefined ? {} : {configurationProvenance: {generationSemantics}})};
    }

    private preflight(target: ArtifactTargetType, source: ProjectType, _generationSemantics?: "exact" | "boundedSample"): ArtifactConversionPreflight {
        const generation = target === "outcomeLibrary" || (target === "stakeAdapter" && (source === "blueprint" || source === "tsPackage"));
        let losses: readonly string[] = [];
        if (target === "parWorkbook") {
            losses = ["PAR is a one-way exchange snapshot."];
        } else if (target === "stakeAdapter") {
            losses = ["Stake export does not retain a game model or runtime."];
        }
        return {
            destinationKind: DESTINATION_KIND[target],
            estimatedWork: generation ? "generate" : "publish",
            losses,
            oneWay: target === "parWorkbook" || target === "stakeAdapter",
        };
    }
}
