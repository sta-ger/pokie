import type {RoundArtifactFeatureEvent} from "./RoundArtifactFeatureEvent.js";
import type {RoundArtifactProvenance} from "./RoundArtifactProvenance.js";
import type {RoundArtifactWin} from "./RoundArtifactWin.js";
import type {RoundStepArtifact} from "./RoundStepArtifact.js";

// Tracks this type's own shape (not the pokie package version) — bump when RoundArtifact's fields change,
// same convention as GAME_BLUEPRINT_SCHEMA_VERSION.
export const ROUND_ARTIFACT_SCHEMA_VERSION = 1;

// The canonical, hashable, storage/audit-grade record of one completed round — independent of any client
// transport shape (see net/'s NetworkData types) or replay concern (see ReplayDescriptor). Built directly from
// already-computed runtime state (see buildRoundArtifact/buildRoundArtifactFromSession), never from a second
// win-calculation path.
//
// "betMode" is a plain, open string rather than a closed union: the two conventional values are
// BASE_SIMULATION_CATEGORY/FREE_GAMES_SIMULATION_CATEGORY (see simulation/SimulationCategoryNames.ts, reused here
// rather than duplicated), but a third-party game may define its own. It is always a value the caller supplies
// explicitly — never inferred from incidental session state (e.g. balance) — see determineStakeAmount's own
// doc comment for why that inference is unsafe in general.
export type RoundArtifact<T extends string | number | symbol = string> = {
    schemaVersion: number;
    roundId: string;
    provenance: RoundArtifactProvenance;
    betMode: string;
    stake: number;
    totalWin: number;
    payoutMultiplier: number;
    screen: T[][];
    steps: RoundStepArtifact<T>[];
    wins: RoundArtifactWin<T>[];
    featureEvents?: RoundArtifactFeatureEvent[];
    debug?: Record<string, unknown>;
};
