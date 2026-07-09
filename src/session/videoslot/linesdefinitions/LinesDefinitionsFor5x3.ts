import type {LinesDefinitionsDescribing} from "./LinesDefinitionsDescribing.js";

export class LinesDefinitionsFor5x3 implements LinesDefinitionsDescribing {
    private readonly definitions: Record<string, number[]> = {
        // flat
        0: [1, 1, 1, 1, 1],
        1: [0, 0, 0, 0, 0],
        2: [2, 2, 2, 2, 2],
        // full-height V / inverted V
        3: [0, 1, 2, 1, 0],
        4: [2, 1, 0, 1, 2],
        // M / W arch (touches the outer rows at both ends)
        5: [1, 0, 0, 0, 1],
        6: [1, 2, 2, 2, 1],
        // staircase
        7: [0, 0, 1, 2, 2],
        8: [2, 2, 1, 0, 0],
        // shallow U / dome
        9: [0, 1, 1, 1, 0],
        10: [2, 1, 1, 1, 2],
        // shallow notch (dips towards one row only in the middle reel)
        11: [1, 1, 0, 1, 1],
        12: [1, 1, 2, 1, 1],
        // full-height zigzag
        13: [0, 2, 0, 2, 0],
        14: [2, 0, 2, 0, 2],
        // notch up then down / down then up
        15: [1, 0, 1, 2, 1],
        16: [1, 2, 1, 0, 1],
        // spike (only the middle reel leaves the outer row)
        17: [0, 0, 2, 0, 0],
        18: [2, 2, 0, 2, 2],
        // partial (two-row) zigzag
        19: [0, 1, 0, 1, 0],
        20: [2, 1, 2, 1, 2],
        // half-staircase (asymmetric — common once a game has 20+ lines)
        21: [0, 0, 0, 1, 2],
        22: [2, 2, 2, 1, 0],
        23: [2, 1, 0, 0, 0],
        24: [0, 1, 2, 2, 2],
    };

    public getLineDefinition(lineId: string): number[] {
        return this.definitions[lineId];
    }

    public getLinesIds(): string[] {
        return Object.keys(this.definitions);
    }
}
