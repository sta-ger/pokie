import type {GameBlueprint} from "pokie";

// The blank counterpart to createStarterGameBlueprint.ts: the smallest GameBlueprint that still passes
// GameBlueprintValidator with zero errors or warnings (see createBlankGameBlueprint.test.ts) -- a bare
// canvas ("pokie create --blank") for someone who wants to author every field themselves, rather than
// starter's fuller worked example ("pokie create"/"pokie create <name>") with paylines/symbolWeights/
// availableBets already filled in. reels/rows are kept at 3x3 (the smallest a video slot's own
// maxMatchCount math still allows a 3-of-a-kind payout for) so the single paytable entry per symbol
// below stays valid without inventing extra match-count tiers just to fill out the template.
export function createBlankGameBlueprint(): GameBlueprint {
    return {
        manifest: {
            id: "blank-slot",
            name: "Blank Slot",
            version: "0.1.0",
        },
        reels: 3,
        rows: 3,
        symbols: ["A", "B", "C"],
        paytable: {
            A: {"3": 5},
            B: {"3": 3},
            C: {"3": 1},
        },
    };
}
