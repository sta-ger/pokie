// One mode to sample evidence for, from an already-built Outcome Library Bundle — "seed" drives a
// SeededWeightedOutcomeRandomSource, so the exact same input always reproduces the exact same
// CertificationEvidenceSampleRecord sequence for this mode.
export type CertificationEvidenceBundleModeSampleInput = {
    readonly modeName: string;
    readonly seed: string;
    readonly sampleCount: number;
};
