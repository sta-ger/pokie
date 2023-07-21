import {LinesDefinitionsDescribing} from "pokie";

export class LinesDefinitionsFor5x3 implements LinesDefinitionsDescribing {
    private readonly definitions: Record<string, number[]> = {
        0: [1, 1, 1, 1, 1],
        1: [0, 0, 0, 0, 0],
        2: [2, 2, 2, 2, 2],
        3: [0, 1, 2, 1, 0],
        4: [2, 1, 0, 1, 2],
        5: [0, 0, 1, 0, 0],
        6: [2, 2, 1, 2, 2],
        7: [1, 1, 0, 1, 1],
        8: [1, 1, 2, 1, 1],
        9: [0, 1, 1, 1, 0],
        10: [2, 1, 1, 1, 2],
        11: [0, 1, 0, 1, 0],
        12: [2, 1, 2, 1, 2],
    };

    public getLineDefinition(lineId: string): number[] {
        return this.definitions[lineId];
    }

    public getLinesIds(): string[] {
        return Object.keys(this.definitions);
    }
}
