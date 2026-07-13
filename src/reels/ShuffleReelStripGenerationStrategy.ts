import type {RandomNumberGenerating} from "../session/videoslot/combinations/RandomNumberGenerating.js";
import {ReelStrip} from "./ReelStrip.js";
import type {ReelStripDefinition} from "./ReelStripDefinition.js";
import type {ReelStripGenerationRequest} from "./ReelStripGenerationRequest.js";
import type {ReelStripGenerationStrategy} from "./ReelStripGenerationStrategy.js";

// Default ReelStripGenerationStrategy: builds the exact symbol pool described by
// `request.symbolCounts`, seats locked symbols first, then Fisher–Yates-shuffles the remaining pool
// into the remaining positions using the supplied rng. Exact counts and locked positions therefore
// hold by construction — this never needs to retry a shuffle to satisfy them, only
// constraints beyond that (distance, adjacency, run length, ...) may still fail and trigger another
// candidate from ReelStripGenerator.
export class ShuffleReelStripGenerationStrategy implements ReelStripGenerationStrategy {
    public generateCandidate(request: ReelStripGenerationRequest, rng: RandomNumberGenerating): ReelStripDefinition {
        const pool = this.buildPool(request.symbolCounts);
        const symbols: (string | undefined)[] = new Array(request.length).fill(undefined);
        const lockedPositions = request.lockedPositions ?? {};

        for (const [positionKey, symbolId] of Object.entries(lockedPositions)) {
            symbols[Number(positionKey)] = symbolId;
            this.removeOne(pool, symbolId);
        }

        this.shuffle(pool, rng);

        let poolIndex = 0;
        for (let position = 0; position < symbols.length; position++) {
            if (symbols[position] === undefined) {
                symbols[position] = pool[poolIndex];
                poolIndex++;
            }
        }

        return new ReelStrip(symbols as string[]);
    }

    private buildPool(symbolCounts: Record<string, number>): string[] {
        const pool: string[] = [];
        for (const [symbolId, count] of Object.entries(symbolCounts)) {
            for (let i = 0; i < count; i++) {
                pool.push(symbolId);
            }
        }
        return pool;
    }

    private removeOne(pool: string[], symbolId: string): void {
        const index = pool.indexOf(symbolId);
        if (index !== -1) {
            pool.splice(index, 1);
        }
    }

    private shuffle(pool: string[], rng: RandomNumberGenerating): void {
        for (let i = pool.length - 1; i > 0; i--) {
            const j = rng.getRandomInt(0, i + 1);
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
    }
}
