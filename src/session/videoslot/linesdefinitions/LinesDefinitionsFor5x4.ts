import {LinesDefinitionsDescribing} from "pokie";

export class LinesDefinitionsFor5x4 implements LinesDefinitionsDescribing {
    private readonly definitions: Record<string, number[]> = {
        // flat
        0: [0, 0, 0, 0, 0],
        1: [1, 1, 1, 1, 1],
        2: [2, 2, 2, 2, 2],
        3: [3, 3, 3, 3, 3],
        // shallow V (a V spanning all 4 rows can't fit in 5 reels — 2 steps each
        // side of center only reaches 2 rows away — so these cover 3 of the 4 rows)
        4: [0, 1, 2, 1, 0],
        5: [1, 2, 3, 2, 1],
        6: [3, 2, 1, 2, 3],
        7: [2, 1, 0, 1, 2],
        // half-grid staircase (3 of the 4 rows)
        8: [0, 0, 1, 2, 2],
        9: [1, 1, 2, 3, 3],
        10: [3, 3, 2, 1, 1],
        11: [2, 2, 1, 0, 0],
        // full-grid staircase (spans all 4 rows — unlike a V, a monotonic ramp does fit in 5 reels)
        12: [0, 0, 1, 2, 3],
        13: [0, 1, 2, 3, 3],
        14: [3, 3, 2, 1, 0],
        15: [3, 2, 1, 0, 0],
    };

    public getLineDefinition(lineId: string): number[] {
        return this.definitions[lineId];
    }

    public getLinesIds(): string[] {
        return Object.keys(this.definitions);
    }
}
