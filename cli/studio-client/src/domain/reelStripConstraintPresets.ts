// Generic ReelStripConstraintSpec templates for the Reel Strip Modeler's own "Add preset" affordance
// (see ConstraintsEditor in ReelStripGenerationEditor.tsx). Each preset produces a plain, valid
// ReelStripConstraintSpec object (see src/generated/ReelStripConstraintSpec.ts) -- there is no separate
// preset vocabulary: what a preset inserts here is exactly what "pokie reel generate"/"pokie build"
// already understand as a constraints[] entry, so applying one is indistinguishable from hand-typing the
// same object into the constraints JSON. Deliberately restricted to the constraint types that make sense
// without picking specific symbol ids up front (no `pairs`/`sequence` presets) -- every one of these
// applies across every symbol on the reel until narrowed with `symbolIds` by hand.

export type ReelStripConstraintPreset = {
    id: string;
    label: string;
    description: string;
    build: () => Record<string, unknown>;
};

export const REEL_STRIP_CONSTRAINT_PRESETS: ReelStripConstraintPreset[] = [
    {
        id: "no-adjacent-repeats",
        label: "No adjacent repeats",
        description: "No symbol may occupy two consecutive positions.",
        build: () => ({type: "maximumConsecutiveOccurrences", maximumConsecutive: 1}),
    },
    {
        id: "limit-runs-to-3",
        label: "Limit runs to 3",
        description: "No symbol may repeat more than 3 times in a row.",
        build: () => ({type: "maximumConsecutiveOccurrences", maximumConsecutive: 3}),
    },
    {
        id: "space-out-repeats",
        label: "Space out repeats (min 3 apart)",
        description: "Every symbol's occurrences are spaced at least 3 positions apart, wrap-aware.",
        build: () => ({type: "minimumCircularDistance", minimumDistance: 3}),
    },
];
