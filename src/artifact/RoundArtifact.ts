import type {JsonObject} from "../json/JsonValue.js";
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
// Deeply readonly, and deeply frozen at build time (see buildRoundArtifact): every nested array/object here —
// screen, steps, wins, positions, multiplier breakdowns, feature events, provenance, metadata/debug — is a copy
// isolated from whatever the caller originally passed in, and mutating it afterward throws (this is a plain JS
// object under strict mode, so Object.freeze is enforced at runtime, not just at the type level).
//
// "betMode" is a plain, open string rather than a closed union: the two conventional values are
// BASE_SIMULATION_CATEGORY/FREE_GAMES_SIMULATION_CATEGORY (see simulation/SimulationCategoryNames.ts, reused here
// rather than duplicated), but a third-party game may define its own. It is always a value the caller supplies
// explicitly — never inferred from incidental session state (e.g. balance) — see determineStakeAmount's own
// doc comment for why that inference is unsafe in general.
export type RoundArtifact<T extends string | number = string> = {
    readonly schemaVersion: number;
    readonly roundId: string;
    readonly provenance: RoundArtifactProvenance;
    readonly betMode: string;
    readonly stake: number;
    readonly totalWin: number;
    readonly payoutMultiplier: number;
    readonly screen: readonly (readonly T[])[];
    readonly steps: readonly RoundStepArtifact<T>[];
    readonly wins: readonly RoundArtifactWin<T>[];
    readonly featureEvents?: readonly RoundArtifactFeatureEvent[];
    readonly debug?: JsonObject;
};
