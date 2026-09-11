import type {RoundArtifact} from "../../artifact/RoundArtifact.js";
import type {PokieGame} from "../../gamepackage/PokieGame.js";
import type {ValidationRule} from "../../validation/ValidationRule.js";
import fs from "fs";
import path from "path";
import {randomUUID} from "crypto";
import {estimateExactOutcomeSpaceSize} from "./estimateExactOutcomeSpaceSize.js";
import type {OutcomeSpaceEstimate} from "./OutcomeSpaceEstimate.js";
import type {ExactEnumerationCheckpoint} from "./WeightedOutcomeLibraryGenerationCancelledError.js";
import {WeightedOutcomeLibraryGenerationError} from "./WeightedOutcomeLibraryGenerationError.js";
import type {OutcomeLibraryGenerationStrategy} from "./OutcomeLibraryGeneratorDiagnostics.js";

// This is deliberately the one default used by the public generator, CLI and Studio.  A producer may
// choose a smaller managed-artifact policy, but it must express that choice as an explicit request rather
// than silently replacing this safety boundary.
export const DEFAULT_MAX_EXACT_OUTCOME_SPACE_SIZE = BigInt(20_000_000);

/** The named compatibility policy used when a caller elects conditional bounded coverage. */
export const DEFAULT_BOUNDED_OUTCOME_LIBRARY_SAMPLE_SIZE = BigInt(10_000);
export const DEFAULT_BOUNDED_OUTCOME_LIBRARY_SEED = "pokie-bounded-coverage-v1";
export const OUTCOME_LIBRARY_GENERATION_COMPATIBILITY_VERSION = "v1";

/**
 * A deliberately separate compatibility policy for managed Blueprint/package
 * conversion.  Managed artifacts are much larger than raw libraries, so this
 * historical 50,000/5,000 boundary must not silently replace the public
 * CLI/Studio default.  Keeping it here gives every adapter one versioned
 * owner and makes policy changes observable in provenance/review.
 */
export const MANAGED_OUTCOME_LIBRARY_GENERATION_COMPATIBILITY_POLICY = {
    version: "managed-v1",
    maxExactOutcomeSpaceSize: BigInt(50_000),
    sampledOutcomeCount: BigInt(5_000),
    seedPrefix: "pokie-managed-coverage:",
} as const;

export type OutcomeLibraryGenerationSample = {readonly sampleSize: bigint; readonly seed: string};
export type OutcomeLibraryGenerationMode = "default" | "exact" | "sampled" | "bounded";

/**
 * An adapter-owned capability for the bounded disk state of one exact run.
 *
 * Checkpoints carry only `id`.  In particular, they never carry a staging
 * path or the proof needed to open it: those remain in an adapter-owned
 * registry outside the checkpoint document.  This prevents a hand-edited
 * checkpoint from turning recovery cleanup into a recursive delete of an
 * arbitrary directory.
 */
export type ExactEnumerationRecoveryAuthority = {
    readonly id: string;
    readonly acquireStagingDirectory: (resuming: boolean) => {
        readonly stagingDirectory: string;
        readonly markerProof: string;
    };
    /** Removes state only after the producer proves the exact issued marker. */
    readonly releaseStagingDirectory: (expectedMarker: string) => void;
};

type RecoveryAuthorityRecord = {
    readonly schemaVersion: 1;
    readonly id: string;
    readonly markerProof: string;
};

function recoveryConflict(message: string): WeightedOutcomeLibraryGenerationError {
    return new WeightedOutcomeLibraryGenerationError("weighted-outcome-library-generation-checkpoint-mismatch", message);
}

/**
 * Issues the durable capability used by CLI and Studio recovery adapters.
 * The registry is deliberately sibling state, not data serialized into a
 * checkpoint.  A checkpoint author can at most name an existing registry
 * entry beneath this adapter-selected root; it cannot select a filesystem
 * path or forge the marker proof for another entry.
 */
