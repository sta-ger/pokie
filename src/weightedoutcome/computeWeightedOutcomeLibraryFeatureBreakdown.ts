import type {WeightedOutcomeLibrary} from "./WeightedOutcomeLibrary.js";
import type {WeightedOutcomeLibraryFeatureBreakdown, WeightedOutcomeLibraryFeatureBreakdownEntry} from "./WeightedOutcomeLibraryFeatureBreakdown.js";

// A weighted-frequency view of *what* a draw from this library actually contains -- which bet modes
// appear, and which feature events (e.g. "freeGamesTriggered") show up at least once in a round -- built
// entirely from fields RoundArtifact already carries (betMode, featureEvents[].type). No second win/RTP
// calculation happens here; that stays exclusively in WeightedOutcomeLibraryAnalyzer. A feature event
// firing on more than one step of the same round still counts once for that outcome (a round either
// contains it or it doesn't), never once per occurrence.
export function computeWeightedOutcomeLibraryFeatureBreakdown<T extends string | number = string>(
    library: WeightedOutcomeLibrary<T>,
): WeightedOutcomeLibraryFeatureBreakdown {
    const totalWeight = library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
    const betModeTally = new Map<string, {weight: number; count: number}>();
    const featureEventTally = new Map<string, {weight: number; count: number}>();

    library.outcomes.forEach((outcome) => {
        tally(betModeTally, outcome.artifact.betMode, outcome.weight);
        const eventTypes = new Set((outcome.artifact.featureEvents ?? []).map((event) => event.type));
        eventTypes.forEach((type) => tally(featureEventTally, type, outcome.weight));
    });

    return {
        betModes: toEntries(betModeTally, totalWeight),
        featureEvents: toEntries(featureEventTally, totalWeight),
    };
}

function tally(map: Map<string, {weight: number; count: number}>, key: string, weight: number): void {
    const entry = map.get(key) ?? {weight: 0, count: 0};
    entry.weight += weight;
    entry.count += 1;
    map.set(key, entry);
}

function toEntries(map: Map<string, {weight: number; count: number}>, totalWeight: number): WeightedOutcomeLibraryFeatureBreakdownEntry[] {
    return [...map.entries()]
        .map(([key, {weight, count}]) => ({
            key,
            weightedFrequency: totalWeight > 0 ? weight / totalWeight : 0,
            outcomeCount: count,
        }))
        .sort((a, b) => a.key.localeCompare(b.key));
}
