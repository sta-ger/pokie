import type {SymbolsSequenceDescribing} from "./SymbolsSequenceDescribing.js";
import type {WeightedSymbolsSequenceDescribing} from "./WeightedSymbolsSequenceDescribing.js";
import {SymbolsSequence} from "./SymbolsSequence.js";
import type {RandomNumberGenerating} from "./RandomNumberGenerating.js";
import type {WeightedSequenceVariant} from "./WeightedSequenceVariant.js";

/** Immutable definition. Selection and counters belong to a generator, never to this object. */
export class WeightedSymbolsSequence<T extends string | number | symbol = string> implements WeightedSymbolsSequenceDescribing<T> {
    private readonly variants: WeightedSequenceVariant<T>[];
    private readonly weights: bigint[];

    constructor(variants: readonly WeightedSequenceVariant<T>[], symbols?: readonly T[], path = "variants") {
        if (symbols !== undefined && !Array.isArray(symbols)) throw new Error(`${path}: known symbols must be an array.`);
        if (!Array.isArray(variants) || variants.length === 0) throw new Error(`${path}: expected a nonempty variant array.`);
        const ids = new Set<string>();
        const arrays: T[][] = [];
        let length: number | undefined;
        this.variants = Array.from(variants).map((variant, index) => {
            const field = `${path}[${index}]`;
            if (!variant || typeof variant !== "object" || typeof variant.id !== "string" || !variant.id.trim() || ids.has(variant.id)) throw new Error(`${field}.id: expected a unique nonempty case-sensitive ID.`);
            ids.add(variant.id);
            if (typeof variant.weight !== "number" || !Number.isFinite(variant.weight) || variant.weight < 0) throw new Error(`${field}.weight: expected a finite nonnegative relative weight.`);
            if (!Array.isArray(variant.symbols) || variant.symbols.length === 0 || Array.from(variant.symbols).some(symbol => !["string", "number", "symbol"].includes(typeof symbol) || (typeof symbol === "number" && !Number.isFinite(symbol)) || (symbols && !symbols.includes(symbol)))) throw new Error(`${field}.symbols: expected a nonempty array of known symbols.`);
            if (length !== undefined && length !== variant.symbols.length) throw new Error(`${field}.symbols: weighted variants of one reel must have equal lengths.`);
            length = variant.symbols.length;
            if (arrays.some(array => array.length === variant.symbols.length && array.every((symbol, i) => symbol === variant.symbols[i]))) throw new Error(`${field}.symbols: duplicate ordered sequence.`);
            arrays.push([...variant.symbols]);
            return Object.freeze({id: variant.id, weight: variant.weight, symbols: Object.freeze([...variant.symbols])});
        });
        if (!this.variants.some(variant => variant.weight > 0)) throw new Error(`${path}: total weight must be positive.`);
        this.weights = integerRelativeWeights(this.variants.map(variant => variant.weight));
    }

    public getSequenceKind(): "weighted-whole-sequence-v1" {
        return "weighted-whole-sequence-v1";
    }
    public getVariants(): WeightedSequenceVariant<T>[] {
        return this.variants.map(variant => ({...variant, symbols: [...variant.symbols]}));
    }
    public getIntegerWeights(): bigint[] {
        return [...this.weights];
    }
    public getProbabilities(): number[] {
        const max = this.variants.reduce((maximum, variant) => Math.max(maximum, variant.weight), 0);
        const scaled = this.variants.map(variant => variant.weight / max);
        const total = scaled.reduce((sum, weight) => sum + weight, 0);
        return scaled.map(weight => weight / total);
    }
    public select(rng: RandomNumberGenerating): WeightedSequenceVariant<T> {
        let draw = drawBelow(this.weights.reduce((sum, weight) => sum + weight, BigInt(0)), rng);
        for (let i = 0; i < this.weights.length; i++) {
            if (draw < this.weights[i]) return this.getVariants()[i];
            draw -= this.weights[i];
        }
        throw new Error("Invalid variant draw.");
    }
    public resolve(id: string): SymbolsSequence<T> {
        const variant = this.variants.find(item => item.id === id && item.weight > 0);
        if (!variant) throw new Error(`Unknown or zero-weight variant ID: ${id}`);
        return new SymbolsSequence<T>().fromArray([...variant.symbols]);
    }
    public getSize(): number {
        return this.variants[0].symbols.length;
    }
    public getIndex(index: number): number {
        return ((index % this.getSize()) + this.getSize()) % this.getSize();
    }
    public getNumberOfSymbols(symbol: T): number {
        return this.variants.reduce((sum, variant, i) => sum + variant.symbols.filter(value => value === symbol).length * this.getProbabilities()[i], 0);
    }
    public getSymbolWeight(symbol: T): number {
        return this.getNumberOfSymbols(symbol) / this.getSize() * 100;
    }
    public getSymbolsWeights(): Record<T, number> {
        const result = Object.create(null) as Record<T, number>;
        for (const variant of this.variants) for (const symbol of variant.symbols) result[symbol] = this.getSymbolWeight(symbol);
        return result;
    }
    public getSymbol(_index: number): T {
        throw new Error("Weighted reel requires an explicit contextual selection.");
    }
    public getSymbols(_index: number, _count: number): T[] {
        throw new Error("Weighted reel requires an explicit contextual selection.");
    }
    public toArray(): T[] {
        throw new Error("Weighted reel has multiple complete arrays; use getVariants().");
    }
    public getSymbolsIndexes(_symbols: T[]): number[] {
        throw new Error("Weighted reel requires an explicit contextual selection.");
    }
    public getSymbolsStacksIndexes(): {index: number; size: number}[] {
        throw new Error("Weighted reel requires an explicit contextual selection.");
    }
}

