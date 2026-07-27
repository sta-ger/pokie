import type {GameBlueprint} from "pokie";

// The canonical starter game this CLI offers in two places: the template "pokie build
// --init-blueprint <file>" writes out, and every default the interactive "pokie build" wizard offers
// (see GameBlueprintWizard, which reads its symbols/paytable/weights/bets straight off this rather
// than restating them — so pressing Enter through the whole wizard yields this same known-good game).
// Small enough to read and edit by hand in one sitting, but a complete example of every field a
// first "pokie build <file>" needs —
// paylines, paytable, and symbolWeights are all present with valid example values (not omitted to
// fall back on VideoSlotConfig's own defaults, unlike examples/blueprints/sample-slot.blueprint.json)
// so there's something concrete to edit for each one. Passes GameBlueprintValidator with zero errors
// or warnings as-is — see createStarterGameBlueprint.test.ts.
export function createStarterGameBlueprint(): GameBlueprint {
    return {
        manifest: {
            id: "starter-slot",
            name: "Starter Slot",
            version: "0.1.0",
        },
        reels: 5,
        rows: 3,
        symbols: ["A", "K", "Q", "J"],
        availableBets: [1, 2, 5],
        paylines: [
            [0, 0, 0, 0, 0],
            [1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2],
        ],
        paytable: {
            A: {"3": 5, "4": 10, "5": 20},
            K: {"3": 3, "4": 6, "5": 12},
            Q: {"3": 2, "4": 4, "5": 8},
            J: {"3": 1, "4": 2, "5": 4},
        },
        symbolWeights: {A: 4, K: 6, Q: 8, J: 10},
    };
}
