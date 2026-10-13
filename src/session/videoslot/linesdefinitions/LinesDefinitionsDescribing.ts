export interface LinesDefinitionsDescribing {
    /** Built-in default rows can be inactive on explicitly variable-height grids. */
    allowsInactiveVariableRows?(): boolean;

    getLineDefinition(lineId: string): number[];

    getLinesIds(): string[];
}