export function issueExactEnumerationRecoveryAuthority(recoveryRoot: string, requestedId?: string): ExactEnumerationRecoveryAuthority {
    const id = requestedId ?? randomUUID();
    if (!(/^[0-9a-f-]{36}$/i).test(id)) throw recoveryConflict("The recovery authority is invalid. Start a new generation.");
    const root = path.resolve(recoveryRoot);
    const stagingDirectory = path.join(root, id);
    const registryDirectory = path.join(root, ".authorities");
    const recordPath = path.join(registryDirectory, `${id}.json`);

    const establishedRoot = (): string => {
        fs.mkdirSync(root, {recursive: true, mode: 0o700});
        const realRoot = fs.realpathSync(root);
        if (path.dirname(stagingDirectory) !== root || path.dirname(registryDirectory) !== root) {
            throw recoveryConflict("The recovery authority resolves outside its adapter-owned root. Start a new generation.");
        }
        return realRoot;
    };
    const assertOwnedStagingDirectory = (realRoot: string): void => {
        let stat: fs.Stats;
        try {
            stat = fs.lstatSync(stagingDirectory);
        } catch {
            throw recoveryConflict("The resumable exact checkpoint no longer has its invocation-owned disk state. Start a new generation.");
        }
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
            throw recoveryConflict("The resumable exact checkpoint staging state is not an owned directory. Start a new generation.");
        }
        const realStaging = fs.realpathSync(stagingDirectory);
        if (path.dirname(realStaging) !== realRoot || path.basename(realStaging) !== id) {
            throw recoveryConflict("The resumable exact checkpoint staging state resolves outside its owned recovery root. Start a new generation.");
        }
    };
    const readRecord = (): RecoveryAuthorityRecord => {
        let record: unknown;
        try {
            record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
        } catch {
            throw recoveryConflict("The resumable exact checkpoint has no authenticated adapter recovery record. Start a new generation.");
        }
        if (
            record === null || typeof record !== "object" ||
            (record as Partial<RecoveryAuthorityRecord>).schemaVersion !== 1 ||
            (record as Partial<RecoveryAuthorityRecord>).id !== id ||
            typeof (record as Partial<RecoveryAuthorityRecord>).markerProof !== "string" ||
            (record as Partial<RecoveryAuthorityRecord>).markerProof!.length < 32
        ) {
            throw recoveryConflict("The resumable exact checkpoint recovery record is corrupt. Start a new generation.");
        }
        return record as RecoveryAuthorityRecord;
    };

    return {
        id,
        acquireStagingDirectory: (resuming) => {
            const realRoot = establishedRoot();
            if (resuming) {
                const record = readRecord();
                assertOwnedStagingDirectory(realRoot);
                return {stagingDirectory, markerProof: record.markerProof};
            }
            fs.mkdirSync(registryDirectory, {recursive: true, mode: 0o700});
            const record: RecoveryAuthorityRecord = {schemaVersion: 1, id, markerProof: randomUUID() + randomUUID()};
            try {
                fs.writeFileSync(recordPath, JSON.stringify(record), {flag: "wx", mode: 0o600});
                fs.mkdirSync(stagingDirectory, {mode: 0o700});
            } catch (error) {
                // The record is invocation-owned only when it still matches
                // the value written above; never remove a pre-existing entry.
                try {
                    if (fs.readFileSync(recordPath, "utf8") === JSON.stringify(record)) fs.rmSync(recordPath, {force: true});
                } catch {
                    // A failed issue remains a safe conflict; no untrusted state is cleaned up.
                }
                throw recoveryConflict((error as NodeJS.ErrnoException | undefined)?.code === "EEXIST"
                    ? "Recovery state already exists for this invocation. Start a new generation."
                    : "Could not issue authenticated recovery state. Start a new generation.");
            }
            return {stagingDirectory, markerProof: record.markerProof};
        },
        releaseStagingDirectory: (expectedMarker) => {
            const realRoot = establishedRoot();
            const record = readRecord();
            assertOwnedStagingDirectory(realRoot);
            let marker: string;
            try {
                marker = fs.readFileSync(path.join(stagingDirectory, ".pokie-exact-checkpoint.json"), "utf8");
            } catch {
                throw recoveryConflict("The owned recovery marker is missing; recovery state was left untouched. Start a new generation.");
            }
            if (marker !== expectedMarker || !marker.includes(record.markerProof)) {
                throw recoveryConflict("The owned recovery marker is corrupt; recovery state was left untouched. Start a new generation.");
            }
            fs.rmSync(stagingDirectory, {recursive: true, force: true});
            // The record was checked above and is not checkpoint-selected;
            // remove it only after its matching issued staging state is gone.
            fs.rmSync(recordPath, {force: true});
        },
    };
}

