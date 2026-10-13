/** Complete ordered alternative; IDs are case-sensitive and local to a reel. */
export type WeightedSequenceVariant<T extends string | number | symbol = string> = {
    readonly id: string;
    readonly symbols: readonly T[];
    readonly weight: number;
};

export type ReelSequenceSelection = {readonly reelIndex: number; readonly variantId: string; readonly context: string};
export type ReelSequenceStatistics = {
    readonly reelIndex: number;
    readonly context: "logical-round";
    readonly model: string;
    readonly selections: number;
    readonly variants: readonly {readonly id: string; readonly weight: number; readonly probability: number; readonly probabilityRatio?: {readonly numerator: string; readonly denominator: string}; readonly count: number; readonly frequency: number; readonly uncovered: boolean}[];
};

export function describeSequenceVariantCoverage(weight: number, uncovered: boolean): "zero weight" | "uncovered" | "observed" {
    if (weight === 0) return "zero weight";
    return uncovered ? "uncovered" : "observed";
}
