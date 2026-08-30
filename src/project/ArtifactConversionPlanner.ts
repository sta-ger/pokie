import path from "path";
import crypto from "crypto";
import fs from "fs";
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
import {describeWasmConversionBoundary, describeWasmRuntimeBoundary} from "./WasmProductContract.js";

/** A stable description of the input or output of a conversion. */
export type ArtifactIdentity = {
    readonly kind: ProjectType | ArtifactTargetType;
    readonly canonicalLocation?: string;
    readonly recognitionProvenance?: string;
    readonly capabilities: readonly ProjectCapability[];
    readonly configurationProvenance?: ArtifactConfigurationProvenance;
};

/** The requested output of a conversion always belongs to the build-target vocabulary. */
export type ArtifactTargetIdentity = ArtifactIdentity & {
    readonly kind: ArtifactTargetType;
};

/**
 * A durable file emitted beside a conversion without claiming to be a native
 * POKIE artifact bundle.  Raw generated Outcome JSON deliberately uses this
 * identity: it is useful output for a caller, but it has neither an Outcome
 * Library manifest nor the recognition/provenance contract of one.
 */
export type ArtifactFilePublicationIdentity = Omit<ArtifactIdentity, "kind"> & {
    readonly kind: "rawOutcomeLibraryJson";
};

/** Configuration facts that make generated artifacts safe to reuse. */
export type ArtifactConfigurationProvenance = {
    readonly configurationHash?: string;
    readonly pokieVersion?: string;
    readonly generationSemantics?: "exact" | "boundedSample";
    readonly gameId?: string;
    readonly gameVersion?: string;
    readonly manifestIdentity?: string;
    // Bounded generation is only reproducible when both values agree.  Keeping these
    // separate from the display-oriented generationSemantics string makes a sampled
    // bundle ineligible for an exact (or differently seeded) request.
    readonly sampleCount?: string;
    readonly sampleSeed?: string;
    /** Resolved exact cap of a managed compatibility policy. */
    readonly maxExactOutcomeSpaceSize?: string;
    readonly compatibilityPolicyVersion?: string;
};

/**
 * The content binding used by descriptor-backed adapters.  A descriptor is
 * not a native project merely because an older command can read it; however,
 * once an adapter has accepted that descriptor as a format input, its exact
 * bytes are part of the prepared operation's source identity.  Keeping this
 * small primitive in the domain layer prevents each adapter from inventing a
 * static "native" identity that cannot observe a changed descriptor.
 */
export function computeArtifactConfigurationHash(contents: string | Buffer): string {
    return `sha256:${crypto.createHash("sha256").update(contents).digest("hex")}`;
}

/**
 * Hashes a descriptor together with every file or directory it names.  A
 * descriptor is only a trustworthy prepared source while its referenced
 * libraries, streams, and bundle inputs remain unchanged too.  Missing and
 * symlinked inputs are represented explicitly so replacing either state is
 * detected by the operation's final source rebind.
 */
export function computeArtifactInputBindingHash(inputPaths: readonly string[]): string {
    const hash = crypto.createHash("sha256");
    const seen = new Set<string>();
    const visit = (inputPath: string): void => {
        const resolved = path.resolve(inputPath);
        if (seen.has(resolved)) return;
        seen.add(resolved);
        hash.update(`path:${resolved}\0`);
        try {
            const stat = fs.lstatSync(resolved);
            if (stat.isSymbolicLink()) {
                hash.update(`symlink:${fs.readlinkSync(resolved)}\0`);
                visit(fs.realpathSync(resolved));
            } else if (stat.isDirectory()) {
                hash.update("directory\0");
                for (const entry of fs.readdirSync(resolved).sort()) visit(path.join(resolved, entry));
            } else if (stat.isFile()) {
                hash.update("file\0");
                hash.update(fs.readFileSync(resolved));
            } else {
                hash.update("unsupported-input\0");
            }
        } catch (error) {
            const reason = error instanceof Error ? ((error as NodeJS.ErrnoException).code ?? error.message) : String(error);
            hash.update(`unreadable:${reason}\0`);
        }
    };
    for (const inputPath of inputPaths) visit(inputPath);
    return `sha256:${hash.digest("hex")}`;
}

export type ArtifactConversionStepKind =
    | "importParWorkbook"
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

export type ArtifactFilePublicationStep = Omit<ArtifactConversionStep, "input" | "output"> & {
    readonly input: ArtifactIdentity;
    readonly output: ArtifactFilePublicationIdentity;
};

export type ArtifactConversionDiagnostic = {
    readonly code: "missing-capability" | "missing-data" | "unsupported-boundary" | "stale-provenance" | "destination-conflict" | "unrecognized-source";
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
    readonly target: ArtifactTargetIdentity;
    readonly steps: readonly ArtifactConversionStep[];
    readonly preflight: ArtifactConversionPreflight;
    /**
     * The managed candidate was considered while preparing this plan.  An
     * ineligible candidate is deliberately informational: it records why a
     * preview will regenerate, rather than turning an otherwise executable
     * conversion into a dead end.
     */
    readonly managedOutcome?: {readonly disposition: "reused" | "ineligible"; readonly reason?: string};
    readonly diagnostic?: ArtifactConversionDiagnostic;
};

/** A destinationless plan for an operation which needs a loadable game now. */
export type RunnableRuntimePlan = {
    readonly status: "planned" | "unavailable";
    readonly source: ArtifactIdentity;
    readonly target: ArtifactTargetIdentity;
    readonly steps: readonly ArtifactConversionStep[];
    readonly diagnostic?: ArtifactConversionDiagnostic;
};

/**
 * A prepared publication for a non-bundle file.  Keeping it separate from
 * ArtifactConversionPlan prevents raw JSON from accidentally acquiring a
 * canonical Outcome Library conversion edge just because both contain
 * weighted outcomes.
 */
