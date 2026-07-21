import type {RandomNumberGenerating} from "../session/videoslot/combinations/RandomNumberGenerating.js";
import {SeededRandomNumberGenerator} from "../session/videoslot/combinations/SeededRandomNumberGenerator.js";
import type {GameBlueprint} from "./GameBlueprint.js";
import type {RandomGameBlueprint} from "./RandomGameBlueprint.js";
import type {RandomGameBlueprintGenerating, RandomGameBlueprintOverrides} from "./RandomGameBlueprintGenerating.js";
import {SlotGameNameGenerator} from "./SlotGameNameGenerator.js";
import type {SlotGameNameGenerating} from "./SlotGameNameGenerating.js";

// A fixed pool of ordinary line-pay symbol ids (the same convention as examples/blueprints and
// createStarterGameBlueprint.ts) -- large enough for the widest symbol count this generator ever
// picks (see MAX_SYMBOLS_EXCLUSIVE below).
const SYMBOL_POOL = ["A", "K", "Q", "J", "10", "9", "8", "7"];

const MIN_REELS = 3;
const MAX_REELS_EXCLUSIVE = 7; // 3..6
const MIN_ROWS = 3;
const MAX_ROWS_EXCLUSIVE = 5; // 3..4
const MIN_SYMBOLS = 5;
const MAX_SYMBOLS_EXCLUSIVE = SYMBOL_POOL.length + 1; // 5..8

const DEFAULT_VERSION = "0.1.0";
const DEFAULT_AVAILABLE_BETS = [1, 2, 5, 10];

// Produces a first-class, always-valid GameBlueprint: reels/rows/symbols/paytable/symbolWeights (and
// nothing else -- no wilds/scatters/winModel/mechanics/betModes/reelStrips/reelStripGeneration), the
// same minimal line-pay shape as createStarterGameBlueprint.ts, just randomized. Two design choices
// keep it warning-free under GameBlueprintValidator by construction, not by luck:
//   - every symbol's payout schedule runs from 3-of-a-kind up to "reels", strictly increasing with
//     match count (never triggers "non-monotonic"/"missing-base-payout"/"frequent-low-match"), and
//     its entry-tier (3-of-a-kind) multiplier is always <= symbols.length (<= 8, well under the
//     "generous entry payout" threshold of 10);
//   - reel weight is the exact inverse of pay rank (the best-paying symbol is always the rarest), so
//     "weighting-pay-mismatch" can never fire, and with 5-8 symbols no single one exceeds ~33% of the
//     total weight (well under the 40% "dominant symbol" threshold) -- see the class-level test suite
//     for the arithmetic this relies on.
// paylines are omitted entirely, deliberately: VideoSlotConfig's own default (one horizontal line per
// row) is always valid for any reels/rows this generator picks, so there's nothing to compute.
export class RandomGameBlueprintGenerator implements RandomGameBlueprintGenerating {
    private readonly nameGenerator: SlotGameNameGenerating;
    private readonly createRandom: (seed: number) => RandomNumberGenerating;

    constructor(
        nameGenerator: SlotGameNameGenerating = new SlotGameNameGenerator(),
        createRandom: (seed: number) => RandomNumberGenerating = (seed) => new SeededRandomNumberGenerator(seed),
    ) {
        this.nameGenerator = nameGenerator;
        this.createRandom = createRandom;
    }

    private static slugify(value: string): string {
        const slug = value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        return slug.length > 0 ? slug : "random-game";
    }

    private static mintSeed(): number {
        return Math.floor(Math.random() * 0x7fffffff);
    }

    public generate(seed?: number, overrides?: RandomGameBlueprintOverrides): RandomGameBlueprint {
        const resolvedSeed = seed ?? RandomGameBlueprintGenerator.mintSeed();
        const random = this.createRandom(resolvedSeed);

        const reels = random.getRandomInt(MIN_REELS, MAX_REELS_EXCLUSIVE);
        const rows = random.getRandomInt(MIN_ROWS, MAX_ROWS_EXCLUSIVE);
        const symbolCount = random.getRandomInt(MIN_SYMBOLS, MAX_SYMBOLS_EXCLUSIVE);
        const symbols = this.pickSymbols(random, symbolCount);

        const paytable: Record<string, Record<string, number>> = {};
        const symbolWeights: Record<string, number> = {};
        symbols.forEach((symbolId, rank) => {
            // rank 0 is dealt first and pays the most, but also lands the least often (weight 1 of
            // symbols.length) -- see the class doc comment for why that keeps every weighting/pay-
            // tiering quality check satisfied for any symbols.length this generator picks.
            const entryMultiplier = symbols.length - rank;
            const payouts: Record<string, number> = {};
            for (let matchCount = 3; matchCount <= reels; matchCount++) {
                payouts[String(matchCount)] = entryMultiplier * (matchCount - 2);
            }
            paytable[symbolId] = payouts;
            symbolWeights[symbolId] = rank + 1;
        });

        const {id, name} = this.resolveName(resolvedSeed, overrides);

        const blueprint: GameBlueprint = {
            manifest: {
                id,
                name,
                version: DEFAULT_VERSION,
                description: `Randomly generated video slot (seed ${resolvedSeed}).`,
            },
            reels,
            rows,
            symbols,
            paytable,
            symbolWeights,
            availableBets: DEFAULT_AVAILABLE_BETS,
        };

        return {blueprint, seed: resolvedSeed};
    }

    private resolveName(seed: number, overrides?: RandomGameBlueprintOverrides): {id: string; name: string} {
        const overrideName = overrides?.name?.trim();
        if (overrideName === undefined || overrideName.length === 0) {
            return this.nameGenerator.generate(seed);
        }
        return {id: overrides?.id ?? RandomGameBlueprintGenerator.slugify(overrideName), name: overrideName};
    }

    private pickSymbols(random: RandomNumberGenerating, count: number): string[] {
        const pool = [...SYMBOL_POOL];
        for (let i = pool.length - 1; i > 0; i--) {
            const j = random.getRandomInt(0, i + 1);
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, count);
    }
}
