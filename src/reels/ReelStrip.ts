import type {ReelStripDefinition} from "./ReelStripDefinition.js";

// Immutable canonical symbol sequence produced by reel-strip generation/analysis — a design-time
// artifact, not a runtime spin primitive. See SymbolsSequence (session/videoslot/combinations) for
// the mutable, spin-facing reel strip that a VideoSlotConfig actually plays against.
export class ReelStrip implements ReelStripDefinition {
    private readonly symbols: readonly string[];

    constructor(symbols: string[]) {
        if (symbols.length === 0) {
            throw new Error("ReelStrip cannot be empty — a reel strip must contain at least one symbol.");
        }
        this.symbols = [...symbols];
    }

    public getLength(): number {
        return this.symbols.length;
    }

    public getSymbolAt(position: number): string {
        const length = this.symbols.length;
        const index = ((position % length) + length) % length;
        return this.symbols[index];
    }

    public toArray(): string[] {
        return [...this.symbols];
    }

    public getSymbolCounts(): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const symbolId of this.symbols) {
            counts[symbolId] = (counts[symbolId] ?? 0) + 1;
        }
        return counts;
    }
}