/** Exact binary64 ratios, reduced by GCD. No integer replication or fractional truncation. */
export function integerRelativeWeights(weights: readonly number[]): bigint[] {
    if (!Array.isArray(weights) || !weights.length || Array.from(weights).some(weight => typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) || !weights.some(weight => weight > 0)) throw new Error("Relative weights must be finite, nonnegative and have a positive total.");
    const buffer = new ArrayBuffer(8),
        view = new DataView(buffer);
    const parts = weights.map(weight => {
        view.setFloat64(0, weight);
        const bits = view.getBigUint64(0);
        const exponent = Number((bits >> BigInt(52)) & BigInt(2047));
        return {mantissa: (bits & ((BigInt(1) << BigInt(52)) - BigInt(1))) + (exponent ? BigInt(1) << BigInt(52) : BigInt(0)), exponent: exponent ? exponent - 1075 : -1074};
    });
    const min = parts.reduce((minimum, part) => part.mantissa > BigInt(0) ? Math.min(minimum, part.exponent) : minimum, Infinity);
    const integers = parts.map(part => part.mantissa === BigInt(0) ? BigInt(0) : part.mantissa << BigInt(part.exponent - min));
    const gcd = (a: bigint, b: bigint): bigint => {
        while (b) [a, b] = [b, a % b];
        return a;
    };
    const divisor = integers.reduce(gcd, BigInt(0));
    return integers.map(value => value / divisor);
}

/** Small totals take one integer draw; larger totals use high-first 32-bit chunks and rejection. */
export function drawBelow(total: bigint, rng: RandomNumberGenerating): bigint {
    if (typeof total !== "bigint" || total <= BigInt(0)) throw new Error("Weighted draw total must be positive.");
    if (total <= BigInt(0x100000000)) return BigInt(rng.getRandomInt(0, Number(total)));
    const bits = (total - BigInt(1)).toString(2).length;
    for (;;) {
        let value = BigInt(0);
        for (let remaining = bits; remaining > 0; remaining -= 32) {
            const count = Math.min(32, remaining);
            value = (value << BigInt(count)) + BigInt(rng.getRandomInt(0, 2 ** count));
        }
        if (value < total) return value;
    }
}

/** Capability identity survives the package's ESM/CommonJS module boundary. */
export function isWeightedSymbolsSequence<T extends string | number | symbol>(sequence: SymbolsSequenceDescribing<T>): sequence is WeightedSymbolsSequence<T> {
    return sequence !== null && typeof sequence === "object" && (sequence as Partial<WeightedSymbolsSequence<T>>).getSequenceKind?.() === "weighted-whole-sequence-v1";
}

/** Validate the entire mixed model before its first selection/stop draw. */
export function validateWeightedReelDefinitions<T extends string | number | symbol>(sequences: SymbolsSequenceDescribing<T>[], reels: number, symbols: readonly T[], rows?: number): void {
    if (!Array.isArray(sequences)) throw new Error("reelSequences: expected a reel definition array.");
    if (!sequences.some(isWeightedSymbolsSequence)) return;
    if (!Number.isSafeInteger(reels) || reels <= 0 || sequences.length !== reels) throw new Error("reelSequences: expected one definition per reel.");
    if (rows !== undefined && (!Number.isSafeInteger(rows) || rows <= 0)) throw new Error("reelSequences: generated rows must be a positive integer.");
    Array.from(sequences).forEach((sequence, index) => {
        if (!sequence || typeof sequence.getSize !== "function") throw new Error(`reelSequences[${index}]: invalid sequence definition.`);
        if (isWeightedSymbolsSequence(sequence)) new WeightedSymbolsSequence(sequence.getVariants(), symbols, `reelSequences[${index}].variants`).getSize();
        else {
            const strip = sequence.toArray();
            if (!Array.isArray(strip) || !strip.length || sequence.getSize() !== strip.length || Array.from(strip).some(symbol => !["string", "number", "symbol"].includes(typeof symbol) || (typeof symbol === "number" && !Number.isFinite(symbol)) || !symbols.includes(symbol))) throw new Error(`reelSequences[${index}].symbols: invalid exact symbols.`);
        }
    });
}
