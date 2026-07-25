import type {RandomNumberGenerating} from "../session/videoslot/combinations/RandomNumberGenerating.js";
import type {GameBlueprintWinModel} from "./GameBlueprint.js";
import type {GameMechanicFeature} from "./GameMechanicFeature.js";
import type {RandomGameBlueprintMechanics} from "./RandomGameBlueprintMechanics.js";
import type {RandomGameBlueprintStrategy} from "./RandomGameBlueprintStrategy.js";

// Same conservative symbol pool/bounds as DefaultRandomGameBlueprintStrategy -- large enough for the
// widest symbol count this strategy ever picks (see MAX_SYMBOLS_EXCLUSIVE below).
const SYMBOL_POOL = ["A", "K", "Q", "J", "10", "9", "8", "7"];

const MIN_REELS = 3;
const MAX_REELS_EXCLUSIVE = 7; // 3..6
const MIN_ROWS = 3;
const MAX_ROWS_EXCLUSIVE = 5; // 3..4
const MIN_SYMBOLS = 5;
const MAX_SYMBOLS_EXCLUSIVE = SYMBOL_POOL.length + 1; // 5..8

// Matches ClusterWinCalculator's own default minimumClusterSize (see its constructor) -- this strategy
// always omits winModel.minimumClusterSize for a "clusters" build, so the paytable's own match-count
// keys need to start where the runtime will actually start awarding.
const CLUSTER_MINIMUM_SIZE = 5;

// A handful of already-valid, already-distinct bet ladders (GameBlueprintValidator only requires
// positive, non-duplicate numbers) -- picked from, not computed, so "bets" varies without ever risking
// an invalid ladder.
const BET_LADDERS: readonly (readonly number[])[] = [
    [1, 2, 5, 10],
    [0.5, 1, 2, 5, 10],
    [1, 2, 3, 5, 10, 20],
    [1, 5, 10, 25, 50],
];

type WinShapeKind = "lines" | "paylines" | "ways" | "clusters";

// A richer alternative to DefaultRandomGameBlueprintStrategy: still always produces a first-class,
// GameBlueprintValidator-clean blueprint, but explores the wider space
// GameMechanicCompatibilityCatalog's ["paylines", "reelStrips", "winModel"] entry allows -- custom
// paylines, "ways"/"clusters" win models, and literal reelStrips in place of symbolWeights -- instead of
// only ever the minimal line-pay shape. Two invariants matter more than any individual mechanic, and
// both are structural (guaranteed by build() below, not by luck, and covered by this class's own test
// suite across many seeds):
//   - "paylines" and "winModel" are never both set on the same blueprint -- GameBlueprintValidator warns
//     "blueprint-winmodel-paylines-ignored" when they are (ways/clusters wins ignore paylines entirely).
//     This strategy instead picks exactly one WinShapeKind per build and only ever emits the mechanic
//     that shape actually uses.
//   - every match-count key this strategy ever writes into a paytable stays within
//     GameBlueprintValidator's own maxMatchCount for that build's win shape ("reels" for lines/ways/
//     paylines, "reels" * "rows" for clusters).
// The reel-weighting/entry-tier reasoning is otherwise identical to DefaultRandomGameBlueprintStrategy's
// own doc comment: entry-tier multiplier is always <= symbols.length (<=8, under the "generous entry
// payout" threshold of 10), and weight is the exact inverse of pay rank, so "weighting-pay-mismatch" and
// "dominant symbol" can never fire, regardless of whether that weight ends up in symbolWeights or as
// repeated occurrences across a literal reelStrips (the two use the same ratios, just a different unit).
export class RandomGameBlueprintVariantStrategy implements RandomGameBlueprintStrategy {
    public readonly name = "random-variant";
    public readonly features: readonly GameMechanicFeature[] = ["paylines", "reelStrips", "winModel"];

    public build(random: RandomNumberGenerating): RandomGameBlueprintMechanics {
        const reels = random.getRandomInt(MIN_REELS, MAX_REELS_EXCLUSIVE);
        const rows = random.getRandomInt(MIN_ROWS, MAX_ROWS_EXCLUSIVE);
        const symbolCount = random.getRandomInt(MIN_SYMBOLS, MAX_SYMBOLS_EXCLUSIVE);
        const symbols = this.pickSymbols(random, symbolCount);

        const winShape = this.pickWinShapeKind(random);
        const maxMatchCount = winShape === "clusters" ? reels * rows : reels;
        const matchCounts =
            winShape === "clusters"
                ? [CLUSTER_MINIMUM_SIZE, CLUSTER_MINIMUM_SIZE + 1, CLUSTER_MINIMUM_SIZE + 2].filter(
                    (count) => count <= maxMatchCount,
                )
                : this.range(3, reels);

        const {paytable, symbolWeights} = this.buildPayoutPlan(symbols, matchCounts);

        const mechanics: RandomGameBlueprintMechanics = {
            reels,
            rows,
            symbols,
            paytable,
            availableBets: [...BET_LADDERS[random.getRandomInt(0, BET_LADDERS.length)]],
        };

        if (random.getRandomInt(0, 2) === 0) {
            mechanics.symbolWeights = symbolWeights;
        } else {
            mechanics.reelStrips = this.buildReelStrips(random, reels, symbols, symbolWeights);
        }

        if (winShape === "paylines") {
            mechanics.paylines = this.buildDistinctPaylines(random, reels, rows);
        } else if (winShape === "ways" || winShape === "clusters") {
            mechanics.winModel = {type: winShape} as GameBlueprintWinModel;
        }

        return mechanics;
    }

