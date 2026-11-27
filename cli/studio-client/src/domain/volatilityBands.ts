export type VolatilityBands = {
    /** Values below this threshold are labelled Low. */
    readonly lowMax: number;
    /** Values at or below this threshold (and at or above lowMax) are labelled Medium. */
    readonly mediumMax: number;
};

export const VOLATILITY_BANDS_STORAGE_KEY = "pokie-studio:volatility-bands:v1";

export type VolatilityBand = "Low" | "Medium" | "High";

function isFiniteNonNegative(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Parses a stored or user-entered pair. The bands are a portfolio convention, not an industry scale:
 * Studio only labels a number when the user explicitly supplies both boundaries.
 */
export function parseVolatilityBands(value: unknown): VolatilityBands | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const candidate = value as {lowMax?: unknown; mediumMax?: unknown};
    if (!isFiniteNonNegative(candidate.lowMax) || !isFiniteNonNegative(candidate.mediumMax)) return undefined;
    if (candidate.mediumMax <= candidate.lowMax) return undefined;
    return {lowMax: candidate.lowMax, mediumMax: candidate.mediumMax};
}

export function describeVolatilityBand(value: number, bands: VolatilityBands | undefined): VolatilityBand | undefined {
    if (bands === undefined || !Number.isFinite(value)) return undefined;
    if (value < bands.lowMax) return "Low";
    if (value <= bands.mediumMax) return "Medium";
    return "High";
}

export function formatVolatilityBands(bands: VolatilityBands): string {
    return `Low < ${bands.lowMax.toFixed(2)} · Medium ${bands.lowMax.toFixed(2)}–${bands.mediumMax.toFixed(2)} · High > ${bands.mediumMax.toFixed(2)}`;
}