/**
 * The publication identity resolved together with a generation request.  The
 * generator does not write files itself, but publishers must consume this
 * value instead of retaining a second, independently-normalised destination.
 */
export type OutcomeLibraryGenerationDestination = {
    readonly path: string;
    readonly safety?: OutcomeLibraryGenerationDestinationSafety;
};

/**
 * Filesystem-independent producers still need one vocabulary for publication
 * safety.  Adapters translate their path syntax and declare the one supported
 * publication shape; preparation then canonicalises and verifies it once.
 *
 * `allowWithinSource` is deliberately explicit for a managed/Studio sidecar.
 * It is not an adapter bypass: it records the exceptional publication policy
 * in the immutable request that is bound to preflight and execution.
 */
export type OutcomeLibraryGenerationDestinationSafety = {
    /**
     * Optional root for a producer's relative destination syntax.  This is a
     * publication invariant, rather than a Studio-only path helper: when it
     * is supplied, preparation resolves `outputDestination` from this root
     * and can require the resolved path to remain below it.
     */
    readonly basePath?: string;
    /** Reject absolute, `..`, and symlink escapes from `basePath`. */
    readonly requireWithinBase?: boolean;
    readonly sourcePath?: string;
    readonly kind?: "file" | "directory";
    readonly requireAvailable?: boolean;
    readonly allowWithinSource?: boolean;
};

/**
 * Domain-level generation request.  It carries the complete executable contract, not a CLI or HTTP DTO:
 * identity/provenance, strategy, bounded work, publication intent, and the cooperative lifecycle all travel
 * together.  `default` preserves the historical exact-until-cap behaviour; `bounded` is the legacy
 * compatibility policy and only samples above the cap, whereas `sampled` always samples explicitly.
 */
export type OutcomeLibraryGenerationRequest = {
    readonly libraryId: string;
    readonly game: PokieGame;
    readonly pokieVersion: string;
    readonly mode?: string;
    readonly stake?: number;
    readonly configHash?: string;
    /** Named compatibility policy which selected this request's defaults, when applicable. */
    readonly compatibilityPolicyVersion?: string;
    readonly selectBetMode?: boolean;
    readonly generation?: OutcomeLibraryGenerationMode;
    readonly maxExactOutcomeSpaceSize?: bigint;
    readonly sample?: OutcomeLibraryGenerationSample;
    readonly outputDestination?: string;
    /** Publication policy consumed by the domain request, never by a writer-local default. */
    readonly outputDestinationSafety?: OutcomeLibraryGenerationDestinationSafety;
    readonly resumeFrom?: ExactEnumerationCheckpoint;
    /**
     * Persist an invocation-owned, partitioned disk checkpoint on exact
     * cancellation. This is bounded streaming state; it never selects the
     * in-memory grid accumulator.
     */
    readonly durableCheckpointOnCancellation?: boolean;
    /** Never serialized into a checkpoint; supplied again by its owning adapter on resume. */
    readonly recoveryAuthority?: ExactEnumerationRecoveryAuthority;
    readonly signal?: AbortSignal;
    readonly onProgress?: (processedRawIndex: bigint, progressTotal: bigint) => void;
    // The raw reel-stop sweep is only the first half of exact generation.  Publishers use these
    // hooks to distinguish its completion from evaluating/deduplicating the resulting visible grids.
    readonly onPostEnumeration?: () => void;
    readonly onPostEnumerationProgress?: (emittedOutcomes: bigint) => void;
    readonly artifactValidator?: ValidationRule<RoundArtifact>;
    readonly now?: () => Date;
    readonly heapUsedLimitBytes?: number;
    readonly getHeapUsedBytes?: () => number;
};

