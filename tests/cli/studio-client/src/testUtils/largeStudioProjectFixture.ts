import type {GameModelProjection, StudioReplayListEntry, StudioSimulationReportListEntry} from "../../../../../cli/studio-client/src/api/types";

// Deliberately bounded production-scale data for UI responsiveness checks: six 300-stop reels,
// 48 symbols, 192 paytable rows, 12 modes, stack metadata, and long persisted-workflow lists.
// It is generated deterministically so tests exercise the real rendering boundary without committing
// a multi-megabyte JSON capture.
export function createLargeGameModelProjection(): GameModelProjection {
    const symbols = Array.from({length: 48}, (_, index) => ({id: `S${String(index).padStart(2, "0")}`, isWild: index === 0, isScatter: index === 1}));
    return {
        basics: {status: "available", data: {id: "large-slot", name: "Large Slot", version: "1.0.0"}},
        layout: {status: "available", data: {reels: 6, rows: 4, winModel: {type: "ways"}}},
        symbols: {status: "available", data: symbols},
        reels: {
            status: "available",
            data: {
                generationMode: "reelStrips",
                gameWindow: {reels: 6, rows: 4, wrapsAround: true, grid: Array.from({length: 6}, () => Array.from({length: 4}, (_, row) => ({symbolId: symbols[row].id, isWild: row === 0, isScatter: row === 1})))},
                reels: Array.from({length: 6}, (_, reelIndex) => ({
                    reelIndex,
                    source: "literal" as const,
                    positions: Array.from({length: 300}, (_, index) => ({
                        index,
                        symbolId: symbols[(index + reelIndex) % symbols.length].id,
                        isWild: (index + reelIndex) % symbols.length === 0,
                        isScatter: (index + reelIndex) % symbols.length === 1,
                        locked: index % 37 === 0,
                        stackSize: index % 17 === 0 ? 3 : 1,
                    })),
                    analysis: {
                        length: 300,
                        symbolCounts: {},
                        symbolFrequencies: {},
                        minimumCircularDistances: {},
                        maximumCircularDistances: {},
                        maximumConsecutiveOccurrences: {},
                    },
                })),
            },
        },
        paytable: {status: "available", data: symbols.flatMap((symbol) => [3, 4, 5, 6].map((matchCount) => ({symbolId: symbol.id, matchCount, payout: matchCount * 2})))},
        betsAndModes: {
            status: "available",
            data: {availableBets: [0.1, 0.2, 0.5, 1, 2, 5], betModes: Array.from({length: 12}, (_, index) => ({id: `mode-${index}`, label: `Mode ${index}`, costMultiplier: index + 1, targetRtp: 0.94 + index / 1000}))},
        },
        mechanics: {status: "available", data: {freeGames: {scatterSymbol: "S01", awardsByCount: {3: 10, 4: 15, 5: 20}}}},
        limits: {status: "available", data: {minBet: 0.1, maxBet: 5}},
    };
}

export function createLongReplayList(): StudioReplayListEntry[] {
    return Array.from({length: 250}, (_, index) => ({id: `replay-${index}`, status: "completed", round: index + 1, seed: `seed-${index}`, completedRounds: index + 1, startedAt: "2026-08-18T00:00:00.000Z", durationMs: 10}));
}

export function createLargeSimulationLibrary(): StudioSimulationReportListEntry[] {
    return Array.from({length: 150}, (_, index) => ({id: `simulation-${index}`, status: "completed", game: {id: "large-slot", version: "1.0.0"}, requestedRounds: 1_000_000, actualRounds: 1_000_000, seed: `seed-${index}`, workers: 4, rtp: 0.96, hitFrequency: 0.3, maxWin: 500, startedAt: "2026-08-18T00:00:00.000Z", completedAt: "2026-08-18T00:01:00.000Z", durationMs: 60_000, hasWarnings: false, modeName: `mode-${index % 12}`}));
}
