import {LinesDefinitionsDescribing} from "pokie";

export class LinesDefinitionsFor5x4 implements LinesDefinitionsDescribing {
    private readonly definitions: Record<string, number[]> = {
        0: [0, 0, 0, 0, 0],
        1: [1, 1, 1, 1, 1],
        2: [2, 2, 2, 2, 2],
        3: [3, 3, 3, 3, 3],
        4: [0, 1, 2, 1, 0],
        5: [1, 2, 3, 2, 1],
        6: [3, 2, 1, 2, 3],
        7: [2, 1, 0, 1, 2],
        8: [0, 0, 1, 2, 2],
        9: [1, 1, 2, 3, 3],
        10: [3, 3, 2, 1, 1],
        11: [2, 2, 1, 0, 0],
    };

    public getLineDefinition(lineId: string): number[] {
        return this.definitions[lineId];
    }

    public getLinesIds(): string[] {
        return Object.keys(this.definitions);
    }
}
