import {InvalidJsonValueError} from "../json/InvalidJsonValueError.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import {BASE_SIMULATION_CATEGORY} from "../simulation/SimulationCategoryNames.js";
import {buildRoundStepArtifact} from "./buildRoundStepArtifact.js";
import {canonicalizeJsonField} from "./internal/canonicalizeJsonField.js";
import {deepFreeze} from "./internal/deepFreeze.js";
import {ROUND_ARTIFACT_SCHEMA_VERSION, type RoundArtifact} from "./RoundArtifact.js";
import {RoundArtifactBuildError} from "./RoundArtifactBuildError.js";
import type {RoundArtifactFeatureEvent, RoundArtifactFeatureEventInput} from "./RoundArtifactFeatureEvent.js";
import type {RoundArtifactProvenance} from "./RoundArtifactProvenance.js";
import type {RoundArtifactStepSource} from "./RoundArtifactStepSource.js";

export type RoundArtifactBuildOptions<T extends string | number | symbol = string> = {
    roundId: string;
    provenance: RoundArtifactProvenance;
    stake: number;
    steps: readonly RoundArtifactStepSource<T>[];
    betMode?: string;
    featureEvents?: readonly RoundArtifactFeatureEventInput[];
    debug?: Record<string, unknown>;
    schemaVersion?: number;
};

// The one place a RoundArtifact's round-level aggregates (totalWin/wins/screen) are derived — always from each
// step's own already-computed WinEvaluationResult (via buildRoundStepArtifact), never a second calculation
// path. Supports multi-step rounds natively: pass more than one step source (e.g. one per CascadeStep) and the
// aggregates fold across all of them; a plain single-step round just passes one.
//
// Fails fast with RoundArtifactBuildError — before any RoundArtifact is ever returned — on: an empty steps
// list, an invalid roundId/betMode/stake/schemaVersion, an invalid win amount (via buildRoundStepArtifact), or
// content that isn't JSON-safe (metadata/debug/feature event data, or anything else in the built artifact —
// see the final toCanonicalJson pass below). The returned RoundArtifact is deeply copied from every input and
// deeply frozen (see deepFreeze), so it can never be mutated afterward, whether via the artifact itself or via
// whatever the caller originally passed in.
export function buildRoundArtifact<T extends string | number | symbol = string>(
    options: RoundArtifactBuildOptions<T>,
): RoundArtifact<T> {
    if (options.steps.length === 0) {
        throw new RoundArtifactBuildError("round-artifact-steps-empty", "buildRoundArtifact requires at least one step.");
    }
    if (typeof options.roundId !== "string" || options.roundId.trim().length === 0) {
        throw new RoundArtifactBuildError(
            "round-artifact-round-id-invalid",
            `roundId must be a non-empty string, got ${JSON.stringify(options.roundId)}.`,
        );
    }
    const betMode = options.betMode ?? BASE_SIMULATION_CATEGORY;
    if (typeof betMode !== "string" || betMode.trim().length === 0) {
        throw new RoundArtifactBuildError(
            "round-artifact-bet-mode-invalid",
            `betMode must be a non-empty string, got ${JSON.stringify(betMode)}.`,
        );
    }
    if (!Number.isFinite(options.stake) || options.stake < 0) {
        throw new RoundArtifactBuildError(
            "round-artifact-stake-invalid",
            `stake must be a finite number >= 0, got ${options.stake}.`,
        );
    }
    const schemaVersion = options.schemaVersion ?? ROUND_ARTIFACT_SCHEMA_VERSION;
    if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
        throw new RoundArtifactBuildError(
            "round-artifact-schema-version-invalid",
            `schemaVersion must be a positive integer, got ${schemaVersion}.`,
        );
    }

    const steps = options.steps.map((step, index) => buildRoundStepArtifact(index, step));
    const totalWin = steps.reduce((sum, step) => sum + step.totalWin, 0);
    const wins = steps.flatMap((step) => step.wins);
    const lastStep = steps[steps.length - 1];
    const stepFeatureEvents = steps.flatMap((step) => step.featureEvents ?? []);
    const optionFeatureEvents: RoundArtifactFeatureEvent[] = (options.featureEvents ?? []).map((event) => ({
        type: event.type,
        ...(event.data !== undefined
            ? {data: canonicalizeJsonField(`round feature event "${event.type}" data`, event.data)}
            : {}),
    }));
    const featureEvents = [...stepFeatureEvents, ...optionFeatureEvents];

    const candidate: RoundArtifact<T> = {
        schemaVersion,
        roundId: options.roundId,
        provenance: {...options.provenance, game: {...options.provenance.game}},
        betMode,
        stake: options.stake,
        totalWin,
        payoutMultiplier: options.stake > 0 ? totalWin / options.stake : 0,
        screen: lastStep.screen,
        steps,
        wins,
        ...(featureEvents.length > 0 ? {featureEvents} : {}),
        ...(options.debug !== undefined ? {debug: canonicalizeJsonField("round debug", options.debug)} : {}),
    };

    try {
        toCanonicalJson(candidate);
    } catch (error) {
        const reason = error instanceof InvalidJsonValueError ? error.message : String(error);
        throw new RoundArtifactBuildError("round-artifact-not-json-safe", `Built RoundArtifact is not JSON-safe: ${reason}`);
    }

    return deepFreeze(candidate);
}
