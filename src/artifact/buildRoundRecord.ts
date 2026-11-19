import {InvalidJsonValueError} from "../json/InvalidJsonValueError.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import {BASE_SIMULATION_CATEGORY} from "../simulation/SimulationCategoryNames.js";
import {buildRoundStepRecord} from "./buildRoundStepRecord.js";
import {assertValidFeatureEventInput} from "./internal/assertValidFeatureEventInput.js";
import {canonicalizeJsonField} from "./internal/canonicalizeJsonField.js";
import {deepFreeze} from "../internal/deepFreeze.js";
import {ROUND_RECORD_SCHEMA_VERSION, type RoundRecord} from "./RoundRecord.js";
import {RoundRecordBuildError} from "./RoundRecordBuildError.js";
import type {RoundRecordFeatureEvent, RoundRecordFeatureEventInput} from "./RoundRecordFeatureEvent.js";
import type {RoundRecordOrigin} from "./RoundRecordOrigin.js";
import type {RoundRecordStepSource} from "./RoundRecordStepSource.js";

export type RoundRecordBuildOptions<T extends string | number = string> = {
    roundId: string;
    origin: RoundRecordOrigin;
    stake: number;
    steps: readonly RoundRecordStepSource<T>[];
    betMode?: string;
    featureEvents?: readonly RoundRecordFeatureEventInput[];
    debug?: Record<string, unknown>;
    schemaVersion?: number;
};

// The one place a RoundRecord's round-level aggregates (totalWin/wins/screen) are derived — always from each
// step's own already-computed WinEvaluationResult (via buildRoundStepRecord), never a second calculation
// path. Supports multi-step rounds natively: pass more than one step source (e.g. one per CascadeStep) and the
// aggregates fold across all of them; a plain single-step round just passes one.
//
// Fails fast with RoundRecordBuildError — before any RoundRecord is ever returned — on: an empty steps
// list, an invalid roundId/betMode/stake/schemaVersion, an invalid win amount (via buildRoundStepRecord), or
// content that isn't JSON-safe (metadata/debug/feature event data, or anything else in the built artifact —
// see the final toCanonicalJson pass below). The returned RoundRecord is deeply copied from every input and
// deeply frozen (see deepFreeze), so it can never be mutated afterward, whether via the artifact itself or via
// whatever the caller originally passed in.
export function buildRoundRecord<T extends string | number = string>(
    options: RoundRecordBuildOptions<T>,
): RoundRecord<T> {
    if (options.steps.length === 0) {
        throw new RoundRecordBuildError("round-record-steps-empty", "buildRoundRecord requires at least one step.");
    }
    if (typeof options.roundId !== "string" || options.roundId.trim().length === 0) {
        throw new RoundRecordBuildError(
            "round-record-round-id-invalid",
            `roundId must be a non-empty string, got ${JSON.stringify(options.roundId)}.`,
        );
    }
    const betMode = options.betMode ?? BASE_SIMULATION_CATEGORY;
    if (typeof betMode !== "string" || betMode.trim().length === 0) {
        throw new RoundRecordBuildError(
            "round-record-bet-mode-invalid",
            `betMode must be a non-empty string, got ${JSON.stringify(betMode)}.`,
        );
    }
    if (!Number.isFinite(options.stake) || options.stake < 0) {
        throw new RoundRecordBuildError(
            "round-record-stake-invalid",
            `stake must be a finite number >= 0, got ${options.stake}.`,
        );
    }
    const schemaVersion = options.schemaVersion ?? ROUND_RECORD_SCHEMA_VERSION;
    if (schemaVersion !== ROUND_RECORD_SCHEMA_VERSION) {
        throw new RoundRecordBuildError(
            "round-record-schema-version-invalid",
            `schemaVersion must be the current supported version (${ROUND_RECORD_SCHEMA_VERSION}), got ${String(schemaVersion)}.`,
        );
    }
    (options.featureEvents ?? []).forEach((event) => assertValidFeatureEventInput(event, "round"));

    const steps = options.steps.map((step, index) => buildRoundStepRecord(index, step));
    const totalWin = steps.reduce((sum, step) => sum + step.totalWin, 0);
    const wins = steps.flatMap((step) => step.wins);
    const lastStep = steps[steps.length - 1];
    const stepFeatureEvents = steps.flatMap((step) => step.featureEvents ?? []);
    const optionFeatureEvents: RoundRecordFeatureEvent[] = (options.featureEvents ?? []).map((event) => ({
        type: event.type,
        ...(event.data !== undefined
            ? {data: canonicalizeJsonField(`round feature event "${event.type}" data`, event.data)}
            : {}),
    }));
    const featureEvents = [...stepFeatureEvents, ...optionFeatureEvents];

    const candidate: RoundRecord<T> = {
        ...(lastStep.sequenceSelections ? {sequenceSelections: lastStep.sequenceSelections} : {}),
        schemaVersion,
        roundId: options.roundId,
        origin: {...options.origin, game: {...options.origin.game}},
        betMode,
        stake: options.stake,
        totalWin,
        payoutMultiplier: options.stake > 0 ? totalWin / options.stake : 0,
        screen: lastStep.screen,
        ...(lastStep.geometry ? {geometry: lastStep.geometry, generatedScreen: lastStep.generatedScreen} : {}),
        steps,
        wins,
        ...(featureEvents.length > 0 ? {featureEvents} : {}),
        ...(options.debug !== undefined ? {debug: canonicalizeJsonField("round debug", options.debug)} : {}),
    };

    try {
        toCanonicalJson(candidate);
    } catch (error) {
        const reason = error instanceof InvalidJsonValueError ? error.message : String(error);
        throw new RoundRecordBuildError("round-record-not-json-safe", `Built RoundRecord is not JSON-safe: ${reason}`);
    }

    return deepFreeze(candidate);
}
