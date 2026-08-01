import type {OutcomeLibrarySelector} from "../outcomeLibrary/OutcomeLibrarySelector.js";

// One mode row of a POST /api/project/stakeengine/{validate,export} request body — "librarySelector" is
// the exact same OutcomeLibrarySelector the Deployment tab and the Outcome Libraries tab's own
// Select/Compare/Generate steps already use (a plain JSON file, one mode of a canonical outcome-library
// bundle, or one mode of a Stake Engine export), resolved and read server-side (see
// loadOutcomeLibraryFromSelector) rather than the client ever sending a whole WeightedOutcomeLibrary
// inline. Sharing the selector vocabulary (instead of a flat libraryPath-only shape) is what lets an
// export mode row discover and export straight from a bundle the Outcome Libraries registry already found
// compatible, not only a hand-typed flat JSON file. "cost" is the Stake "mode" cost StakeEngineExporter
// needs to convert each outcome's payoutMultiplier into Stake's own integer unit convention — never
// guessed or derived from the library itself.
export type StudioStakeEngineExportModeInput = {
    readonly modeName: string;
    readonly librarySelector: OutcomeLibrarySelector;
    readonly cost: number;
};
