import type {RoundArtifact} from "../../artifact/RoundArtifact.js";
import type {PokieGame} from "../../gamepackage/PokieGame.js";
import type {ValidationRule} from "../../validation/ValidationRule.js";
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
 * The publication identity resolved together with a generation request.  The
 * generator does not write files itself, but publishers must consume this
 * value instead of retaining a second, independently-normalised destination.
 */
export type OutcomeLibraryGenerationDestination = {
    readonly path: string;
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
    readonly resumeFrom?: ExactEnumerationCheckpoint;
    readonly signal?: AbortSignal;
    readonly onProgress?: (processedRawIndex: bigint, progressTotal: bigint) => void;
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
    validateGeneration(request.generation, request.sample);
    if (request.outputDestination !== undefined && request.outputDestination.trim().length === 0) {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-destination-conflict",
            "outputDestination must be a non-empty destination identity when present.",
        );
    }
}

function resolveOutputDestination(outputDestination: string | undefined): OutcomeLibraryGenerationDestination | undefined {
    if (outputDestination === undefined) return undefined;
    // Deliberately do not apply a filesystem-specific resolver here. CLI,
    // Studio and managed callers are responsible for resolving their own
    // project-relative syntax before this domain boundary; from here on all
    // producers share this one immutable publication identity.
    return {path: outputDestination.trim()};
}

function validateGeneration(requestedGeneration: OutcomeLibraryGenerationMode | undefined, sample: OutcomeLibraryGenerationSample | undefined): void {
    const generation = requestedGeneration ?? "default";
    if ((generation === "sampled" || generation === "bounded") && sample === undefined) {
        throw new WeightedOutcomeLibraryGenerationError("weighted-outcome-library-generation-invalid-sample-size", `${generation} generation requires a positive sampleSize and deterministic seed.`);
    }
    if ((generation === "default" || generation === "exact") && sample !== undefined) {
        throw new WeightedOutcomeLibraryGenerationError("weighted-outcome-library-generation-strategy-conflict", `${generation} generation cannot be combined with sampled generation.`);
    }
    if (sample !== undefined && (sample.sampleSize <= BigInt(0) || sample.seed.length === 0)) {
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
    const estimate = estimateExactOutcomeSpaceSize(identifiedRequest.game);
    const destination = resolveOutputDestination(identifiedRequest.outputDestination);
    const preflight = preflightOutcomeLibraryGenerationFromEstimate(estimate, identifiedRequest);
    return {
        ...identifiedRequest,
        ...(destination === undefined ? {} : {outputDestination: destination.path}),
        generation: identifiedRequest.generation ?? "default",
        maxExactOutcomeSpaceSize: identifiedRequest.maxExactOutcomeSpaceSize ?? DEFAULT_MAX_EXACT_OUTCOME_SPACE_SIZE,
        preflight: {...preflight, ...(destination === undefined ? {} : {destination})},
    };
}

/** Lets adapters which already loaded an estimate render the canonical decision without reimplementing it. */
export function preflightOutcomeLibraryGenerationFromEstimate(estimate: OutcomeSpaceEstimate, request: Pick<OutcomeLibraryGenerationRequest, "generation" | "maxExactOutcomeSpaceSize" | "sample">): OutcomeLibraryGenerationPreflight {
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
