import {LinesDefinitionsDescribing} from "pokie";

export class WaysDefinitions implements LinesDefinitionsDescribing {
    private readonly definitions: number[][] = [];

    constructor(reelsNumber: number, reelsSymbolsNumber: number) {
        function generateLineDefinitions(dimensions, currentLine, linesDefinitions) {
            if (currentLine.length === dimensions.length) {
                linesDefinitions.push(currentLine);
                return;
            }
            const currentDimension = dimensions[currentLine.length];
            for (let i = 0; i <= currentDimension; i++) {
                generateLineDefinitions(dimensions, [...currentLine, i], linesDefinitions);
            }
        }

        const dimensions = new Array(reelsNumber).fill(reelsSymbolsNumber - 1);
        generateLineDefinitions(dimensions, [], this.definitions);
    }

    public getLineDefinition(lineId: string): number[] {
        return this.definitions[lineId];
    }

    public getLinesIds(): string[] {
        return Object.keys(this.definitions);
    }
}
