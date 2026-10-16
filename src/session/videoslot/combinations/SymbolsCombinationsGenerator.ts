import {PortableRandomNumberGenerator} from "./internal/PortableRandomNumberGenerator.js";
import {selectWeightedBonus, type WeightedBonus} from "../authored/WeightedBonus.js";
import {isWeightedSymbolsSequence, validateWeightedReelDefinitions} from "./WeightedSymbolsSequence.js";
import type {ReelSequenceSelection, ReelSequenceStatistics, WeightedSequenceVariant} from "./WeightedSequenceVariant.js";
import type {ScreenGeometry} from "../coordinates/ScreenGeometry.js";
import {resolveScreenProjection} from "../coordinates/projectSymbolsCombination.js";
import {SeededRandomNumberGenerator} from "./SeededRandomNumberGenerator.js";
import {PseudorandomNumberGenerator} from "./PseudorandomNumberGenerator.js";
import type {RandomNumberGenerating} from "./RandomNumberGenerating.js";
import {SymbolsCombination} from "./SymbolsCombination.js";
import type {SymbolsCombinationDescribing} from "./SymbolsCombinationDescribing.js";
import type {SymbolsCombinationsGenerating} from "./SymbolsCombinationsGenerating.js";
import type {VideoSlotConfigDescribing} from "../VideoSlotConfigDescribing.js";

