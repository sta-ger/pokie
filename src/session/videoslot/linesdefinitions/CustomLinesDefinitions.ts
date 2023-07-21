import {LinesDefinitionsDescribing} from "pokie";

export class CustomLinesDefinitions implements LinesDefinitionsDescribing {
    private linesDefinitionsMap: Record<string, number[]> = {};

    public getLineDefinition(lineId: string): number[] {
        return this.linesDefinitionsMap[lineId] || [];
    }

    public getLinesIds(): string[] {
        return Object.keys(this.linesDefinitionsMap);
    }

    public setLineDefinition(lineId: string, definition: number[]): this {
        this.linesDefinitionsMap[lineId] = definition;
        return this;
    }

    public fromMap(map: Record<string, number[]>): this {
        this.linesDefinitionsMap = JSON.parse(JSON.stringify(map));
        return this;
    }

    public toMap(): Record<string, number[]> {
        return JSON.parse(JSON.stringify(this.linesDefinitionsMap));
    }
}
