// Plain code-point comparison (not localeCompare, which can vary by locale/ICU version) — the canonical id
// order needs to be identical everywhere a WeightedOutcomeLibrary might be built or validated, not just
// consistent within one machine. Shared between buildWeightedOutcomeLibrary (which sorts by this) and
// WeightedOutcomeLibraryValidator (which checks outcomes are already in this order).
export function compareIds(a: string, b: string): number {
    if (a < b) {
        return -1;
    }
    if (a > b) {
        return 1;
    }
    return 0;
}