export type ArtifactFilePublicationPlan = {
    readonly status: "planned";
    readonly source: ArtifactIdentity;
    readonly target: ArtifactFilePublicationIdentity;
    readonly steps: readonly ArtifactFilePublicationStep[];
    readonly preflight: ArtifactConversionPreflight;
    readonly diagnostic?: undefined;
};

/**
 * The executable half of an ArtifactConversionPlan.  Format adapters may
 * provide readers and atomic writers, but they never decide whether a plan is
 * still current or which terminal lifecycle phase runs next.  This is also
 * used by the older descriptor-oriented commands: those descriptors are
 * inputs to a prepared operation, not an escape hatch around it.
 */
export type ArtifactConversionExecution<ReadResult, PublishedResult> = {
    readonly currentSource: () => Promise<ArtifactIdentity> | ArtifactIdentity;
    /**
     * Rebind the physical output chosen while preparing this operation.  A
     * writer must not quietly switch from the planned destination to a later
     * caller-provided alias between its read and publication phases.
     */
    readonly currentDestination?: () => Promise<string | undefined> | string | undefined;
    readonly read: () => Promise<ReadResult> | ReadResult;
    readonly canPublish: (read: ReadResult) => boolean;
    readonly assertDestinationAvailable?: () => Promise<void> | void;
    readonly publish: (read: ReadResult) => Promise<PublishedResult> | PublishedResult;
    readonly register?: (published: PublishedResult) => Promise<void> | void;
    readonly rollback?: (published: PublishedResult) => Promise<void> | void;
    readonly cleanup?: (context: {readonly read?: ReadResult; readonly publication?: PublishedResult; readonly error?: unknown}) => Promise<void> | void;
    readonly signal?: AbortSignal;
    readonly onTerminalFailure?: (error: unknown) => Promise<void> | void;
};

export type ArtifactConversionExecutionResult<ReadResult, PublishedResult> = {
    readonly read: ReadResult;
    readonly published: boolean;
    readonly publication?: PublishedResult;
};

/**
 * Import is deliberately modelled separately from the build graph.  A PAR
 * workbook and a Stake export are exchange inputs: reading either one creates
 * a new durable POKIE artifact, but does not make a reverse/lossless build
 * edge available to the source artifact.
 */
export type ArtifactImportOutputKind = "blueprint" | "outcomeLibrary";

export type ArtifactImportOutputPlan = {
    readonly status: "planned" | "unavailable";
    readonly operation: "importParWorkbook" | "importStakeAdapter";
    readonly source: ArtifactIdentity;
    readonly output: ArtifactIdentity & {readonly kind: ArtifactImportOutputKind};
    readonly preflight: {
        readonly destinationKind: "file" | "directory";
        readonly oneWay: true;
        readonly losses: readonly string[];
    };
    readonly diagnostic?: {
        readonly code: "unsupported-boundary" | "missing-capability";
        readonly message: string;
        readonly recovery: string;
    };
};

/**
 * The format reader and atomic writer are intentionally supplied by the
 * import boundary, while the prepared operation owns their ordering.  This
 * keeps an exchange import one-way without making PAR or Stake command code
 * responsible for deciding when a durable output is safe to publish.
 */
export type ArtifactImportOutputExecution<ReadResult, PublishedResult> = {
    readonly read: () => Promise<ReadResult> | ReadResult;
    readonly canPublish: (result: ReadResult) => boolean;
    /** The format-specific physical destination probe, sequenced by the prepared operation. */
    readonly assertDestinationAvailable?: () => Promise<void> | void;
    /** @deprecated Use assertDestinationAvailable for new adapters. */
    readonly beforePublish?: () => Promise<void> | void;
    readonly publish: (result: ReadResult) => Promise<PublishedResult> | PublishedResult;
    /** Registration is part of successful publication, never a command-side afterthought. */
    readonly register?: (published: PublishedResult) => Promise<void> | void;
    /** Undo only publication allocated by this operation after a terminal failure. */
    readonly rollback?: (published: PublishedResult) => Promise<void> | void;
    /** Cancellation is checked before reading, publishing, and registration. */
    readonly signal?: AbortSignal;
    /**
     * Releases reader-owned temporary state on every terminal path.  This is
     * deliberately separate from rollback: rollback removes a publication
     * which this operation created, while cleanup must never remove a borrowed
     * source or a previously existing destination.
     */
    readonly cleanup?: (context: {readonly read?: ReadResult; readonly publication?: PublishedResult; readonly error?: unknown}) => Promise<void> | void;
    /**
     * Presentation/recovery is notified by the prepared operation after it
     * has rolled back its own publication.  Adapters can therefore report one
     * terminal diagnostic without taking lifecycle ownership back themselves.
     */
    readonly onTerminalFailure?: (error: unknown) => Promise<void> | void;
};

export type ArtifactImportOutputExecutionResult<ReadResult, PublishedResult> = {
    readonly read: ReadResult;
    readonly published: boolean;
    readonly publication?: PublishedResult;
};

function assertImportOperationNotCancelled(signal: AbortSignal | undefined): void {
    if (signal?.aborted) throw new Error("The prepared import was cancelled before durable publication.");
}

function sameArtifactIdentity(left: ArtifactIdentity, right: ArtifactIdentity): boolean {
    return left.kind === right.kind &&
        left.canonicalLocation === right.canonicalLocation &&
        left.recognitionProvenance === right.recognitionProvenance &&
        left.capabilities.join("\u0000") === right.capabilities.join("\u0000") &&
        left.configurationProvenance?.configurationHash === right.configurationProvenance?.configurationHash &&
        left.configurationProvenance?.generationSemantics === right.configurationProvenance?.generationSemantics &&
        left.configurationProvenance?.sampleCount === right.configurationProvenance?.sampleCount &&
        left.configurationProvenance?.sampleSeed === right.configurationProvenance?.sampleSeed &&
        left.configurationProvenance?.maxExactOutcomeSpaceSize === right.configurationProvenance?.maxExactOutcomeSpaceSize &&
        left.configurationProvenance?.compatibilityPolicyVersion === right.configurationProvenance?.compatibilityPolicyVersion &&
        left.configurationProvenance?.pokieVersion === right.configurationProvenance?.pokieVersion &&
        left.configurationProvenance?.gameId === right.configurationProvenance?.gameId &&
        left.configurationProvenance?.gameVersion === right.configurationProvenance?.gameVersion &&
        left.configurationProvenance?.manifestIdentity === right.configurationProvenance?.manifestIdentity;
}

