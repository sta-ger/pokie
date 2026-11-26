import {GameBlueprintValidator} from "../generated/GameBlueprintValidator.js";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import {createAuthoredPokieGame} from "../generated/createAuthoredPokieGame.js";
import {resolveReelStripGeneration} from "../generated/resolveReelStripGeneration.js";
import {writeReelStrips} from "../generated/writeReelStrips.js";
import {estimateExactOutcomeSpaceSize} from "./generate/estimateExactOutcomeSpaceSize.js";
import {generateExactWeightedOutcomeLibrary} from "./generate/generateExactWeightedOutcomeLibrary.js";
import {WeightedOutcomeLibraryAnalyzer} from "./WeightedOutcomeLibraryAnalyzer.js";
import type {WeightedOutcomeLibraryAnalysis} from "./WeightedOutcomeLibraryAnalysis.js";
import {computeWeightedOutcomeLibraryFeatureBreakdown} from "./computeWeightedOutcomeLibraryFeatureBreakdown.js";
import {computeFreeGamesExactRtp, type FreeGamesExactRtp} from "./computeFreeGamesExactRtp.js";
import type {WeightedOutcomeLibraryFeatureBreakdown} from "./WeightedOutcomeLibraryFeatureBreakdown.js";
import {analyzeWeightedOutcomeWins, type WeightedOutcomeWinAnalysis} from "./WeightedOutcomeWinAnalysis.js";

/** The largest exact space Studio will enumerate on demand for a draft/preview or PAR math sheet. */
export const DEFAULT_BLUEPRINT_MATH_OUTCOME_CAP = 25_000;

export type BlueprintMathAnalysisOptions = {
    readonly pokieVersion: string;
    /** Exact enumeration cap; larger drafts return "unavailable" instead of blocking the caller. */
    readonly maxOutcomes?: number;
    readonly signal?: AbortSignal;
    readonly now?: () => Date;
};

export type BlueprintMathAnalysisResult =
    | {
          readonly status: "ok";
          /** The materialized snapshot the analysis actually ran against (literal reels, no generation specs). */
          readonly blueprint: GameBlueprint;
          readonly outcomeCount: number;
          readonly totalWeight: number;
          readonly stake: number;
          readonly analysis: WeightedOutcomeLibraryAnalysis;
          readonly wins: WeightedOutcomeWinAnalysis;
          /**
           * Which feature events occur in the enumerated paid-spin records. A non-empty list means the
           * library records feature triggers (for example freeGamesTriggered) but does not contain the
           * later feature wins those triggers produce, so the RTP above covers paid spins only.
           */
          readonly featureBreakdown: WeightedOutcomeLibraryFeatureBreakdown;
          /** Exact total RTP when the only feature is authored additive-retrigger free games. */
          readonly freeGamesRtp: FreeGamesExactRtp;
          readonly strategy: "exact";
          readonly generatedAt: string;
          readonly note?: string;
      }
    | {
          readonly status: "unavailable";
          readonly reason: string;
          readonly outcomeSpaceSize?: bigint;
      };

/**
 * Runs one complete exact enumeration for an authored draft, without saving a project, writing an
 * Outcome Library or creating an executable package. This is the shared math boundary behind Studio's
 * Design Game preview and PAR workbook math sheets, so both report the same numbers for the same input.
 *
 * The caller owns the cost policy through maxOutcomes. A draft whose exact space is larger than that cap
 * is rejected before enumeration; no sampled result is ever presented as exact.
 */