export type OutcomeLibraryGenerationPreflight = {
    readonly estimate: OutcomeSpaceEstimate;
    readonly maxExactOutcomeSpaceSize: bigint;
    readonly strategy: OutcomeLibraryGenerationStrategy;
    readonly sample?: OutcomeLibraryGenerationSample;
    readonly requiresSampledOptIn: boolean;
    readonly expectedRawWork: bigint;
    readonly warnings: readonly string[];
    /** The destination identity the execution request is bound to, when it publishes output. */
    readonly destination?: OutcomeLibraryGenerationDestination;
};

export type ResolvedOutcomeLibraryGenerationRequest = OutcomeLibraryGenerationRequest & {
    /**
     * The executable package is the authority for configuration provenance.
     * When it exposes a hash this is always that loaded value, never a
     * caller-supplied label.  It remains optional for handwritten packages
     * which have no configuration identity to expose.
     */
    readonly configHash?: string;
    readonly generation: OutcomeLibraryGenerationMode;
    readonly maxExactOutcomeSpaceSize: bigint;
    readonly outputDestination?: string;
    readonly outputDestinationSafety?: OutcomeLibraryGenerationDestinationSafety;
    readonly preflight: OutcomeLibraryGenerationPreflight;
};

/** Bigint-safe transport parser shared by CLI/Studio adapters; never round-trips generation counts through Number. */
export function parsePositiveOutcomeLibraryGenerationDecimal(value: unknown, field: string): bigint {
    if (typeof value !== "string" || !(/^[0-9]+$/).test(value) || BigInt(value) <= BigInt(0)) {
        throw new Error(`"${field}" must be a positive integer decimal string.`);
    }
    return BigInt(value);
}

function validateRequest(request: OutcomeLibraryGenerationRequest): void {
    if (typeof request.libraryId !== "string" || request.libraryId.trim().length === 0) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-invalid-request",
            "libraryId must be a non-empty library identity.",
        );
    }
    if (request.mode !== undefined && (typeof request.mode !== "string" || request.mode.trim().length === 0)) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-invalid-request",
            "mode must be a non-empty mode identity when present.",
        );
    }
    if (request.stake !== undefined && (!Number.isFinite(request.stake) || request.stake <= 0)) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-invalid-request",
            "stake must be a positive finite number when present.",
        );
    }
    if (request.configHash !== undefined && (typeof request.configHash !== "string" || request.configHash.trim().length === 0)) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-invalid-request",
            "configHash must be a non-empty configuration identity when present.",
        );
    }
    if (request.maxExactOutcomeSpaceSize !== undefined && (typeof request.maxExactOutcomeSpaceSize !== "bigint" || request.maxExactOutcomeSpaceSize <= BigInt(0))) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-invalid-request",
            "maxExactOutcomeSpaceSize must be a positive integer when present.",
        );
    }
    validateGeneration(request.generation, request.sample);
    if (request.outputDestination !== undefined && (typeof request.outputDestination !== "string" || request.outputDestination.trim().length === 0)) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-destination-conflict",
            "outputDestination must be a non-empty destination identity when present.",
        );
    }
    if (request.durableCheckpointOnCancellation !== undefined && typeof request.durableCheckpointOnCancellation !== "boolean") {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-invalid-request",
            "durableCheckpointOnCancellation must be boolean when present.",
        );
    }
}

function resolveThroughExistingAncestor(targetPath: string): string {
    const suffix: string[] = [];
    let current = path.resolve(targetPath);
    while (!fs.existsSync(current)) {
        const parent = path.dirname(current);
        if (parent === current) break;
        suffix.unshift(path.basename(current));
        current = parent;
    }
    return path.join(fs.existsSync(current) ? fs.realpathSync(current) : current, ...suffix);
}