// Presentation-only compatibility wording for callers that historically showed the product matrix.  It is
// derived from a planner result (rather than used to choose an edge), so execution and preflight always retain
// the richer failed-edge diagnostic even while long-lived CLI/Studio text remains recognizable.
export function describeArtifactConversionPlanDiagnostic(plan: ArtifactConversionPlan): string | undefined {
    const diagnostic = plan.diagnostic;
    if (diagnostic === undefined) return undefined;
    // A selector which did not resolve to a POKIE artifact has no trustworthy
    // source-type compatibility story to translate.  Returning the generic
    // matrix wording here used to describe a raw JSON selector as an Outcome
    // Library and obscured the actual recovery boundary supplied by the
    // planner.  Preserve that structured boundary verbatim for every adapter.
    if (diagnostic.code === "unrecognized-source") return diagnostic.message;
    const sourceNames: Readonly<Record<ProjectType, string>> = {
        blueprint: "Game Blueprint", tsPackage: "POKIE game package", outcomeLibrary: "Outcome Library",
        stakeAdapter: "Stake Engine export", parWorkbook: "PAR workbook", wasm: "POKIE WASM component",
    };
    const targetNames: Readonly<Record<ArtifactTargetType, string>> = {
        blueprint: "Game Blueprint", tsPackage: "POKIE game package", outcomeLibrary: "Outcome Library", stakeAdapter: "Stake Engine export", parWorkbook: "PAR workbook",
    };
    const prerequisites: Readonly<Record<ArtifactTargetType, {missing: string; next: string}>> = {
        blueprint: {missing: "a PAR workbook source", next: "Open a PAR workbook, then run `pokie build <path> --target blueprint`."},
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
    readonly sampleCount?: bigint | string;
    readonly sampleSeed?: string;
    readonly maxExactOutcomeSpaceSize?: bigint | string;
    readonly compatibilityPolicyVersion?: string;
    readonly pokieVersion?: string;
    /** A registry lookup may offer a managed outcome bundle. It is reusable only when independently verified. */
    readonly managedOutcome?: {readonly identity: ArtifactIdentity; readonly verified: boolean; readonly staleReason?: string};
};

/**
 * Checks the persisted bundle facts against the source facts the selected edge
 * consumes.  `verified` is deliberately not trusted as an adapter assertion:
 * callers may use it to report an I/O failure, but matching provenance is the
 * condition that makes reuse executable.
 */
export function verifyManagedOutcomeCandidate(
    source: ArtifactIdentity,
    candidate: NonNullable<ArtifactConversionPlanningOptions["managedOutcome"]>,
    options: ArtifactConversionPlanningOptions = {},
): {readonly verified: boolean; readonly staleReason?: string} {
    if (!candidate.verified) return {verified: false, staleReason: candidate.staleReason ?? "its manifest could not be verified"};
    const expected = source.configurationProvenance;
    const actual = candidate.identity.configurationProvenance;
    // Legacy/in-memory projects have no persisted provenance.  They remain
    // usable only for the old explicit verified contract; a resolved source
    // with provenance always fails closed when the candidate lacks it.
    if (expected === undefined) return {verified: true};
    if (actual === undefined) return {verified: false, staleReason: "the managed bundle has no persisted provenance"};
    const expectedGeneration = options.generationSemantics ?? expected.generationSemantics;
    const expectedSampleCount = options.sampleCount === undefined ? expected.sampleCount : String(options.sampleCount);
    const expectedSampleSeed = options.sampleSeed ?? expected.sampleSeed;
    const expectedCompatibilityPolicyVersion = options.compatibilityPolicyVersion ?? expected.compatibilityPolicyVersion;
    const expectedMaxExactOutcomeSpaceSize = options.maxExactOutcomeSpaceSize === undefined ? expected.maxExactOutcomeSpaceSize : String(options.maxExactOutcomeSpaceSize);
    const comparisons: readonly [string, string | undefined, string | undefined][] = [
        ["configuration hash", expected.configurationHash, actual.configurationHash],
        ["game id", expected.gameId, actual.gameId],
        ["game version", expected.gameVersion, actual.gameVersion],
        ["manifest identity", expected.manifestIdentity, actual.manifestIdentity],
        ["POKIE version", options.pokieVersion ?? expected.pokieVersion, actual.pokieVersion],
        ["generation semantics", expectedGeneration, actual.generationSemantics],
        ["sample count", expectedSampleCount, actual.sampleCount],
        ["sample seed", expectedSampleSeed, actual.sampleSeed],
        ["maximum exact outcome space size", expectedMaxExactOutcomeSpaceSize, actual.maxExactOutcomeSpaceSize],
        ["compatibility policy version", expectedCompatibilityPolicyVersion, actual.compatibilityPolicyVersion],
    ];
    const mismatch = comparisons.find(([, wanted, found]) => wanted !== undefined && wanted !== found);
    return mismatch === undefined
        ? {verified: true}
        : {verified: false, staleReason: `${mismatch[0]} does not match the recognized source`};
}

const TARGET_CAPABILITIES: Readonly<Record<ArtifactTargetType, readonly ProjectCapability[]>> = {
    blueprint: PROJECT_TYPE_CAPABILITIES.blueprint,
    tsPackage: PROJECT_TYPE_CAPABILITIES.tsPackage,
    outcomeLibrary: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
    stakeAdapter: PROJECT_TYPE_CAPABILITIES.stakeAdapter,
    parWorkbook: PROJECT_TYPE_CAPABILITIES.parWorkbook,
};

const DESTINATION_KIND: Readonly<Record<ArtifactTargetType, "file" | "directory">> = {
    blueprint: "file",
    tsPackage: "directory",
    outcomeLibrary: "directory",
    stakeAdapter: "directory",
    parWorkbook: "file",
};

const TARGETS: readonly ArtifactTargetType[] = ["blueprint", "tsPackage", "outcomeLibrary", "stakeAdapter", "parWorkbook"];

// A target capability alone is insufficient: a Blueprint can publish a PAR workbook because it retains
// the game model, while an already-published workbook can only republish itself.  These are the actual
// executable edges, and are deliberately checked against the capabilities stamped on the resolved source.
const EDGE_CAPABILITIES: Readonly<Partial<Record<ProjectType, Readonly<Partial<Record<ArtifactTargetType, ProjectCapability>>>>>> = {
    blueprint: {tsPackage: BLUEPRINT_BUILD_CAPABILITY, outcomeLibrary: OUTCOME_LIBRARY_GENERATE_CAPABILITY, stakeAdapter: STAKE_ADAPTER_EXPORT_CAPABILITY, parWorkbook: BLUEPRINT_BUILD_CAPABILITY},
    tsPackage: {outcomeLibrary: OUTCOME_LIBRARY_GENERATE_CAPABILITY, stakeAdapter: STAKE_ADAPTER_EXPORT_CAPABILITY},
    outcomeLibrary: {outcomeLibrary: OUTCOME_LIBRARY_READ_CAPABILITY, stakeAdapter: STAKE_ADAPTER_EXPORT_CAPABILITY},
    stakeAdapter: {stakeAdapter: STAKE_ADAPTER_EXPORT_CAPABILITY},
    parWorkbook: {blueprint: PAR_WORKBOOK_EXCHANGE_CAPABILITY, parWorkbook: PAR_WORKBOOK_EXCHANGE_CAPABILITY},
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

    /**
     * Plans a runtime lease, not a durable tsPackage publication.  A Blueprint
     * is materialized into a verified cache; PAR first imports into an
     * operation-owned temporary Blueprint.  The returned target intentionally
     * has no location, so callers cannot mistake this request for `build`.
     */
    public planRuntime(source: PokieProject): RunnableRuntimePlan {
        return this.planRuntimeIdentity(resolveArtifactIdentity(source));
    }

    public planRuntimeIdentity(source: ArtifactIdentity): RunnableRuntimePlan {
        const sourceKind = source.kind as ProjectType;
        const target: ArtifactTargetIdentity = {
            kind: "tsPackage",
            capabilities: TARGET_CAPABILITIES.tsPackage,
            recognitionProvenance: "ephemeral runnable runtime",
        };
        const unavailable = (code: ArtifactConversionDiagnostic["code"], message: string, recovery: string): RunnableRuntimePlan => ({
            status: "unavailable", source, target, steps: [],
            diagnostic: {code, failedEdge: {from: sourceKind, to: "tsPackage"}, message, recovery},
        });
        if (sourceKind === "tsPackage") {
            return {status: "planned", source, target, steps: [{kind: "materializeRuntime", input: source, output: target, choice: "reuse", estimatedWork: "none"}]};
        }
        if (sourceKind === "blueprint") {
            if (!source.capabilities.includes(BLUEPRINT_BUILD_CAPABILITY)) {
                return unavailable("missing-capability", "This Blueprint cannot be materialized because its build capability is unavailable.", "Resolve the Blueprint again and retry.");
            }
            return {status: "planned", source, target, steps: [{kind: "materializeRuntime", input: source, output: target, choice: "materialize", estimatedWork: "materialize"}]};
        }
        if (sourceKind === "parWorkbook") {
            if (!source.capabilities.includes(PAR_WORKBOOK_EXCHANGE_CAPABILITY)) {
                return unavailable("missing-capability", "This PAR workbook cannot be imported into a runnable game model.", "Resolve a compatible PAR workbook and retry.");
            }
            const blueprint: ArtifactIdentity = {
                kind: "blueprint", capabilities: TARGET_CAPABILITIES.blueprint,
                recognitionProvenance: "operation-owned PAR runtime import",
                configurationProvenance: source.configurationProvenance,
            };
            return {
                status: "planned", source, target,
                steps: [
                    {kind: "importParWorkbook", input: source, output: blueprint, choice: "materialize", estimatedWork: "read", losses: ["PAR import is a one-way game-model reconstruction; conversion evidence is kept only for this runtime operation."]},
                    {kind: "materializeRuntime", input: blueprint, output: target, choice: "materialize", estimatedWork: "materialize"},
                ],
            };
        }
        let detail = `A ${sourceKind} artifact cannot yield a runnable POKIE game.`;
        if (sourceKind === "outcomeLibrary") {
            detail = "An Outcome Library has native sampling and exact replay paths, but does not retain executable game logic.";
        } else if (sourceKind === "stakeAdapter") {
            detail = "A Stake Engine export is an exchange artifact and does not retain an executable game runtime.";
        } else if (sourceKind === "wasm") {
            detail = describeWasmRuntimeBoundary();
        }
        return unavailable("unsupported-boundary", detail, "Use the original Blueprint or POKIE package, or choose the artifact's native supported operation.");
    }

    /**
     * Runs an immutable prepared conversion.  The source is rebound before
     * reading and again before durable publication, cancellation rolls back
     * only a publication allocated by this operation, and cleanup always runs.
     * It deliberately mirrors the import operation so public adapters have one
     * lifecycle contract regardless of whether their source is a project or an
     * exchange descriptor.
     */
    public async executeConversionPlan<ReadResult, PublishedResult>(
        plan: ArtifactConversionPlan | ArtifactFilePublicationPlan,
        execution: ArtifactConversionExecution<ReadResult, PublishedResult>,
    ): Promise<ArtifactConversionExecutionResult<ReadResult, PublishedResult>> {
        if (plan.status !== "planned") {
            throw new Error(`${plan.diagnostic?.message ?? "This conversion cannot be planned."} Next: ${plan.diagnostic?.recovery ?? "resolve a supported source and retry."}`);
        }
        let read: ReadResult | undefined;
        let publication: PublishedResult | undefined;
        let cleanedUp = false;
        const assertCurrent = async (): Promise<void> => {
            const current = await execution.currentSource();
            if (!sameArtifactIdentity(plan.source, current)) {
                throw new Error("The conversion source changed after this operation was prepared; prepare a new conversion before executing it.");
            }
            const currentDestination = await execution.currentDestination?.();
            if (currentDestination !== undefined && path.resolve(currentDestination) !== plan.target.canonicalLocation) {
                throw new Error("The conversion destination changed after this operation was prepared; prepare a new conversion before executing it.");
            }
        };
        try {
            await assertCurrent();
            assertImportOperationNotCancelled(execution.signal);
            read = await execution.read();
            assertImportOperationNotCancelled(execution.signal);
            if (!execution.canPublish(read)) return {read, published: false};
            await assertCurrent();
            await execution.assertDestinationAvailable?.();
            assertImportOperationNotCancelled(execution.signal);
            publication = await execution.publish(read);
            assertImportOperationNotCancelled(execution.signal);
            await execution.register?.(publication);
            assertImportOperationNotCancelled(execution.signal);
            return {read, published: true, publication};
        } catch (error) {
            try {
                if (publication !== undefined) await execution.rollback?.(publication);
            } finally {
                await execution.cleanup?.({...(read === undefined ? {} : {read}), ...(publication === undefined ? {} : {publication}), error});
                cleanedUp = true;
                await execution.onTerminalFailure?.(error);
            }
            throw error;
        } finally {
            if (!cleanedUp) await execution.cleanup?.({...(read === undefined ? {} : {read}), ...(publication === undefined ? {} : {publication})});
        }
    }

    /**
     * Prepares the durable output of an exchange import.  This is not exposed
     * through listTargets()/plan() because it must not imply a conversion from
     * Blueprint or Outcome Library back to its exchange source.
     */
    public planImportOutput(source: PokieProject, outputKind: ArtifactImportOutputKind, destinationPath: string): ArtifactImportOutputPlan {
        return this.planImportOutputIdentity(resolveArtifactIdentity(source), outputKind, destinationPath);
    }

    public planImportOutputIdentity(source: ArtifactIdentity, outputKind: ArtifactImportOutputKind, destinationPath: string): ArtifactImportOutputPlan {
        const destinationKind = outputKind === "blueprint" ? "file" : "directory";
        const expectedSource = outputKind === "blueprint" ? "parWorkbook" : "stakeAdapter";
        const requiredCapability = outputKind === "blueprint" ? PAR_WORKBOOK_EXCHANGE_CAPABILITY : STAKE_ADAPTER_EXPORT_CAPABILITY;
        const losses = outputKind === "blueprint"
            ? ["PAR is an exchange snapshot. Import creates a Blueprint and does not establish a reverse or lossless conversion edge."]
            : ["Stake Engine import reconstructs a POKIE Outcome Library from its manifest and does not recover a game model or a lossless reverse edge."];
        const output: ArtifactIdentity & {readonly kind: ArtifactImportOutputKind} = {
            kind: outputKind,
            canonicalLocation: path.resolve(destinationPath),
            capabilities: PROJECT_TYPE_CAPABILITIES[outputKind],
        };
        const unavailable = (code: "unsupported-boundary" | "missing-capability", message: string, recovery: string): ArtifactImportOutputPlan => ({
            status: "unavailable",
            operation: outputKind === "blueprint" ? "importParWorkbook" : "importStakeAdapter",
            source,
            output,
            preflight: {destinationKind, oneWay: true, losses},
            diagnostic: {code, message, recovery},
        });
        if (source.kind !== expectedSource) {
            return unavailable(
                "unsupported-boundary",
                `A ${outputKind} import requires a recognized ${expectedSource} exchange source, not ${source.kind}.`,
                outputKind === "blueprint" ? "Choose a PAR workbook produced for POKIE import." : "Choose a POKIE-produced Stake Engine export with pokie-manifest.json.",
            );
        }
        if (!source.capabilities.includes(requiredCapability)) {
            return unavailable(
                "missing-capability",
                `This ${source.kind} was recognized without the required "${requiredCapability}" import capability.`,
                "Resolve the original artifact again and retry the import.",
            );
        }
        return {
            status: "planned",
            operation: outputKind === "blueprint" ? "importParWorkbook" : "importStakeAdapter",
            source,
            output,
            preflight: {destinationKind, oneWay: true, losses},
        };
    }

    /**
     * The shared execution boundary for import adapters.  Readers and writers
     * remain format-specific, but they may run only after this exact prepared
     * operation still names the same source and durable destination.
     */
    public assertImportOutputPlanCurrent(plan: ArtifactImportOutputPlan, source: PokieProject, destinationPath: string): void {
        if (plan.status !== "planned") {
            throw new Error(`${plan.diagnostic?.message ?? "This import cannot be planned."} Next: ${plan.diagnostic?.recovery ?? "resolve a supported exchange source and retry."}`);
        }
        const current = resolveArtifactIdentity(source);
        if (current.kind !== plan.source.kind || current.canonicalLocation !== plan.source.canonicalLocation ||
            current.recognitionProvenance !== plan.source.recognitionProvenance ||
            current.capabilities.join("\u0000") !== plan.source.capabilities.join("\u0000")) {
            throw new Error("The import source changed after this operation was prepared; prepare a new import before executing it.");
        }
        if (path.resolve(destinationPath) !== plan.output.canonicalLocation) {
            throw new Error("The import destination changed after this operation was prepared; prepare a new import before executing it.");
        }
    }

    /**
     * Executes one already-prepared exchange import.  Readers may report
     * validation errors without creating an output; once their result is
     * publishable, this operation rebinds provenance and destination before
     * handing control to the format's atomic publisher.  In particular an
     * adapter cannot accidentally write after source/destination drift merely
     * because it performed its read before the final write.
     */
    public async executeImportOutputPlan<ReadResult, PublishedResult>(
        plan: ArtifactImportOutputPlan,
        source: PokieProject,
        destinationPath: string,
        execution: ArtifactImportOutputExecution<ReadResult, PublishedResult>,
    ): Promise<ArtifactImportOutputExecutionResult<ReadResult, PublishedResult>> {
        let read: ReadResult | undefined;
        let publication: PublishedResult | undefined;
        let cleanedUp = false;
        try {
            this.assertImportOutputPlanCurrent(plan, source, destinationPath);
            assertImportOperationNotCancelled(execution.signal);
            read = await execution.read();
            assertImportOperationNotCancelled(execution.signal);
            if (!execution.canPublish(read)) return {read, published: false};
            // The destination policy belongs at the durable-publication boundary,
            // after format diagnostics but before any writer allocates output.
            this.assertImportOutputPlanCurrent(plan, source, destinationPath);
            await execution.assertDestinationAvailable?.();
            // Compatibility for the initial planner boundary.  The planner still
            // owns ordering and current-plan verification around this hook.
            await execution.beforePublish?.();
            this.assertImportOutputPlanCurrent(plan, source, destinationPath);
            assertImportOperationNotCancelled(execution.signal);
            publication = await execution.publish(read);
            assertImportOperationNotCancelled(execution.signal);
            await execution.register?.(publication);
            // Registration can itself be asynchronous.  Treat a cancellation
            // observed while it was running exactly like a failed
            // registration: the prepared operation, rather than its adapter,
            // releases the publication it just acquired.
            assertImportOperationNotCancelled(execution.signal);
            return {read, published: true, publication};
        } catch (error) {
            try {
                if (publication !== undefined) await execution.rollback?.(publication);
            } finally {
                await execution.cleanup?.({...(read === undefined ? {} : {read}), ...(publication === undefined ? {} : {publication}), error});
                cleanedUp = true;
                await execution.onTerminalFailure?.(error);
            }
            throw error;
        } finally {
            // Validation failures have no publication to roll back, but a
            // streaming reader may still own a temporary runtime/materialized
            // input.  Successful publication deliberately keeps its durable
            // output while still releasing only that reader-owned state.
            if (!cleanedUp) {
                await execution.cleanup?.({...(read === undefined ? {} : {read}), ...(publication === undefined ? {} : {publication})});
            }
        }
    }

    public planIdentity(source: ArtifactIdentity, targetKind: ArtifactTargetType, options: ArtifactConversionPlanningOptions = {}): ArtifactConversionPlan {
        const sourceKind = source.kind as ProjectType;
        const target = this.targetIdentity(targetKind, options.destinationPath, options.generationSemantics, options.sampleCount, options.sampleSeed, options.maxExactOutcomeSpaceSize);
        const preflight = this.preflight(targetKind, sourceKind, options.generationSemantics);
        const unavailable = (code: ArtifactConversionDiagnostic["code"], message: string, recovery: string): ArtifactConversionPlan => ({
            status: "unavailable",
            source,
            target,
            steps: [],
            preflight,
            diagnostic: {code, failedEdge: {from: sourceKind, to: targetKind}, message, recovery},
        });

        // Studio selectors are not artifact recognition.  In particular, a raw
        // JSON library may be readable by a legacy consumer, but it lacks the
        // bundle identity and provenance required to advertise a conversion
        // edge.  Keep that boundary explicit instead of reporting a misleading
        // missing capability on an otherwise-recognized Outcome Library.
        if (
            source.recognitionProvenance === "external Studio selector" ||
            source.recognitionProvenance === "mixed external Studio selectors" ||
            source.recognitionProvenance === "unresolved Studio project runtime"
        ) {
            return unavailable(
                "unrecognized-source",
                "This Studio source is not an independently recognized POKIE artifact and cannot be used for conversion planning.",
                "Open or generate a recognized POKIE Outcome Library bundle, then retry the action.",
            );
        }

        const requiredCapability = EDGE_CAPABILITIES[sourceKind]?.[targetKind];
        if (requiredCapability !== undefined && !source.capabilities.includes(requiredCapability)) {
            return unavailable(
                "missing-capability",
                `This ${sourceKind} was recognized without the required "${requiredCapability}" capability for ${targetKind}.`,
                "Resolve the original artifact again, or use a source whose verified capabilities include the required conversion edge.",
            );
        }

        if (sourceKind === "wasm") {
            return unavailable("unsupported-boundary", describeWasmConversionBoundary(), "Inspect the compatible manifest or use the original Blueprint or POKIE game package.");
        }
        if (sourceKind === "parWorkbook") {
            return this.planParWorkbookSource(source, target, preflight, options);
        }
        if (sourceKind === "stakeAdapter" && targetKind !== "stakeAdapter") {
            return unavailable("unsupported-boundary", "A Stake Engine export is read-only until imported and cannot supply runtime or game-model data.", "Import it into a supported source workflow before requesting this target.");
        }
        if (sourceKind === "outcomeLibrary" && (targetKind === "blueprint" || targetKind === "tsPackage" || targetKind === "parWorkbook")) {
            return unavailable("missing-data", "An Outcome Library does not preserve the game model required for this target.", "Use the original Game Blueprint or POKIE package.");
        }
        if (sourceKind === "tsPackage" && (targetKind === "blueprint" || targetKind === "tsPackage" || targetKind === "parWorkbook")) {
            return unavailable("missing-data", "A POKIE package is not a Game Blueprint and cannot be converted into this target.", "Use the original Game Blueprint.");
        }
        if (sourceKind === "blueprint" && targetKind === "stakeAdapter") {
            return this.planStakeFromRuntime(source, target, preflight, options);
        }
        if (sourceKind === "tsPackage" && targetKind === "stakeAdapter") {
            return this.planStakeFromRuntime(source, target, preflight, options);
        }
        if ((sourceKind === "blueprint" || sourceKind === "tsPackage") && targetKind === "outcomeLibrary") {
            return this.planOutcomeFromRuntime(source, target, preflight, options);
        }
        if ((sourceKind === "blueprint" && (targetKind === "tsPackage" || targetKind === "parWorkbook")) ||
            (sourceKind === "outcomeLibrary" && (targetKind === "outcomeLibrary" || targetKind === "stakeAdapter")) ||
            (sourceKind === "stakeAdapter" && targetKind === "stakeAdapter")) {
            return this.planned(source, target, preflight, [{kind: "publish", input: source, output: target, choice: "publish", estimatedWork: "publish", ...(preflight.losses.length === 0 ? {} : {losses: preflight.losses})}]);
        }
        return unavailable("missing-data", `No conversion edge from ${sourceKind} to ${targetKind} preserves the data this target requires.`, "Use a recognized source that retains the required game-model, runtime, or exchange data.");
    }

    /** PAR is the only exchange source that canonically reconstructs a game model. */
    private planParWorkbookSource(
        source: ArtifactIdentity,
        target: ArtifactTargetIdentity,
        preflight: ArtifactConversionPreflight,
        options: ArtifactConversionPlanningOptions,
    ): ArtifactConversionPlan {
        if (target.kind === "parWorkbook") {
            return this.planned(source, target, preflight, [{kind: "publish", input: source, output: target, choice: "publish", estimatedWork: "publish"}]);
        }
        const importedBlueprint: ArtifactIdentity = {
            kind: "blueprint",
            capabilities: TARGET_CAPABILITIES.blueprint,
            recognitionProvenance: "PAR workbook import intermediate",
            configurationProvenance: source.configurationProvenance,
            // This is not an implementation-private temporary path.  A PAR
            // conversion keeps its imported model and evidence under the
            // terminal artifact, so preview clients can name the exact
            // durable intermediate before publication begins.
            ...(target.canonicalLocation === undefined
                ? {}
                : {canonicalLocation: path.join(target.canonicalLocation, ".pokie", "par-import", "imported.blueprint.json")}),
        };
        const importStep: ArtifactConversionStep = {
            kind: "importParWorkbook", input: source, output: target.kind === "blueprint" ? target : importedBlueprint,
            choice: "materialize", estimatedWork: "read",
            losses: ["PAR import retains source provenance and diagnostics; inferred, defaulted, ignored, or formula-derived values remain inspectable conversion evidence."],
        };
        if (target.kind === "blueprint") return this.planned(source, target, preflight, [importStep]);
        if (target.kind === "tsPackage") {
            return this.planned(source, target, preflight, [importStep, {kind: "publish", input: importedBlueprint, output: target, choice: "publish", estimatedWork: "publish"}]);
        }
        const outcomeTarget = target.kind === "outcomeLibrary"
            ? target
            : this.targetIdentity(
                "outcomeLibrary",
                target.canonicalLocation === undefined
                    ? undefined
                    : path.join(target.canonicalLocation, ".pokie", "par-import", "outcome-library"),
                options.generationSemantics,
                options.sampleCount,
                options.sampleSeed,
            );
        const outcomePlan = this.planOutcomeFromRuntime(importedBlueprint, outcomeTarget, this.preflight("outcomeLibrary", "blueprint", options.generationSemantics), options);
        if (target.kind === "outcomeLibrary") return this.planned(source, target, preflight, [importStep, ...outcomePlan.steps], outcomePlan.managedOutcome);
        const prerequisite = outcomePlan.steps[outcomePlan.steps.length - 1]?.output ?? outcomeTarget;
        return this.planned(source, target, preflight, [importStep, ...outcomePlan.steps, {kind: "publish", input: prerequisite, output: target, choice: "publish", estimatedWork: "publish"}], outcomePlan.managedOutcome);
    }

    /**
     * Plans raw generated JSON as a file publication, never as an Outcome
     * Library bundle.  This shares immutable source/destination rebinding and
     * execution sequencing with conversions while keeping the non-native
     * boundary visible to all preflight consumers.
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering -- this public compatibility API stays beside its planner helpers
    public planRawOutcomeLibraryJsonPublication(source: ArtifactIdentity, destinationPath?: string): ArtifactFilePublicationPlan {
        const target: ArtifactFilePublicationIdentity = {
            kind: "rawOutcomeLibraryJson",
            ...(destinationPath === undefined ? {} : {canonicalLocation: path.resolve(destinationPath)}),
            capabilities: [],
            recognitionProvenance: "raw generated Outcome Library JSON file (not a native bundle)",
        };
        return {
            status: "planned",
            source,
            target,
            steps: destinationPath === undefined
                ? []
                : [{kind: "publish", input: source, output: target, choice: "publish", estimatedWork: "publish", losses: ["Raw JSON is a file publication, not a canonical Outcome Library bundle."]}],
            preflight: {
                destinationKind: "file",
                estimatedWork: destinationPath === undefined ? "none" : "publish",
                losses: ["Raw JSON is a file publication, not a canonical Outcome Library bundle."],
                oneWay: true,
            },
        };
    }

    private planOutcomeFromRuntime(
        source: ArtifactIdentity,
        target: ArtifactTargetIdentity,
        preflight: ArtifactConversionPreflight,
        options: ArtifactConversionPlanningOptions,
    ): ArtifactConversionPlan {
        const candidate = options.managedOutcome === undefined
            ? undefined
            : verifyManagedOutcomeCandidate(source, options.managedOutcome, options);
        if (candidate?.verified && options.managedOutcome !== undefined) {
            const reuse: ArtifactConversionStep = {
                kind: "reuseManagedOutcomeLibrary",
                input: source,
                output: options.managedOutcome.identity,
                choice: "reuse",
                estimatedWork: "none",
            };
            // A managed bundle is an input to a requested Outcome publication,
            // not permission to silently ignore the requested destination.  A
            // destination-less plan is still useful for a pure reuse preview;
            // once a destination is supplied its publication is an explicit,
            // executable step just like the Stake publish below.
            return this.planned(
                source,
                target,
                preflight,
                options.destinationPath === undefined
                    ? [reuse]
                    : [reuse, {kind: "publish", input: options.managedOutcome.identity, output: target, choice: "publish", estimatedWork: "publish"}],
                {disposition: "reused"},
            );
        }
        const runtime: ArtifactIdentity = {kind: "tsPackage", capabilities: TARGET_CAPABILITIES.tsPackage};
        return this.planned(source, target, preflight, [
            {kind: "materializeRuntime", input: source, output: runtime, choice: "materialize", estimatedWork: "materialize"},
            {kind: "generateOutcomeLibrary", input: runtime, output: target, choice: "materialize", estimatedWork: "generate"},
        ], candidate === undefined ? undefined : {disposition: "ineligible", reason: candidate.staleReason});
    }

    private planStakeFromRuntime(
        source: ArtifactIdentity,
        target: ArtifactTargetIdentity,
        preflight: ArtifactConversionPreflight,
        options: ArtifactConversionPlanningOptions,
    ): ArtifactConversionPlan {
        const outcome = this.targetIdentity("outcomeLibrary", undefined, options.generationSemantics, options.sampleCount, options.sampleSeed, options.maxExactOutcomeSpaceSize);
        // The requested destination belongs to the final Stake publication.
        // An intermediate reused Outcome Library must never be republished to
        // that Stake directory before the selected Stake publish executes.
        const outcomePlan = this.planOutcomeFromRuntime(
            source,
            outcome,
            this.preflight("outcomeLibrary", source.kind as ProjectType, options.generationSemantics),
            {...options, destinationPath: undefined},
        );
        if (outcomePlan.status !== "planned") return outcomePlan;
        const prerequisiteOutput = outcomePlan.steps[outcomePlan.steps.length - 1]?.output ?? outcome;
        // The Stake plan is an extension of the selected Outcome prerequisite,
        // not a fresh decision.  Preserve its reuse/ineligible provenance so
        // every adapter can explain why this exact plan will reuse a managed
        // library (or regenerate it) without re-looking it up during publish.
        return this.planned(
            source,
            target,
            preflight,
            [...outcomePlan.steps, {kind: "publish", input: prerequisiteOutput, output: target, choice: "publish", estimatedWork: "publish"}],
            outcomePlan.managedOutcome,
        );
    }

    private planned(
        source: ArtifactIdentity,
        target: ArtifactTargetIdentity,
        preflight: ArtifactConversionPreflight,
        steps: readonly ArtifactConversionStep[],
        managedOutcome?: ArtifactConversionPlan["managedOutcome"],
    ): ArtifactConversionPlan {
        // Preflight describes the selected path, rather than the most expensive
        // path that could have reached this target.  In particular, a Stake
        // plan which reuses a verified managed Outcome Library only reads that
        // prerequisite and publishes the final export; it does not generate an
        // Outcome Library again.
        const estimatedWork = steps.reduce<ArtifactConversionPreflight["estimatedWork"]>(
            (current, step) => this.moreExpensiveWork(current, step.estimatedWork),
            "none",
        );
        return {
            status: "planned",
            source,
            target,
            steps,
            preflight: {...preflight, estimatedWork},
            ...(managedOutcome === undefined ? {} : {managedOutcome}),
        };
    }

    private moreExpensiveWork(
        left: ArtifactConversionPreflight["estimatedWork"],
        right: ArtifactConversionStep["estimatedWork"],
    ): ArtifactConversionPreflight["estimatedWork"] {
        const rank: Readonly<Record<ArtifactConversionPreflight["estimatedWork"], number>> = {
            none: 0,
            read: 1,
            publish: 2,
            materialize: 3,
            generate: 4,
        };
        return rank[left] >= rank[right] ? left : right;
    }

    private targetIdentity(
        kind: ArtifactTargetType,
        destinationPath?: string,
        generationSemantics?: "exact" | "boundedSample",
        sampleCount?: bigint | string,
        sampleSeed?: string,
        maxExactOutcomeSpaceSize?: bigint | string,
    ): ArtifactTargetIdentity {
        // The target is an output identity, not merely a display label.  A
        // bounded request with a different count or seed must therefore be a
        // different prepared output, even before a managed candidate is
        // considered or execution starts.
        const configurationProvenance = generationSemantics === undefined
            ? undefined
            : {
                generationSemantics,
                ...(sampleCount === undefined ? {} : {sampleCount: String(sampleCount)}),
                ...(sampleSeed === undefined ? {} : {sampleSeed}),
                ...(maxExactOutcomeSpaceSize === undefined ? {} : {maxExactOutcomeSpaceSize: String(maxExactOutcomeSpaceSize)}),
            };
        return {
            kind,
            ...(destinationPath === undefined ? {} : {canonicalLocation: path.resolve(destinationPath)}),
            capabilities: TARGET_CAPABILITIES[kind],
            ...(configurationProvenance === undefined ? {} : {configurationProvenance}),
        };
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
