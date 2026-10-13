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
    private lastStopPositions: number[] = [];

    constructor(config: VideoSlotConfigDescribing<T>, rng: RandomNumberGenerating = new PseudorandomNumberGenerator()) {
        this.config = config;
        this.rng = rng;
    }

    public generateSymbolsCombination(): SymbolsCombinationDescribing<T> {
        const arr: T[][] = new Array(this.config.getReelsNumber());
        const stopPositions: number[] = new Array(this.config.getReelsNumber());
        for (let i = 0; i < this.config.getReelsNumber(); i++) {
            const reel = this.getRandomReelSymbols(i);
            arr[i] = reel.symbols;
            stopPositions[i] = reel.position;
        }
        this.lastStopPositions = stopPositions;
        return new SymbolsCombination<T>().fromMatrix(arr);
    }

    public getLastStopPositions(): number[] {
        return [...this.lastStopPositions];
    }

    public usesConfig(config: VideoSlotConfigDescribing<T>): boolean {
        return this.config === config;
    }

    public isRandomStateRestorable(): boolean {
        return this.constructor === SymbolsCombinationsGenerator && this.rng.constructor === SeededRandomNumberGenerator;
    }

    public getRandomStateCodec(): "seeded" | "opaque" {
        return this.isRandomStateRestorable() ? "seeded" : "opaque";
    }

    public getRandomState(): unknown {
        return (this.rng as {toSessionState?: () => unknown}).toSessionState?.();
    }

    public setRandomState(state: unknown): void {
        const rng = this.rng as {fromSessionState?: (value: unknown) => unknown};
        if (rng.fromSessionState === undefined) throw new Error("This symbols-combination RNG does not support state restoration.");
        rng.fromSessionState(state);
    }

    private getRandomReelSymbols(reelId: number): {symbols: T[]; position: number} {
        const sequence = this.config.getSymbolsSequences()[reelId];
        const position = this.rng.getRandomInt(0, sequence.getSize());
        return {symbols: sequence.getSymbols(position, this.config.getReelsSymbolsNumber()), position};
    }
}