export async function analyzeBlueprintMath(
    blueprint: unknown,
    options: BlueprintMathAnalysisOptions,
): Promise<BlueprintMathAnalysisResult> {
    const maxOutcomes = options.maxOutcomes ?? DEFAULT_BLUEPRINT_MATH_OUTCOME_CAP;
    if (!Number.isSafeInteger(maxOutcomes) || maxOutcomes <= 0) {
        return {status: "unavailable", reason: "The exact-analysis outcome cap must be a positive safe integer."};
    }

    const validationIssues = new GameBlueprintValidator().validate(blueprint);
    const errors = validationIssues.filter((issue) => issue.severity === "error");
    if (errors.length > 0) {
        return {status: "unavailable", reason: `Fix the game design before calculating exact math: ${errors.map((issue) => issue.message).join("; ")}`};
    }
    const authored = blueprint as GameBlueprint;

    let materialized: GameBlueprint;
    try {
        if (authored.reelStripGeneration !== undefined) {
            const resolution = resolveReelStripGeneration(authored);
            if (!resolution.success) {
                const failures = resolution.reels.filter((reel) => !reel.success);
                return {
                    status: "unavailable",
                    reason: `The draft's generated reel strips could not be resolved: ${failures
                        .map((reel) => `reel ${reel.reelIndex + 1} could not satisfy its constraints`)
                        .join("; ")}.`,
                };
            }
            materialized = writeReelStrips(authored, resolution.reelStripGeneration);
        } else {
            materialized = writeReelStrips(authored, undefined);
        }
    } catch (error) {
        return {status: "unavailable", reason: `The draft's reel source could not be materialized: ${error instanceof Error ? error.message : String(error)}`};
    }

    let game: PokieGame;
    try {
        game = createAuthoredPokieGame(materialized);
    } catch (error) {
        return {status: "unavailable", reason: `The draft cannot be executed for exact math: ${error instanceof Error ? error.message : String(error)}`};
    }

    try {
        let outcomeSpaceSize: bigint;
        try {
            outcomeSpaceSize = estimateExactOutcomeSpaceSize(game).totalOutcomeSpaceSize;
        } catch (error) {
            return {status: "unavailable", reason: `This draft does not expose a finite exact reel-stop space: ${error instanceof Error ? error.message : String(error)}`};
        }
        if (outcomeSpaceSize > BigInt(maxOutcomes)) {
            return {
                status: "unavailable",
                reason: `Exact analysis is not included because the draft has ${outcomeSpaceSize.toLocaleString("en-US")} possible reel-stop combinations; the exact preview cap is ${maxOutcomes.toLocaleString("en-US")}. Create the game and use an Outcome Library or Simulation for a larger space.`,
                outcomeSpaceSize,
            };
        }

        const generatedAt = (options.now ?? (() => new Date()))().toISOString();
        const generated = await generateExactWeightedOutcomeLibrary({
            libraryId: "blueprint-math-analysis",
            game,
            pokieVersion: options.pokieVersion,
            maxOutcomeSpaceSize: BigInt(maxOutcomes),
            exact: true,
            ...(options.signal === undefined ? {} : {signal: options.signal}),
            now: options.now,
        });
        const analysis = new WeightedOutcomeLibraryAnalyzer().analyze(generated.library);
        const wins = analyzeWeightedOutcomeWins(generated.library);
        const featureBreakdown = computeWeightedOutcomeLibraryFeatureBreakdown(generated.library);
        const freeGamesRtp = computeFreeGamesExactRtp(generated.library, analysis.rtp, authored.mechanics?.freeGames?.maxFreeGames);
        return {
            status: "ok",
            blueprint: materialized,
            outcomeCount: generated.library.outcomes.length,
            totalWeight: analysis.totalWeight,
            stake: generated.library.outcomes[0]?.record.stake ?? 1,
            analysis,
            wins,
            featureBreakdown,
            freeGamesRtp,
            strategy: "exact",
            generatedAt,
            note: `Exact enumeration of ${generated.library.outcomes.length.toLocaleString("en-US")} outcomes. Nothing was saved.`,
        };
    } catch (error) {
        return {status: "unavailable", reason: `Exact analysis could not be completed: ${error instanceof Error ? error.message : String(error)}`};
    } finally {
        await game.release?.();
    }
}
