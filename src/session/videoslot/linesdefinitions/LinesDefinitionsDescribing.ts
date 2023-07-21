export interface LinesDefinitionsDescribing {
    getLineDefinition(lineId: string): number[];

    getLinesIds(): string[];
}