    private pickWinShapeKind(random: RandomNumberGenerating): WinShapeKind {
        const kinds: readonly WinShapeKind[] = ["lines", "paylines", "ways", "clusters"];
        return kinds[random.getRandomInt(0, kinds.length)];
    }

    private pickSymbols(random: RandomNumberGenerating, count: number): string[] {
        const pool = [...SYMBOL_POOL];
        for (let i = pool.length - 1; i > 0; i--) {
            const j = random.getRandomInt(0, i + 1);
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, count);
    }

    private range(start: number, end: number): number[] {
        const values: number[] = [];
        for (let value = start; value <= end; value++) {
            values.push(value);
        }
        return values;
    }

    // rank 0 is dealt first and pays the most, but also lands the least often (weight 1 of
    // symbols.length) -- see the class doc comment for why that keeps every weighting/pay-tiering
    // quality check satisfied for any symbols.length/matchCounts this strategy picks.
    private buildPayoutPlan(
        symbols: string[],
        matchCounts: number[],
    ): {paytable: Record<string, Record<string, number>>; symbolWeights: Record<string, number>} {
        const paytable: Record<string, Record<string, number>> = {};
        const symbolWeights: Record<string, number> = {};
        symbols.forEach((symbolId, rank) => {
            const entryMultiplier = symbols.length - rank;
            const payouts: Record<string, number> = {};
            matchCounts.forEach((matchCount, tier) => {
                payouts[String(matchCount)] = entryMultiplier * (tier + 1);
            });
            paytable[symbolId] = payouts;
            symbolWeights[symbolId] = rank + 1;
        });
        return {paytable, symbolWeights};
    }

    // Builds one strip per reel from the same symbol/weight ratios as symbolWeights (each symbol
    // repeated "weight" times), independently shuffled per reel -- so a "reelStrips" build stays
    // weighting-quality-clean for exactly the same reason a "symbolWeights" build is (see the class doc
    // comment): the ratios are identical, just expressed as occurrence counts instead of weight values.
    private buildReelStrips(
        random: RandomNumberGenerating,
        reels: number,
        symbols: string[],
        symbolWeights: Record<string, number>,
    ): string[][] {
        const template: string[] = [];
        symbols.forEach((symbolId) => {
            for (let i = 0; i < symbolWeights[symbolId]; i++) {
                template.push(symbolId);
            }
        });

        const strips: string[][] = [];
        for (let reel = 0; reel < reels; reel++) {
            const strip = [...template];
            for (let i = strip.length - 1; i > 0; i--) {
                const j = random.getRandomInt(0, i + 1);
                [strip[i], strip[j]] = [strip[j], strip[i]];
            }
            strips.push(strip);
        }
        return strips;
    }

    // Always includes one straight (horizontal) line per row, then tops up with a few zigzag lines
    // picked at random -- deduped so "blueprint-paylines-duplicate" can never fire, capped at a handful
    // of attempts so an unlucky draw can't spin forever (the reels/rows search space this strategy picks
    // from is always far bigger than the handful of lines it needs).
    private buildDistinctPaylines(random: RandomNumberGenerating, reels: number, rows: number): number[][] {
        const lines: number[][] = [];
        const seen = new Set<string>();

        const addLine = (line: number[]): void => {
            const key = JSON.stringify(line);
            if (!seen.has(key)) {
                seen.add(key);
                lines.push(line);
            }
        };

        for (let row = 0; row < rows; row++) {
            addLine(new Array(reels).fill(row));
        }

        const desiredTotal = lines.length + random.getRandomInt(1, 3); // 1 or 2 extra zigzag lines
        for (let attempt = 0; attempt < 20 && lines.length < desiredTotal; attempt++) {
            const line: number[] = [];
            for (let reel = 0; reel < reels; reel++) {
                line.push(random.getRandomInt(0, rows));
            }
            addLine(line);
        }

        return lines;
    }
}
