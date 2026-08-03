import type {RandomNumberGenerating} from "../session/videoslot/combinations/RandomNumberGenerating.js";
import type {GameMechanicFeature} from "./GameMechanicFeature.js";
import type {RandomGameBlueprintMechanics} from "./RandomGameBlueprintMechanics.js";
import type {RandomGameBlueprintStrategy} from "./RandomGameBlueprintStrategy.js";
import type {ReelStripGenerationSpec} from "./ReelStripGenerationSpec.js";

// A fixed pool of ordinary line-pay symbol ids (the same convention as examples/blueprints and
// createStarterGameBlueprint.ts) -- large enough for the widest symbol count this strategy ever picks
// (see MAX_SYMBOLS_EXCLUSIVE below).
const SYMBOL_POOL = ["A", "K", "Q", "J", "10", "9", "8", "7"];

const MIN_REELS = 3;
const MAX_REELS_EXCLUSIVE = 7; // 3..6
const MIN_ROWS = 3;
const MAX_ROWS_EXCLUSIVE = 5; // 3..4
const MIN_SYMBOLS = 5;
const MAX_SYMBOLS_EXCLUSIVE = SYMBOL_POOL.length + 1; // 5..8

const DEFAULT_AVAILABLE_BETS = [1, 2, 5, 10];

// Upper bound (exclusive) for a per-reel reelStripGeneration seed -- the same range
// RandomGameBlueprintGenerator.mintSeed() draws an unseeded top-level seed from, kept here too so a
// per-reel seed is always a plain, comfortably-safe-integer positive seed.
const MAX_REEL_SEED_EXCLUSIVE = 0x7fffffff;

// Produces a first-class, always-valid mechanic set: reels/rows/symbols/paytable/reelStripGeneration
// (and nothing else -- no wilds/scatters/winModel/mechanics/betModes/reelStrips/symbolWeights), the
// same minimal line-pay shape as createStarterGameBlueprint.ts, just randomized. Its reel weighting is
// expressed as one independent, already-resolved-shape "generated" entry per reel (see
// buildReelStripGeneration below) rather than a single flat symbolWeights map: every reel's own strip
// content can be inspected directly off the blueprint (via resolveReelStripGeneration/
// materializeReelStrips, or "pokie build --dry-run") without first running it through the engine's
// implicit runtime weighting, and re-resolving the same blueprint always reproduces the exact same
// strips (each entry's own "seed" is drawn deterministically from the strategy's own `random`).
// Three design choices keep it warning-free under GameBlueprintValidator by construction, not by luck:
//   - every symbol's payout schedule runs from 3-of-a-kind up to "reels", strictly increasing with
//     match count (never triggers "non-monotonic"/"missing-base-payout"/"frequent-low-match"), and
//     its entry-tier (3-of-a-kind) multiplier is always <= symbols.length (<= 8, well under the
//     "generous entry payout" threshold of 10);
//   - reel weight is the exact inverse of pay rank (the best-paying symbol is always the rarest), so
//     "weighting-pay-mismatch" can never fire, and with 5-8 symbols no single one exceeds ~33% of the
//     total weight (well under the 40% "dominant symbol" threshold) -- see the class-level test suite
//     for the arithmetic this relies on. Every reel repeats the exact same ratio, so this holds
//     identically whether GameBlueprintValidator reads it as a flat map or sums it across reels;
//   - each reel's generation "length" is the exact sum of the weights themselves, so converting weights
//     into occurrence counts needs no rounding to land on those exact counts (see
//     LargestRemainderReelStripSymbolWeightsConverter, which ReelStripGenerator.generateFromSymbolWeights
//     already runs this through).
// paylines are omitted entirely, deliberately: VideoSlotConfig's own default (one horizontal line per
// row) is always valid for any reels/rows this strategy picks, so there's nothing to compute -- see
// `features` below, which declares that this strategy touches no optional mechanic area beyond its
// own per-reel reel weighting.
export class DefaultRandomGameBlueprintStrategy implements RandomGameBlueprintStrategy {
    public readonly name = "default-line-pay";
    public readonly features: readonly GameMechanicFeature[] = ["reelStripGeneration"];

    public build(random: RandomNumberGenerating): RandomGameBlueprintMechanics {
        const reels = random.getRandomInt(MIN_REELS, MAX_REELS_EXCLUSIVE);
        const rows = random.getRandomInt(MIN_ROWS, MAX_ROWS_EXCLUSIVE);
        const symbolCount = random.getRandomInt(MIN_SYMBOLS, MAX_SYMBOLS_EXCLUSIVE);
        const symbols = this.pickSymbols(random, symbolCount);

        const paytable: Record<string, Record<string, number>> = {};
        const symbolWeights: Record<string, number> = {};
        symbols.forEach((symbolId, rank) => {
            // rank 0 is dealt first and pays the most, but also lands the least often (weight 1 of
            // symbols.length) -- see the class doc comment for why that keeps every weighting/pay-
            // tiering quality check satisfied for any symbols.length this strategy picks.
            const entryMultiplier = symbols.length - rank;
            const payouts: Record<string, number> = {};
            for (let matchCount = 3; matchCount <= reels; matchCount++) {
                payouts[String(matchCount)] = entryMultiplier * (matchCount - 2);
            }
            paytable[symbolId] = payouts;
            symbolWeights[symbolId] = rank + 1;
        });

        const reelStripGeneration = this.buildReelStripGeneration(random, reels, symbolWeights);

        return {reels, rows, symbols, paytable, reelStripGeneration, availableBets: DEFAULT_AVAILABLE_BETS};
    }

    private pickSymbols(random: RandomNumberGenerating, count: number): string[] {
        const pool = [...SYMBOL_POOL];
        for (let i = pool.length - 1; i > 0; i--) {
            const j = random.getRandomInt(0, i + 1);
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, count);
    }

    // One independent "generated" entry per reel, each targeting the exact same symbol:weight ratio
    // (see the class doc comment for why that keeps every weighting quality check satisfied) -- only
    // each reel's own "seed" differs, drawn from `random` itself so the whole blueprint (including
    // every reel's exact strip content) stays fully reproducible from the strategy's own top-level
    // seed alone.
    private buildReelStripGeneration(random: RandomNumberGenerating, reels: number, symbolWeights: Record<string, number>): ReelStripGenerationSpec[] {
        const length = Object.values(symbolWeights).reduce((sum, weight) => sum + weight, 0);
        return Array.from({length: reels}, () => ({
            type: "generated" as const,
            length,
            symbolWeights,
            seed: random.getRandomInt(0, MAX_REEL_SEED_EXCLUSIVE),
        }));
    }
}
