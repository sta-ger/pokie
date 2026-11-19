// One mode to sample evidence for, from an already-built Outcome Library Bundle — "seed" drives a
// SeededWeightedOutcomeRandomSource, so the exact same input always reproduces the exact same
// CertificationPackSampleRecord sequence for this mode.
export type CertificationPackModeSampleInput = {
    readonly modeName: string;
    readonly seed: string;
    readonly sampleCount: number;
};