export class SymbolsCombinationsGenerator<T extends string | number | symbol = string>
implements SymbolsCombinationsGenerating<T> {
    private readonly rng: RandomNumberGenerating;
    private readonly config: VideoSlotConfigDescribing<T>;
    private readonly weightedDefinitions?: {symbols?: T[]; variants?: WeightedSequenceVariant<T>[]}[];
    private lastStopPositions: number[] = [];
    private context = "initialization";
    private contextRequested = false;
    private implicitGeneration = 0;
    private selections: ReelSequenceSelection[] = [];
    private counts: Record<string, number>[] = [];

    constructor(config: VideoSlotConfigDescribing<T>, rng: RandomNumberGenerating = new PseudorandomNumberGenerator()) {
        this.config = config;
        this.rng = rng;
        const definitions = config.getSymbolsSequences();
        this.weightedDefinitions = definitions.some(isWeightedSymbolsSequence)
            ? definitions.map(sequence => isWeightedSymbolsSequence(sequence) ? {variants: sequence.getVariants()} : {symbols: sequence.toArray()}) : undefined;
        this.counts = config.getSymbolsSequences().map(() => Object.create(null) as Record<string, number>);
    }


    public setSelectionContext(context: string): void {
        if (typeof context !== "string" || !(/^(initialization|implicit:[1-9][0-9]*|logical:[\s\S]+)$/).test(context) || context.includes("\0")) throw new Error("Invalid whole-sequence selection context.");
        this.assertWeightedDefinitionsUnchanged();
        if (context.startsWith("implicit:")) {
            const generation = Number(context.slice("implicit:".length));
            if (!Number.isSafeInteger(generation)) throw new Error("Invalid implicit generation context.");
            this.implicitGeneration = Math.max(this.implicitGeneration, generation);
        }
        this.contextRequested = true;
        if (context !== this.context) {
            this.context = context;
            this.selections = [];
        }
    }

    public getSequenceSelections(): ReelSequenceSelection[] {
        return this.selections.map(value => ({...value}));
    }

    public getSequenceStatistics(): ReelSequenceStatistics[] {
        this.assertWeightedDefinitionsUnchanged();
        return this.config.getSymbolsSequences().flatMap((sequence, reelIndex) => {
            if (!(isWeightedSymbolsSequence(sequence))) return [];
            const variants = sequence.getVariants(),
                probabilities = sequence.getProbabilities(),
                weights = sequence.getIntegerWeights();
            const denominator = weights.reduce((sum, weight) => sum + weight, BigInt(0)).toString();
            const selections = Object.values(this.counts[reelIndex] ?? {}).reduce((sum, count) => sum + count, 0);
            return [{reelIndex, context: "logical-round" as const, model: JSON.stringify({context: "logical-round-v1", sampling: "binary64-integer-ratios-v1", rows: this.config.getReelsSymbolsNumber(), geometry: this.config.getScreenGeometry?.(), reels: this.config.getSymbolsSequences().map(strip => isWeightedSymbolsSequence(strip) ? strip.getVariants() : strip.toArray())}), selections,
                variants: variants.map((variant, index) => {
                    const count = this.counts[reelIndex]?.[variant.id] ?? 0;
                    return {id: variant.id, weight: variant.weight, probability: probabilities[index], probabilityRatio: {numerator: weights[index].toString(), denominator}, count, frequency: selections ? count / selections : 0, uncovered: variant.weight > 0 && count === 0};
                })}];
        });
    }

    public getSelectionState(): {context: string; contextRequested: boolean; implicitGeneration: number; selections: ReelSequenceSelection[]; counts: Record<string, number>[]} {
        this.assertWeightedDefinitionsUnchanged();
        return {context: this.context, contextRequested: this.contextRequested, implicitGeneration: this.implicitGeneration, selections: this.getSequenceSelections(), counts: this.counts.map(counts => ({...counts}))};
    }

    public validateSelectionState(value: unknown): void {
        this.assertWeightedDefinitionsUnchanged();
        const state = value as ReturnType<SymbolsCombinationsGenerator<T>["getSelectionState"]>;
        if (!state || typeof state.context !== "string" || !(/^(initialization|implicit:[1-9][0-9]*|logical:[\s\S]+)$/).test(state.context) || state.context.includes("\0") || !Array.isArray(state.selections) || !Array.isArray(state.counts) || state.counts.length > this.config.getReelsNumber()) throw new Error("Invalid weighted selection context/state.");
        if (typeof state.contextRequested !== "boolean") throw new Error("Invalid pending selection context.");
        if (!Number.isSafeInteger(state.implicitGeneration) || state.implicitGeneration < 0) throw new Error("Invalid implicit generation counter.");
        if (state.context.startsWith("implicit:") && (!Number.isSafeInteger(Number(state.context.slice(9))) || Number(state.context.slice(9)) > state.implicitGeneration)) throw new Error("Unreserved implicit generation context.");
        const seen = new Set<number>();
        let priorReel = -1;
        for (const selection of state.selections) {
            const sequence = this.config.getSymbolsSequences()[selection.reelIndex];
            if (!Number.isSafeInteger(selection.reelIndex) || selection.reelIndex <= priorReel || seen.has(selection.reelIndex) || selection.context !== state.context || !(isWeightedSymbolsSequence(sequence))) throw new Error("Invalid retained weighted selection.");
            sequence.resolve(selection.variantId);
            seen.add(selection.reelIndex);
            priorReel = selection.reelIndex;
        }
        Array.from(state.counts).forEach((counts, reelIndex) => {
            const sequence = this.config.getSymbolsSequences()[reelIndex];
            if (!counts || typeof counts !== "object" || Array.isArray(counts) || Object.entries(counts).some(([id, count]) => !(isWeightedSymbolsSequence(sequence)) || !sequence.getVariants().some(variant => variant.id === id && variant.weight > 0) || !Number.isSafeInteger(count) || count < 0)) throw new Error("Invalid weighted selection counters.");
        });
        if (state.selections.length && state.selections.length !== this.config.getSymbolsSequences().filter(sequence => isWeightedSymbolsSequence(sequence)).length) throw new Error("Incomplete retained weighted selections.");
    }

    /** Portable accepted mathematics supplies a tighter authority than delivery count.
     * Native/custom carried sessions without that authority retain their codec contract.
     */
    public validateAcceptedSelectionAccounting(mathematicalPlays: number, entryPosition: number, hasProgression: boolean): void {
        const statistics = this.getSequenceStatistics();
        if (!statistics.length) return;
        const invalid = () => new Error("Weighted reel counters contradict accepted execution accounting.");
        if (!Number.isSafeInteger(mathematicalPlays) || mathematicalPlays < 1 || !Number.isSafeInteger(entryPosition) || entryPosition < 1 || entryPosition > mathematicalPlays ||
            this.context === "initialization" || this.contextRequested || this.implicitGeneration > mathematicalPlays) throw invalid();
        const total = statistics[0].selections;
        if (!Number.isSafeInteger(total) || total < 1 || total > entryPosition || !hasProgression && total !== mathematicalPlays) throw invalid();
        for (const reel of statistics) {
            const selected = this.selections.find(selection => selection.reelIndex === reel.reelIndex);
            if (reel.selections !== total || !reel.variants.some(variant => variant.id === selected?.variantId && variant.count > 0)) throw invalid();
        }
    }

    public setSelectionState(value: unknown): void {
        this.validateSelectionState(value);
        const state = value as ReturnType<SymbolsCombinationsGenerator<T>["getSelectionState"]>;
        this.context = state.context;
        this.implicitGeneration = state.implicitGeneration;
        this.contextRequested = state.contextRequested;
        this.selections = state.selections.map(item => ({...item}));
        this.counts = state.counts.map(counts => Object.assign(Object.create(null) as Record<string, number>, counts));
    }

    public getResolvedReelStrips(): T[][] {
        this.assertWeightedDefinitionsUnchanged();
        return this.config.getSymbolsSequences().map((sequence, reelIndex) => isWeightedSymbolsSequence(sequence)
            ? sequence.resolve(this.selections.find(item => item.reelIndex === reelIndex)!.variantId).toArray() : sequence.toArray());
    }


    public validateSequenceDefinitions(): void {
        resolveScreenProjection(this.config);
        validateWeightedReelDefinitions(this.config.getSymbolsSequences(), this.config.getReelsNumber(), this.config.getAvailableSymbols(), resolveScreenProjection(this.config)?.getRows("generated") ?? this.config.getReelsSymbolsNumber());
        this.assertWeightedDefinitionsUnchanged();
    }

    public generateSymbolsCombination(): SymbolsCombinationDescribing<T> {
        this.validateSequenceDefinitions();
        if (!this.contextRequested) {
            if (this.implicitGeneration === Number.MAX_SAFE_INTEGER) throw new Error("Implicit generation contexts exhausted.");
            this.setSelectionContext(`implicit:${this.implicitGeneration + 1}`);
        }
        this.contextRequested = false;
        const arr: T[][] = new Array(this.config.getReelsNumber());
        const stopPositions: number[] = new Array(this.config.getReelsNumber());
        for (let i = 0; i < this.config.getReelsNumber(); i++) {
            const reel = this.getRandomReelSymbols(i);
            arr[i] = reel.symbols;
            stopPositions[i] = reel.position;
        }
        this.lastStopPositions = stopPositions;
        const combination = new SymbolsCombination<T>().fromMatrix(arr);
        const geometry = this.config.getScreenGeometry?.();
        return geometry ? combination.withCoordinates(geometry) : combination;
    }

    public getScreenGeometry(): ScreenGeometry | undefined {
        return resolveScreenProjection(this.config)?.getGeometry();
    }

    public getLastStopPositions(): number[] {
        return [...this.lastStopPositions];
    }

    public usesConfig(config: VideoSlotConfigDescribing<T>): boolean {
        return this.config === config;
    }

    public isRandomStateRestorable(): boolean {
        return this.constructor === SymbolsCombinationsGenerator && (this.rng.constructor === SeededRandomNumberGenerator || this.rng.constructor === PortableRandomNumberGenerator);
    }

    public getRandomStateCodec(): "seeded" | "opaque" | "portable-host" {
        // The RNG reports its own codec even when injected from the other public module format.
        // Subclass snapshots remain opaque unless their codec is explicitly supplied.
        if (this.constructor !== SymbolsCombinationsGenerator) return "opaque";
        return (this.rng as {getRandomStateCodec?: () => "seeded" | "opaque" | "portable-host"}).getRandomStateCodec?.() ?? "opaque";
    }

    public selectBonus(table: WeightedBonus): WeightedBonus["outcomes"][number] {
        return selectWeightedBonus(table, this.rng);
    }

    public getRandomState(): unknown {
        return (this.rng as {toSessionState?: () => unknown}).toSessionState?.();
    }

    public setRandomState(state: unknown): void {
        const rng = this.rng as {fromSessionState?: (value: unknown) => unknown};
        if (rng.fromSessionState === undefined) throw new Error("This symbols-combination RNG does not support state restoration.");
        rng.fromSessionState(state);
    }

    private assertWeightedDefinitionsUnchanged(): void {
        const sequences = this.config.getSymbolsSequences();
        if (!this.weightedDefinitions && !sequences.some(isWeightedSymbolsSequence)) return;
        const equalSymbols = (first: readonly T[], second: readonly T[]): boolean => first.length === second.length && first.every((symbol, index) => symbol === second[index]);
        const unchanged = this.weightedDefinitions?.length === sequences.length && sequences.every((sequence, index) => {
            const definition = this.weightedDefinitions![index];
            if (!isWeightedSymbolsSequence(sequence)) return definition.symbols !== undefined && equalSymbols(definition.symbols, sequence.toArray());
            const variants = sequence.getVariants();
            return definition.variants !== undefined && definition.variants.length === variants.length && variants.every((variant, variantIndex) => {
                const expected = definition.variants![variantIndex];
                return expected.id === variant.id && expected.weight === variant.weight && equalSymbols(expected.symbols, variant.symbols);
            });
        });
        if (!unchanged) throw new Error("Weighted reel definitions changed on a live generator; create a new session for the new model.");
    }

    private getRandomReelSymbols(reelId: number): {symbols: T[]; position: number} {
        let sequence = this.config.getSymbolsSequences()[reelId];
        if (isWeightedSymbolsSequence(sequence)) {
            let selected = this.selections.find(item => item.reelIndex === reelId);
            if (!selected) {
                const variant = sequence.select(this.rng);
                selected = {reelIndex: reelId, variantId: variant.id, context: this.context};
                this.selections.push(selected);
                if (this.context !== "initialization") {
                    this.counts[reelId] ??= Object.create(null) as Record<string, number>;
                    this.counts[reelId][variant.id] = (this.counts[reelId][variant.id] ?? 0) + 1;
                }
            }
            sequence = sequence.resolve(selected.variantId);
        }
        const position = this.rng.getRandomInt(0, sequence.getSize());
        return {symbols: sequence.getSymbols(position, resolveScreenProjection(this.config)?.getRows("generated") ?? this.config.getReelsSymbolsNumber()), position};
    }
}
