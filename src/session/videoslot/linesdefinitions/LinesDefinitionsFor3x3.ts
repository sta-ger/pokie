import {LinesDefinitionsDescribing} from "pokie";

export class LinesDefinitionsFor3x3 implements LinesDefinitionsDescribing {
    private readonly definitions: Record<string, number[]> = {
        0: [1, 1, 1],
        1: [0, 0, 0],
        2: [2, 2, 2],
        3: [0, 1, 2],
        4: [2, 1, 0],
        5: [0, 1, 0],
        6: [2, 1, 2],
        7: [1, 0, 1],
        8: [1, 2, 1],
        9: [0, 2, 0],
        10: [2, 0, 2],
    };

    public getLineDefinition(lineId: string): number[] {
        return this.definitions[lineId];
    }

    public getLinesIds(): string[] {
        return Object.keys(this.definitions);
    }
}
