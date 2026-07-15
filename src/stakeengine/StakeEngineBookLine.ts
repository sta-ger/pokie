import type {StakeEngineEvent} from "./StakeEngineEvent.js";

// One line of a Stake Engine "books" JSONL file — one per WeightedOutcome. "id" is the outcome's own id,
// parsed to the integer Stake requires (see internal/parseStakeEngineOutcomeId.ts); "payoutMultiplier" must
// exactly match the same outcome's row in the mode's lookup CSV (enforced by StakeEngineExporter's own
// self-check before anything is written).
export type StakeEngineBookLine = {
    readonly id: number;
    readonly events: readonly StakeEngineEvent[];
    readonly payoutMultiplier: number;
};
