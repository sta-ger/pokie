import type {StakeEngineOutcomeRecord} from "./StakeEngineOutcomeRecord.js";

// One mode's worth of normalized Stake Engine outcomes -- "cost" comes straight from that mode's own index.json
// entry (the one place it's ever recorded in a manifest-less directory), never from a pokie-manifest.json.
export type StakeEngineStandaloneMode = {
    readonly modeName: string;
    readonly cost: number;
    readonly outcomes: readonly StakeEngineOutcomeRecord[];
};