function isSameOrDescendant(candidate: string, root: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function resolveDestinationBase(basePath: string): string {
    const resolvedBase = path.resolve(basePath);
    // Studio projects may be represented by a single source file. Their
    // sidecars belong beside that file, exactly as directory-backed projects'
    // sidecars belong beneath their root. Keeping this here means the request,
    // not an HTTP adapter, owns that distinction.
    return fs.existsSync(resolvedBase) && fs.statSync(resolvedBase).isFile()
        ? path.dirname(resolvedBase)
        : resolvedBase;
}

/**
 * Resolve and verify the one publication identity that execution is allowed
 * to use. This is exported so a writer that receives an already-prepared
 * request can assert the exact same safety vocabulary without recreating a
 * CLI/Studio-specific resolver.
 */
export function resolveOutcomeLibraryGenerationDestination(
    outputDestination: string | undefined,
    safety: OutcomeLibraryGenerationDestinationSafety | undefined,
): OutcomeLibraryGenerationDestination | undefined {
    if (outputDestination === undefined) return undefined;
    const basePath = safety?.basePath === undefined ? undefined : resolveDestinationBase(safety.basePath);
    const resolvedPath = basePath === undefined
        ? path.resolve(outputDestination.trim())
        : path.resolve(basePath, outputDestination.trim());
    const resolvedSafety: OutcomeLibraryGenerationDestinationSafety = {
        ...(basePath === undefined ? {} : {basePath}),
        ...(safety?.requireWithinBase === undefined ? {} : {requireWithinBase: safety.requireWithinBase}),
        ...(safety?.sourcePath === undefined ? {} : {sourcePath: path.resolve(safety.sourcePath)}),
        ...(safety?.kind === undefined ? {} : {kind: safety.kind}),
        ...(safety?.requireAvailable === undefined ? {} : {requireAvailable: safety.requireAvailable}),
        ...(safety?.allowWithinSource === undefined ? {} : {allowWithinSource: safety.allowWithinSource}),
    };
    if (basePath !== undefined && resolvedSafety.requireWithinBase) {
        const resolvedBase = resolveThroughExistingAncestor(basePath);
        const resolvedDestination = resolveThroughExistingAncestor(resolvedPath);
        if (!isSameOrDescendant(resolvedDestination, resolvedBase)) {
            throw new WeightedOutcomeLibraryGenerationError(
                "weighted-outcome-library-generation-destination-conflict",
                `Outcome Library destination "${resolvedPath}" resolves outside its permitted publication root "${basePath}". Choose a project-relative output path.`,
            );
        }
    }
    if (resolvedSafety.sourcePath !== undefined && !resolvedSafety.allowWithinSource) {
        const source = resolveThroughExistingAncestor(resolvedSafety.sourcePath);
        const destination = resolveThroughExistingAncestor(resolvedPath);
        const sourceIsDirectory = fs.existsSync(resolvedSafety.sourcePath) && fs.statSync(resolvedSafety.sourcePath).isDirectory();
        if (source === destination || (sourceIsDirectory && isSameOrDescendant(destination, source))) {
            throw new WeightedOutcomeLibraryGenerationError(
                "weighted-outcome-library-generation-destination-conflict",
                `Outcome Library destination "${resolvedPath}" is the source itself or lies inside source "${resolvedSafety.sourcePath}". Choose a separate output path.`,
            );
        }
    }
    if (resolvedSafety.requireAvailable && fs.existsSync(resolvedPath)) {
        const kind = resolvedSafety.kind ?? "directory";
        const available = kind === "directory" && fs.statSync(resolvedPath).isDirectory() && fs.readdirSync(resolvedPath).length === 0;
        if (!available) {
            throw new WeightedOutcomeLibraryGenerationError(
                "weighted-outcome-library-generation-destination-conflict",
                `Outcome Library destination "${resolvedPath}" already exists and is not available for a new ${kind} publication. Choose a different output path or remove it first.`,
            );
        }
    }
    return {
        path: resolvedPath,
        ...(Object.keys(resolvedSafety).length === 0 ? {} : {safety: resolvedSafety}),
    };
}

function validateGeneration(requestedGeneration: OutcomeLibraryGenerationMode | undefined, sample: OutcomeLibraryGenerationSample | undefined): void {
    if (requestedGeneration !== undefined && requestedGeneration !== "default" && requestedGeneration !== "exact" && requestedGeneration !== "sampled" && requestedGeneration !== "bounded") {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-invalid-request",
            "generation must be default, exact, sampled, or bounded when present.",
        );
    }
    const generation = requestedGeneration ?? "default";
    if ((generation === "sampled" || generation === "bounded") && sample === undefined) {
        throw new WeightedOutcomeLibraryGenerationError("weighted-outcome-library-generation-invalid-sample-size", `${generation} generation requires a positive sampleSize and deterministic seed.`);
    }
    if ((generation === "default" || generation === "exact") && sample !== undefined) {
        throw new WeightedOutcomeLibraryGenerationError("weighted-outcome-library-generation-strategy-conflict", `${generation} generation cannot be combined with sampled generation.`);
    }
    if (sample !== undefined && (typeof sample.sampleSize !== "bigint" || sample.sampleSize <= BigInt(0) || typeof sample.seed !== "string" || sample.seed.trim().length === 0)) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-invalid-sample-size",
            "sampleSize must be a positive integer and seed must be non-empty; use `--sample <n> --seed <string>` with a positive n.",
        );
    }
}

