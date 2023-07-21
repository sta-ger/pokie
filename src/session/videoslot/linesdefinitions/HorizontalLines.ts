import {LinesDefinitionsDescribing} from "pokie";

export class HorizontalLines implements LinesDefinitionsDescribing {
    private readonly definitions: Record<string, number[]> = {};

    constructor(reelsNumber: number, reelsSymbolsNumber: number) {
        for (let y = 0; y < reelsSymbolsNumber; y++) {
            this.definitions[y] = [];
            for (let x = 0; x < reelsNumber; x++) {
                this.definitions[y][x] = y;
            }
        }
        if (reelsSymbolsNumber === 3) {
            const bk = [...this.definitions[0]];
            this.definitions[0] = [...this.definitions[1]];
            this.definitions[1] = bk;
        }
    }

    public getLineDefinition(lineId: string): number[] {
        return this.definitions[lineId];
    }

    public getLinesIds(): string[] {
        return Object.keys(this.definitions);
    }
}
