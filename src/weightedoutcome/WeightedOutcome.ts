import type {RoundRecord} from "../artifact/RoundRecord.js";

// One entry of a WeightedOutcomeLibrary: a canonical RoundRecord together with the probability weight it
// carries within the library (not a probability itself — weights are relative to the library's own total, see
// WeightedOutcomeLibraryAnalyzer) and a stable id. "id" is always caller-supplied (mirrors RoundRecord.roundId
// — never auto-generated), so a library rebuilt from the same source math data reproduces the exact same ids,
// and therefore the exact same library hash (see computeWeightedOutcomeLibraryHash) — a randomly-generated id
// would defeat that.
//
// Deeply readonly and deeply frozen at build time (see buildWeightedOutcomeLibrary): "artifact" is not
// separately deep-copied here since a RoundRecord is already immutable by its own construction (built via
// buildRoundRecord), so referencing it directly carries no isolation risk — buildWeightedOutcomeLibrary's own
// deepFreeze pass still recursively freezes it as a matter of course either way.
export type WeightedOutcome<T extends string | number = string> = {
    readonly id: string;
    readonly weight: number;
    readonly artifact: RoundRecord<T>;
};