/**
 * Resolves the identity-bearing part of a request without enumerating it.
 * Adapters use this only while translating legacy transport syntax; execution
 * and preflight still go through prepareOutcomeLibraryGeneration below.
 */
export function resolveOutcomeLibraryGenerationIdentity(request: OutcomeLibraryGenerationRequest): OutcomeLibraryGenerationRequest {
    validateRequest(request);
    // Do this at the domain boundary, before any estimate, generation, or
    // publisher can observe caller supplied provenance.  CLI, Studio and
    // managed artifacts consequently share the direct TypeScript caller's
    // fail-closed identity semantics instead of each owning a local check.
    const loadedConfigHash = request.game.getConfigHash?.();
    if (loadedConfigHash !== undefined && request.configHash !== undefined && request.configHash !== loadedConfigHash) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-configuration-conflict",
            "The supplied configuration identity does not match the loaded game. Rebuild the package or omit the caller assertion.",
        );
    }
    return {...request, ...(loadedConfigHash === undefined ? {} : {configHash: loadedConfigHash})};
}

/** Resolves a request once, so estimate and execution select exactly the same strategy and work. */
export function prepareOutcomeLibraryGeneration(request: OutcomeLibraryGenerationRequest): ResolvedOutcomeLibraryGenerationRequest {
    const identifiedRequest = resolveOutcomeLibraryGenerationIdentity(request);
    if (typeof identifiedRequest.game.createExactEnumerationSession !== "function") {
        throw new WeightedOutcomeLibraryGenerationError("weighted-outcome-library-generation-unsupported", `"${request.game.getManifest().id}" does not implement createExactEnumerationSession(); its outcome space cannot be exactly enumerated.`);
    }
    return prepareOutcomeLibraryGenerationFromEstimate(estimateExactOutcomeSpaceSize(identifiedRequest.game), identifiedRequest);
}

/**
 * Resolves the same immutable identity and publication binding when a caller
 * already owns the cheap estimate probe.  This deliberately does not test the
 * executable enumeration capability: CLI preflight and injected producers can
 * report their supplied estimate before crossing the execution boundary.
 */
export function prepareOutcomeLibraryGenerationFromEstimate(
    estimate: OutcomeSpaceEstimate,
    request: OutcomeLibraryGenerationRequest,
): ResolvedOutcomeLibraryGenerationRequest {
    const identifiedRequest = resolveOutcomeLibraryGenerationIdentity(request);
    const destination = resolveOutcomeLibraryGenerationDestination(identifiedRequest.outputDestination, identifiedRequest.outputDestinationSafety);
    const preflight = preflightOutcomeLibraryGenerationFromEstimate(estimate, identifiedRequest);
    return {
        ...identifiedRequest,
        ...(destination === undefined ? {} : {
            outputDestination: destination.path,
            ...(destination.safety === undefined ? {} : {outputDestinationSafety: destination.safety}),
        }),
        generation: identifiedRequest.generation ?? "default",
        maxExactOutcomeSpaceSize: identifiedRequest.maxExactOutcomeSpaceSize ?? DEFAULT_MAX_EXACT_OUTCOME_SPACE_SIZE,
        preflight: {...preflight, ...(destination === undefined ? {} : {destination})},
    };
}

