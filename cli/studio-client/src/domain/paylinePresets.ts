// Standard payline layouts for the Blueprint Editor's "Apply preset" flow (see PaylinesEditor.tsx).
// Every line shape here is copied verbatim, in order, from this repo's own domain contract --
// src/session/videoslot/linesdefinitions/LinesDefinitionsFor{3x3,5x3,5x4}.ts, the tables the engine
// itself uses for these exact grid sizes -- so applying a preset always produces paylines the runtime
// already recognizes. Deliberately conservative: only the three grid sizes the engine ships a table for
// get presets; there is no "adapted" preset for other reel/row counts because the domain contract
// doesn't define one (see describePaylinePresetCompatibility).

export type PaylinePreset = {
    id: string;
    label: string;
    reels: number;
    rows: number;
    lines: number[][];
};

// Order matches LinesDefinitionsFor3x3.ts's own id order (0..10) exactly.
const THREE_BY_THREE_LINES: number[][] = [
    [1, 1, 1],
    [0, 0, 0],
    [2, 2, 2],
    [0, 1, 2],
    [2, 1, 0],
    [0, 1, 0],
    [2, 1, 2],
    [1, 0, 1],
    [1, 2, 1],
    [0, 2, 0],
    [2, 0, 2],
];

// Order matches LinesDefinitionsFor5x3.ts's own id order (0..24) exactly.
const FIVE_BY_THREE_LINES: number[][] = [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [1, 0, 0, 0, 1],
    [1, 2, 2, 2, 1],
    [0, 0, 1, 2, 2],
    [2, 2, 1, 0, 0],
    [0, 1, 1, 1, 0],
    [2, 1, 1, 1, 2],
    [1, 1, 0, 1, 1],
    [1, 1, 2, 1, 1],
    [0, 2, 0, 2, 0],
    [2, 0, 2, 0, 2],
    [1, 0, 1, 2, 1],
    [1, 2, 1, 0, 1],
    [0, 0, 2, 0, 0],
    [2, 2, 0, 2, 2],
    [0, 1, 0, 1, 0],
    [2, 1, 2, 1, 2],
    [0, 0, 0, 1, 2],
    [2, 2, 2, 1, 0],
    [2, 1, 0, 0, 0],
    [0, 1, 2, 2, 2],
];

// Order matches LinesDefinitionsFor5x4.ts's own id order (0..15) exactly.
const FIVE_BY_FOUR_LINES: number[][] = [
    [0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
    [2, 2, 2, 2, 2],
    [3, 3, 3, 3, 3],
    [0, 1, 2, 1, 0],
    [1, 2, 3, 2, 1],
    [3, 2, 1, 2, 3],
    [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2],
    [1, 1, 2, 3, 3],
    [3, 3, 2, 1, 1],
    [2, 2, 1, 0, 0],
    [0, 0, 1, 2, 3],
    [0, 1, 2, 3, 3],
    [3, 3, 2, 1, 0],
    [3, 2, 1, 0, 0],
];

export const PAYLINE_PRESETS: PaylinePreset[] = [
    {id: "5x3-center", label: "Center (1 line)", reels: 5, rows: 3, lines: FIVE_BY_THREE_LINES.slice(0, 1)},
    {id: "5x3-horizontals", label: "3 horizontals", reels: 5, rows: 3, lines: FIVE_BY_THREE_LINES.slice(0, 3)},
    {id: "5x3-classic-5", label: "Classic 5", reels: 5, rows: 3, lines: FIVE_BY_THREE_LINES.slice(0, 5)},
    {id: "5x3-classic-9", label: "Classic 9", reels: 5, rows: 3, lines: FIVE_BY_THREE_LINES.slice(0, 9)},
    {id: "5x3-classic-10", label: "Classic 10", reels: 5, rows: 3, lines: FIVE_BY_THREE_LINES.slice(0, 10)},
    {id: "5x3-classic-20", label: "Classic 20", reels: 5, rows: 3, lines: FIVE_BY_THREE_LINES.slice(0, 20)},

    {id: "3x3-center", label: "Center (1 line)", reels: 3, rows: 3, lines: THREE_BY_THREE_LINES.slice(0, 1)},
    {id: "3x3-horizontals", label: "3 horizontals", reels: 3, rows: 3, lines: THREE_BY_THREE_LINES.slice(0, 3)},
    {id: "3x3-classic-5", label: "Classic 5", reels: 3, rows: 3, lines: THREE_BY_THREE_LINES.slice(0, 5)},
    {id: "3x3-classic-11", label: "Classic 11 (all)", reels: 3, rows: 3, lines: THREE_BY_THREE_LINES.slice(0, 11)},

    {id: "5x4-horizontals", label: "4 horizontals", reels: 5, rows: 4, lines: FIVE_BY_FOUR_LINES.slice(0, 4)},
    {id: "5x4-classic-8", label: "Classic 8", reels: 5, rows: 4, lines: FIVE_BY_FOUR_LINES.slice(0, 8)},
    {id: "5x4-classic-16", label: "Classic 16 (all)", reels: 5, rows: 4, lines: FIVE_BY_FOUR_LINES.slice(0, 16)},
];

export type PaylinePresetShapeGroup = {reels: number; rows: number; presets: PaylinePreset[]};

// Groups presets by grid shape, in first-seen order, for the Apply preset modal -- keeps every 5x3
// preset (say) under one "5 reels × 3 rows" heading instead of a flat list where e.g. two different
// shapes' "Center (1 line)" presets would otherwise read as duplicates.
export function groupPaylinePresetsByShape(presets: PaylinePreset[]): PaylinePresetShapeGroup[] {
    const groups: PaylinePresetShapeGroup[] = [];
    presets.forEach((preset) => {
        const existing = groups.find((group) => group.reels === preset.reels && group.rows === preset.rows);
        if (existing) {
            existing.presets.push(preset);
        } else {
            groups.push({reels: preset.reels, rows: preset.rows, presets: [preset]});
        }
    });
    return groups;
}

export type PaylineSetCompatibility = {compatible: boolean; reason?: string};

// Shared by both built-in presets and saved custom sets (see customPaylineSets.ts) -- a payline set only
// ever applies as-is (never reshaped/truncated/padded) because a row index means "this physical row",
// so silently remapping it to fit a different grid would change which cells actually pay.
export function describePaylineSetCompatibility(lines: number[][], reels: number, rows: number): PaylineSetCompatibility {
    const wrongReelCount = lines.some((line) => line.length !== reels);
    if (wrongReelCount) {
        return {compatible: false, reason: `Requires ${lines[0]?.length ?? 0} reels (current layout has ${reels}).`};
    }
    const maxRow = Math.max(-1, ...lines.flat());
    if (maxRow >= rows) {
        return {compatible: false, reason: `Requires at least ${maxRow + 1} rows (current layout has ${rows}).`};
    }
    return {compatible: true};
}

// One count per (row, reel) cell -- how many of the set's lines pass through it -- for the mini preview
// grid. Callers render `rows` rows of `reels` columns from this matrix.
export function computePaylineSetPreviewCounts(lines: number[][], reels: number, rows: number): number[][] {
    const grid = new Array(rows).fill(null).map(() => new Array(reels).fill(0));
    lines.forEach((line) => {
        line.forEach((row, reelIndex) => {
            if (row >= 0 && row < rows && reelIndex < reels && grid[row]) {
                grid[row][reelIndex] += 1;
            }
        });
    });
    return grid;
}
