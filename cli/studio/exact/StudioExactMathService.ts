import {OutcomeLibraryFolderReader, type OutcomeLibraryFolderReading, type WeightedOutcomeLibrary, type WeightedOutcomeLibraryAnalysis} from "@fromstan/pokie";
import type {StudioOutcomeLibraryRegistryView} from "../outcomeLibrary/StudioOutcomeLibraryRegistryView.js";
import {resolveProjectDirectory} from "../outcomeLibrary/resolveProjectDirectory.js";
import type {StudioExactMathContribution, StudioExactMathContributionTable, StudioExactMathView} from "./StudioExactMathView.js";

// Reading every retained outcome is only needed for the line/symbol breakdown; the exact headline
// metrics and payout distribution are already embedded in the bundle's mode index. A very large
// library should still open quickly and truthfully show the exact metrics even when a full scan is
// intentionally skipped.
const MAX_CONTRIBUTION_OUTCOMES = 25_000;
const MAX_CONTRIBUTION_ROWS = 40;

type ContributionTally = {
    symbolId?: string;
    rtpContribution: number;
    hitWeight: number;
    outcomeCount: number;
};

/**
 * Reads the exact analysis of a compatible Outcome Library for the current saved design and augments it
 * with per-line and per-symbol contributions computed from the library's retained RoundRecords.
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
        let contributionNote: string | undefined;
        if (mode.outcomeCount > MAX_CONTRIBUTION_OUTCOMES) {
            contributionNote = `This library has ${mode.outcomeCount.toLocaleString("en-US")} outcomes. Exact metrics and the payout distribution are shown from its index; per-line and per-symbol contributions were skipped because loading every outcome would be too expensive here.`;
        } else {
            try {
                const library = await this.reader.readLibrary(resolved.resolvedPath, mode.modeName);
                const contributions = computeContributions(library);
                line = contributions.line;
                symbol = contributions.symbol;
                if (line.truncated || symbol.truncated) {
                    contributionNote = `Contributions are limited to the ${MAX_CONTRIBUTION_ROWS} largest rows in each table. The library itself remains complete.`;
                }
            } catch (error) {
                contributionNote = `Exact metrics and the payout distribution are available from the library index, but per-line/symbol contributions could not be read: ${error instanceof Error ? error.message : String(error)}`;
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
            ...(contributionNote === undefined ? {} : {contributionNote}),
        };
    }
}

function computeContributions(
    library: WeightedOutcomeLibrary<string>,
): {line: StudioExactMathContributionTable; symbol: StudioExactMathContributionTable} {
    const totalWeight = library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
    const lineTallies = new Map<string, ContributionTally>();
    const symbolTallies = new Map<string, ContributionTally>();

    for (const outcome of library.outcomes) {
        const share = outcome.weight / totalWeight;
        const stake = outcome.record.stake;
        const seenLines = new Set<string>();
        const seenSymbols = new Set<string>();
        for (const step of outcome.record.steps) {
            for (const win of step.wins) {
                const symbolId = win.symbolId === null || win.symbolId === undefined ? undefined : String(win.symbolId);
                const rtp = (share * win.winAmount) / stake;
                if (win.type === "line") {
                    const key = `line:${win.id}:${symbolId ?? ""}`;
                    const tally = lineTallies.get(key) ?? {symbolId, rtpContribution: 0, hitWeight: 0, outcomeCount: 0};
                    tally.rtpContribution += rtp;
                    if (!seenLines.has(key)) {
                        tally.hitWeight += share;
                        tally.outcomeCount++;
                        seenLines.add(key);
                    }
                    lineTallies.set(key, tally);
                }
                let symbolKey: string | undefined;
                if (symbolId !== undefined) {
                    symbolKey = `symbol:${symbolId}`;
                } else if (win.type !== "line") {
                    symbolKey = `symbol:${win.type}:${win.id}`;
                }
                if (symbolKey !== undefined) {
                    const tally = symbolTallies.get(symbolKey) ?? {symbolId, rtpContribution: 0, hitWeight: 0, outcomeCount: 0};
                    tally.rtpContribution += rtp;
                    if (!seenSymbols.has(symbolKey)) {
                        tally.hitWeight += share;
                        tally.outcomeCount++;
                        seenSymbols.add(symbolKey);
                    }
                    symbolTallies.set(symbolKey, tally);
                }
            }
        }
    }

    return {
        line: toContributionTable(lineTallies, "line"),
        symbol: toContributionTable(symbolTallies, "symbol"),
    };
}

function toContributionTable(
    tallies: ReadonlyMap<string, ContributionTally>,
    kind: "line" | "symbol",
): StudioExactMathContributionTable {
    const entries: StudioExactMathContribution[] = [...tallies.entries()].map(([key, tally]) => {
        let label: string;
        if (kind === "line") {
            const lineId = key.split(":")[1];
            label = tally.symbolId === undefined ? `Line ${lineId}` : `Line ${lineId} · ${tally.symbolId}`;
        } else {
            label = tally.symbolId ?? key.replace(/^symbol:/, "");
        }
        return {
            kind,
            key,
            label,
            ...(tally.symbolId === undefined ? {} : {symbolId: tally.symbolId}),
            rtpContribution: tally.rtpContribution,
            hitFrequency: tally.hitWeight,
            outcomeCount: tally.outcomeCount,
        };
    });
    entries.sort((left, right) => right.rtpContribution - left.rtpContribution);
    return {entries: entries.slice(0, MAX_CONTRIBUTION_ROWS), truncated: entries.length > MAX_CONTRIBUTION_ROWS};
}
