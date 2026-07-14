import {BASE_SIMULATION_CATEGORY} from "../simulation/SimulationCategoryNames.js";
import {buildRoundStepArtifact} from "./buildRoundStepArtifact.js";
import {ROUND_ARTIFACT_SCHEMA_VERSION, type RoundArtifact} from "./RoundArtifact.js";
import type {RoundArtifactFeatureEvent} from "./RoundArtifactFeatureEvent.js";
import type {RoundArtifactProvenance} from "./RoundArtifactProvenance.js";
import type {RoundArtifactStepSource} from "./RoundArtifactStepSource.js";

export type RoundArtifactBuildOptions<T extends string | number | symbol = string> = {
    roundId: string;
    provenance: RoundArtifactProvenance;
    stake: number;
    steps: RoundArtifactStepSource<T>[];
    betMode?: string;
    featureEvents?: RoundArtifactFeatureEvent[];
    debug?: Record<string, unknown>;
    schemaVersion?: number;
};

// The one place a RoundArtifact's round-level aggregates (totalWin/wins/screen) are derived — always from each
// step's own already-computed WinEvaluationResult (via buildRoundStepArtifact), never a second calculation
// path. Supports multi-step rounds natively: pass more than one step source (e.g. one per CascadeStep) and the
// aggregates fold across all of them; a plain single-step round just passes one.
export function buildRoundArtifact<T extends string | number | symbol = string>(
    options: RoundArtifactBuildOptions<T>,
): RoundArtifact<T> {
    const steps = options.steps.map((step, index) => buildRoundStepArtifact(index, step));
    const totalWin = steps.reduce((sum, step) => sum + step.totalWin, 0);
    const wins = steps.flatMap((step) => step.wins);
    const lastStep = steps[steps.length - 1];
    const stepFeatureEvents = steps.flatMap((step) => step.featureEvents ?? []);
    const featureEvents = [...stepFeatureEvents, ...(options.featureEvents ?? [])];

    return {
        schemaVersion: options.schemaVersion ?? ROUND_ARTIFACT_SCHEMA_VERSION,
        roundId: options.roundId,
        provenance: {...options.provenance, game: {...options.provenance.game}},
        betMode: options.betMode ?? BASE_SIMULATION_CATEGORY,
        stake: options.stake,
        totalWin,
        payoutMultiplier: options.stake > 0 ? totalWin / options.stake : 0,
        screen: lastStep.screen.map((reel) => [...reel]),
        steps,
        wins,
        ...(featureEvents.length > 0 ? {featureEvents} : {}),
        ...(options.debug !== undefined ? {debug: {...options.debug}} : {}),
    };
}
