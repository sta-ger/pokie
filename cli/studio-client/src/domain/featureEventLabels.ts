const FEATURE_EVENT_LABELS: Record<string, string> = {
    freeGamesTriggered: "Free games triggered",
};

function humanizeKey(key: string): string {
    const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").toLowerCase().trim();
    return words.length === 0 ? key : words[0].toUpperCase() + words.slice(1);
}

/** Human-readable feature-event names for math-review surfaces; unknown runtime keys stay visible. */
export function describeFeatureEventLabel(key: string): string {
    return FEATURE_EVENT_LABELS[key] ?? humanizeKey(key);
}
