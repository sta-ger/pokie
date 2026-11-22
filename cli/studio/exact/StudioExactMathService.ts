import {OutcomeLibraryFolderReader, analyzeWeightedOutcomeWins, type OutcomeLibraryFolderReading, type WeightedOutcomeLibraryAnalysis} from "@fromstan/pokie";
import type {StudioOutcomeLibraryRegistryView} from "../outcomeLibrary/StudioOutcomeLibraryRegistryView.js";
import {resolveProjectDirectory} from "../outcomeLibrary/resolveProjectDirectory.js";
import type {StudioExactMathContributionTable, StudioExactMathEventTable, StudioExactMathView} from "./StudioExactMathView.js";

// Reading every retained outcome is only needed for the line/symbol breakdown; the exact headline
// metrics and payout distribution are already embedded in the bundle's mode index. A very large
// library should still open quickly and truthfully show the exact metrics even when a full scan is
// intentionally skipped.
const MAX_CONTRIBUTION_OUTCOMES = 25_000;

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
                message: "No exact Outcome Library exists for this saved design yet. Compute it once to replace a sampled estimate with exact RTP, payout probabilities and line/symbol contributions.",
            };
        }

        const compatible = registry.modes.filter((mode) => mode.buildStatus === "compatible");
        const mode = compatible.find((candidate) => candidate.modeName === "base") ?? compatible[0];
        if (mode === undefined) {
            return {
                status: "stale",
                message: "An Outcome Library exists, but it was computed from a different saved design or POKIE version. Recompute it before treating its numbers as exact for the current design.",
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
                return {status: "error", message: `The Outcome Library manifest does not contain mode "${mode.modeName}".`};
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
        if (mode.outcomeCount > MAX_CONTRIBUTION_OUTCOMES) {
            const skip = `This library has ${mode.outcomeCount.toLocaleString("en-US")} outcomes. Exact metrics and the payout distribution are shown from its index; per-line, per-symbol and per-event detail was skipped because loading every outcome would be too expensive here.`;
            contributionNote = skip;
            eventNote = skip;
        } else {
            try {
                const library = await this.reader.readLibrary(resolved.resolvedPath, mode.modeName);
                const winAnalysis = analyzeWeightedOutcomeWins(library);
                line = winAnalysis.line;
                symbol = winAnalysis.symbol;
                events = winAnalysis.events;
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
            ...(contributionNote === undefined ? {} : {contributionNote}),
            ...(eventNote === undefined ? {} : {eventNote}),
        };
    }
}
