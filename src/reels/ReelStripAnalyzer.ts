import {getCircularGaps} from "./internal/circularGaps.js";
import {getCircularRuns} from "./internal/circularRuns.js";
import type {ReelStripAnalysis} from "./ReelStripAnalysis.js";
import type {ReelStripDefinition} from "./ReelStripDefinition.js";

// Static analysis utilities for any ReelStripDefinition, generated or hand-authored — never
// instantiated, mirrors SymbolsCombinationsAnalyzer's static-only style.
export class ReelStripAnalyzer {
    public static analyze(strip: ReelStripDefinition): ReelStripAnalysis {
        const length = strip.getLength();
        const symbolCounts = strip.getSymbolCounts();
        const symbolFrequencies: Record<string, number> = {};
        for (const [symbolId, count] of Object.entries(symbolCounts)) {
            symbolFrequencies[symbolId] = length === 0 ? 0 : count / length;
        }

        return {
            length,
            symbolCounts,
            symbolFrequencies,
            minimumCircularDistances: ReelStripAnalyzer.getCircularDistances(strip, (gaps) => Math.min(...gaps)),
            maximumCircularDistances: ReelStripAnalyzer.getCircularDistances(strip, (gaps) => Math.max(...gaps)),
            maximumConsecutiveOccurrences: ReelStripAnalyzer.getMaximumConsecutiveOccurrences(strip),
        };
    }

    // Shared by minimumCircularDistances/maximumCircularDistances: both look at the same per-symbol
    // set of gaps between consecutive occurrences (going around the circle) and differ only in how
    // they aggregate them (Math.min vs Math.max).
    private static getCircularDistances(strip: ReelStripDefinition, aggregate: (gaps: number[]) => number): Record<string, number> {
        const length = strip.getLength();
        const symbols = strip.toArray();
        const positionsBySymbol = new Map<string, number[]>();
        symbols.forEach((symbolId, index) => {
            const positions = positionsBySymbol.get(symbolId) ?? [];
            positions.push(index);
            positionsBySymbol.set(symbolId, positions);
        });

        const result: Record<string, number> = {};
        for (const [symbolId, positions] of positionsBySymbol) {
            const gaps = getCircularGaps(positions, length);
            if (gaps.length === 0) {
                continue;
            }
            result[symbolId] = aggregate(gaps.map((gap) => gap.gap));
        }
        return result;
    }

    private static getMaximumConsecutiveOccurrences(strip: ReelStripDefinition): Record<string, number> {
        const result: Record<string, number> = {};
        for (const run of getCircularRuns(strip.toArray())) {
            result[run.symbolId] = Math.max(result[run.symbolId] ?? 0, run.length);
        }
        return result;
    }
}
