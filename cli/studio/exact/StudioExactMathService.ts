import {
    OutcomeLibraryFolderReader,
    analyzeWeightedOutcomeWins,
    computeFreeGamesExactRtp,
    computeWeightedOutcomeLibraryFeatureBreakdown,
    loadGameBlueprint,
    type FreeGamesExactRtp,
    type OutcomeLibraryFolderReading,
    type WeightedOutcomeLibraryAnalysis,
} from "@fromstan/pokie";
import path from "node:path";
import type {StudioOutcomeLibraryRegistryView} from "../outcomeLibrary/StudioOutcomeLibraryRegistryView.js";
import {resolveProjectDirectory} from "../outcomeLibrary/resolveProjectDirectory.js";
import type {StudioExactMathContributionTable, StudioExactMathEventTable, StudioExactMathFeatureEvent, StudioExactMathView} from "./StudioExactMathView.js";

// Reading every retained outcome is only needed for the line/symbol breakdown; the exact headline
// metrics and payout distribution are already embedded in the bundle's mode index. A very large
// library should still open quickly and truthfully show the exact metrics even when a full scan is
// intentionally skipped.
const MAX_CONTRIBUTION_OUTCOMES = 25_000;

/** Reads the authored cap from the current design; a non-blueprint project simply has no cap. */
function resolveMaxFreeGames(projectRoot: string): number | undefined {
    for (const candidate of [projectRoot, path.join(projectRoot, "blueprint.json")]) {
        try {
            const blueprint = loadGameBlueprint(candidate);
            return blueprint.mechanics?.freeGames?.maxFreeGames;
        } catch {
            // Try the other shape: projectRoot may be a directory or the blueprint file itself.
        }
    }
    return undefined;
}

/**
 * Reads the exact analysis of a compatible Outcome Library for the current saved design and augments it
 * with per-line/per-symbol contributions and event-level win probabilities computed from the library's
 * retained RoundRecords.
 *
 * This service never generates or recomputes outcomes. It answers only from a library whose own game
 * id/version/config hash/recorded POKIE version already match the current project (see
 * StudioOutcomeLibraryGenerateService.registry), so a stale bundle can never be presented as current
 * exact math.
 */
export class StudioExactMathService {
    private readonly registry: (projectRoot: string) => Promise<StudioOutcomeLibraryRegistryView>;
    private readonly reader: OutcomeLibraryFolderReading<string>;

    public constructor(
        registry: (projectRoot: string) => Promise<StudioOutcomeLibraryRegistryView>,
        reader: OutcomeLibraryFolderReading<string> = new OutcomeLibraryFolderReader<string>(),
    ) {
        this.registry = registry;
        this.reader = reader;
    }

    public async get(projectRoot: string): Promise<StudioExactMathView> {
        const registry = await this.registry(projectRoot);
        if (registry.status !== "ok") return {status: "error", message: registry.error};
        if (registry.buildStatus === "missing") {
            return {
                status: "missing",
                message: "No exact outcome table exists for this saved design yet. Compute it once to replace a sampled estimate with exact RTP, payout probabilities and line/symbol contributions.",
            };
        }

        const compatible = registry.modes.filter((mode) => mode.buildStatus === "compatible");
        const mode = compatible.find((candidate) => candidate.modeName === "base") ?? compatible[0];
        if (mode === undefined) {
            return {
                status: "stale",
                message: "An exact outcome table exists, but it was computed from a different saved design or POKIE version. Recompute it before treating its numbers as exact for the current design.",
            };
        }

        const resolved = resolveProjectDirectory(projectRoot, mode.libraryDir);
        if (resolved.status === "error") return {status: "error", message: resolved.message};

        let analysis: WeightedOutcomeLibraryAnalysis;
        let stake: number;
        try {
            const manifest = await this.reader.readIndex(resolved.resolvedPath);
            const modeEntry = manifest.modes.find((entry) => entry.modeName === mode.modeName);
            if (modeEntry === undefined) {
                return {status: "error", message: `The outcome-table manifest does not contain mode "${mode.modeName}".`};
            }
            analysis = modeEntry.analysis;
            stake = modeEntry.stake;
        } catch (error) {
            return {status: "error", message: `Could not read the exact analysis for mode "${mode.modeName}": ${error instanceof Error ? error.message : String(error)}`};
        }

        let line: StudioExactMathContributionTable = {entries: [], truncated: false};
        let symbol: StudioExactMathContributionTable = {entries: [], truncated: false};
        let events: StudioExactMathEventTable = {entries: [], truncated: false};
        let contributionNote: string | undefined;
        let eventNote: string | undefined;
        let featureEvents: readonly StudioExactMathFeatureEvent[] | undefined;
        let featurePayoutsIncluded: boolean | undefined;
        let freeGamesRtp: FreeGamesExactRtp | undefined;
        let featureNote: string | undefined;
        if (mode.outcomeCount > MAX_CONTRIBUTION_OUTCOMES) {
            const skip = `This library has ${mode.outcomeCount.toLocaleString("en-US")} outcomes. Exact metrics and the payout distribution are shown from its index; per-line, per-symbol and per-event detail was skipped because loading every outcome would be too expensive here.`;
            contributionNote = skip;
            eventNote = skip;
            featureNote = "This library is too large to inspect feature triggers here. The exact figures cover paid entry spins; feature payouts that settle later (for example free games) are not included.";
        } else {
            try {
                const library = await this.reader.readLibrary(resolved.resolvedPath, mode.modeName);
                const winAnalysis = analyzeWeightedOutcomeWins(library);
                line = winAnalysis.line;
                symbol = winAnalysis.symbol;
                events = winAnalysis.events;
                const featureBreakdown = computeWeightedOutcomeLibraryFeatureBreakdown(library);
                featureEvents = featureBreakdown.featureEvents;
                featurePayoutsIncluded = featureBreakdown.featureEvents.length === 0;
                if (featureBreakdown.featureEvents.length > 0) {
                    freeGamesRtp = computeFreeGamesExactRtp(library, analysis.rtp, resolveMaxFreeGames(projectRoot));
                    featureNote = "This exact library records feature triggers, but the later feature wins are outside these paid-spin outcomes. Use Simulation for total RTP.";
                }
                if (winAnalysis.truncated) {
                    contributionNote = "Contribution and event tables are limited to their largest rows. The library itself remains complete.";
                    eventNote = contributionNote;
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                contributionNote = `Exact metrics and the payout distribution are available from the library index, but per-line/symbol contributions could not be read: ${message}`;
                eventNote = `Exact win-event probabilities could not be read: ${message}`;
            }
        }

        return {
            status: "ok",
            modeName: mode.modeName,
            libraryDir: mode.libraryDir,
            libraryId: mode.libraryId,
            libraryHash: mode.hash,
            outcomeCount: mode.outcomeCount,
            totalWeight: mode.totalWeight,
            stake,
            generatedAt: mode.generatedAt ?? registry.generatedAt,
            ...(mode.strategy === undefined ? {} : {strategy: mode.strategy}),
            analysis,
            contributions: {line, symbol},
            events,
            ...(featureEvents === undefined ? {} : {featureEvents}),
            ...(featurePayoutsIncluded === undefined ? {} : {featurePayoutsIncluded}),
            ...(freeGamesRtp === undefined ? {} : {freeGamesRtp}),
            ...(featureNote === undefined ? {} : {featureNote}),
            ...(contributionNote === undefined ? {} : {contributionNote}),
            ...(eventNote === undefined ? {} : {eventNote}),
        };
    }
}
