export interface ReelStripDefinition {
    getLength(): number;
    getSymbolAt(position: number): string;
    toArray(): string[];
    getSymbolCounts(): Record<string, number>;
}