/** Lets adapters which already loaded an estimate render the canonical decision without reimplementing it. */
export function preflightOutcomeLibraryGenerationFromEstimate(estimate: OutcomeSpaceEstimate, request: Pick<OutcomeLibraryGenerationRequest, "generation" | "maxExactOutcomeSpaceSize" | "sample">): OutcomeLibraryGenerationPreflight {
    // This public helper is also used by adapters which already performed the
    // inexpensive estimate.  Keep its cap invariant identical to request
    // preparation so a preflight can never advertise an execution that the
    // domain request will subsequently reject.
    if (request.maxExactOutcomeSpaceSize !== undefined &&
        (typeof request.maxExactOutcomeSpaceSize !== "bigint" || request.maxExactOutcomeSpaceSize <= BigInt(0))) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-invalid-request",
            "maxExactOutcomeSpaceSize must be a positive integer when present.",
        );
    }
    validateGeneration(request.generation, request.sample);
    const maxExactOutcomeSpaceSize = request.maxExactOutcomeSpaceSize ?? DEFAULT_MAX_EXACT_OUTCOME_SPACE_SIZE;
    const generation = request.generation ?? "default";
    const strategy: OutcomeLibraryGenerationStrategy = generation === "sampled" || estimate.totalOutcomeSpaceSize > maxExactOutcomeSpaceSize
        ? "bounded-coverage"
        : "exact";
    const requiresSampledOptIn = strategy === "bounded-coverage" && request.sample === undefined;
    const expectedRawWork = strategy === "exact" ? estimate.totalOutcomeSpaceSize : request.sample?.sampleSize ?? BigInt(0);
    const warnings = [
        ...(requiresSampledOptIn ? [`Exact outcome space (${estimate.totalOutcomeSpaceSize}) exceeds the configured cap (${maxExactOutcomeSpaceSize}); select explicit sampled coverage or raise the cap.`] : []),
        ...(strategy === "bounded-coverage" && request.sample !== undefined ? ["Bounded coverage is deterministic but is not an exact enumeration."] : []),
    ];
    return {estimate, maxExactOutcomeSpaceSize, strategy, ...(request.sample === undefined ? {} : {sample: request.sample}), requiresSampledOptIn, expectedRawWork, warnings};
}

/** Compatibility adapter for the original direct-generator options and legacy CLI --bounded semantics. */
export function adaptLegacyOutcomeLibraryGenerationRequest(
    request: Omit<OutcomeLibraryGenerationRequest, "generation" | "maxExactOutcomeSpaceSize" | "sample"> & {
        readonly exact?: boolean;
        readonly bounded?: OutcomeLibraryGenerationSample;
        readonly sampled?: OutcomeLibraryGenerationSample;
        readonly maxOutcomeSpaceSize?: bigint;
    },
): OutcomeLibraryGenerationRequest {
    if (request.exact && (request.sampled !== undefined || request.bounded !== undefined)) {
        throw new WeightedOutcomeLibraryGenerationError("weighted-outcome-library-generation-strategy-conflict", "exact generation cannot be combined with sampled generation.");
    }
    if (request.sampled !== undefined && request.bounded !== undefined) {
        throw new WeightedOutcomeLibraryGenerationError("weighted-outcome-library-generation-strategy-conflict", "sampled and bounded generation cannot be combined.");
    }
    const {exact: _exact, bounded, sampled, maxOutcomeSpaceSize, ...common} = request;
    let generation: OutcomeLibraryGenerationMode = "default";
    let sample: OutcomeLibraryGenerationSample | undefined;
    if (_exact) generation = "exact";
    if (bounded !== undefined) {
        generation = "bounded";
        sample = bounded;
    }
    if (sampled !== undefined) {
        generation = "sampled";
        sample = sampled;
    }
    return {
        ...common,
        generation,
        ...(sample === undefined ? {} : {sample}),
        ...(maxOutcomeSpaceSize !== undefined ? {maxExactOutcomeSpaceSize: maxOutcomeSpaceSize} : {}),
    };
}
