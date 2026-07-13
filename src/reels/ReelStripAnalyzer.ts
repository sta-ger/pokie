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
            minimumCircularDistances: ReelStripAnalyzer.getMinimumCircularDistances(strip),
            maximumConsecutiveOccurrences: ReelStripAnalyzer.getMaximumConsecutiveOccurrences(strip),
        };
    }

    private static getMinimumCircularDistances(strip: ReelStripDefinition): Record<string, number> {
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
            result[symbolId] = Math.min(...gaps.map((gap) => gap.gap));
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
