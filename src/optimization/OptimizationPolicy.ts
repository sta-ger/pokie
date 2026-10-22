/** All numeric metrics use IEEE-754 binary64 over the explicitly selected population. */
export type MathTarget = {
    metric: "rtp" | "volatility" | "hitFrequency" | "featureFrequency" | "distribution" | "maxWin";
    unit: "ratio" | "variance" | "standardDeviation" | "currency" | "betMultiple";
    value: number;
    tolerance?: {kind: "absolute" | "relative"; value: number};
    /** Feature identity: at least one matching event per selected outcome. */
    event?: string;
    /** Half-open payout-multiple bucket [min,max), with null meaning infinity. */
    bucket?: {min: number; max: number | null};
};
export type OptimizationScalar = number | string;
export type OptimizationPolicy = {
    strategy: "exact-finite-v1" | "seeded-search-v1";
    seed: string;
    /** Required only for seeded-search-v1. All budgets count observations, never time. */
    sampling?: OptimizationSamplingPolicy;
    /** One unit per attempted candidate, including constraint rejection and native readback. */
    budget: number;
    /** Separate deterministic cap on exact runtime reel-stop enumeration per candidate. */
    maxOutcomes: number;
    mode: string;
    stake: number;
    scope: "paid-entry" | "logical-round" | "native-outcomes";
    tunables: {path: string; values: OptimizationScalar[]}[];
    locks: string[];
    protectedFiles?: string[];
    constraints?: {
        fixed?: {path: string; value: OptimizationScalar}[];
        sums?: {paths: string[]; value: OptimizationScalar}[];
        counts?: {path: string; scope: "outcomes" | "symbols" | "variants"; value: number}[];
        maxWin?: {value: number; unit: "currency" | "betMultiple"};
    };
};
export type OptimizationRequest = {targets: MathTarget[]; policy: OptimizationPolicy};
export type OptimizationStatus =
    | "attained"
    | "inconclusive"
    | "success"
    | "infeasible"
    | "invalid"
    | "unsupported"
    | "exhausted"
    | "cancelled"
    | "failure";
export type OptimizationDiagnostic = {path: string; message: string};
/** Live exact-evaluation telemetry; never authority for a candidate or publication. */
export type OptimizationWorkProgress = {
    stage: "Enumerating reel stops" | "Materializing outcomes" | "Verifying executable";
    current: string;
    /** Absent when deduplicated outcome population is not yet known. */
    total?: string;
    unit: "raw draws" | "outcomes" | "checks";
};
export type OptimizationEvidence = {
    work?: OptimizationWorkProgress;
    phase?: "preparing" | "search" | "assessment" | "finalizing";
    stopReason?: "domain-complete" | "candidate-budget" | "search-budget" | "assessment-budget" | "assessment-complete" | "no-valid-candidate";
    stochastic?: {
        policyVersion: "bounded-hoeffding-bonferroni-v1";
        ordering: "seeded-affine-cartesian-v1;first-minimum-score";
        seedDerivation: "JSON([seed,phase,attempt]); worker seeds use WorkerSeedStrategy";
        workers: number;
        searchSamples: number;
        assessmentSamples: number;
        validationWork: number;
        searchStopReason?: OptimizationEvidence["stopReason"];
        modelRevision: string;
        executableRevision?: string;
        fitness?: number;
        assessment?: OptimizationSampleEvidence;
    };
    version: 1;
    sourceRevision: string;
    adapter: string;
    strategy: "exact-finite-v1" | "seeded-search-v1";
    request: OptimizationRequest;
    domainSize: string;
    evaluated: number;
    rejected: number;
    consumedWork: number;
    exhaustive: boolean;
    numericRepresentation: "IEEE-754 binary64 moments; native integer weights preserved";
    evaluations?: {
        parameters: Record<string, OptimizationScalar>;
        measured?: number[];
        seed?: string;
        samples?: number;
        fitness?: number;
        verdict: "constraint-rejected" | "target-missed" | "selected" | "evaluated";
    }[];
    diff?: {path: string; before: OptimizationScalar; after: OptimizationScalar}[];
    definitionDiff?: Pick<import("../diff/MathDefinitionDiff.js").MathDefinitionDiff, "status" | "scope" | "changes">;
    selected?: Record<string, OptimizationScalar>;
    measured?: number[];
    constraintChecks?: string[];
    outputValidation?: string;
};
export type OptimizationCandidate = {
    path: string;
    type: import("../project/ProjectType.js").ProjectType;
    revision: string;
    sourcePath: string;
    sourceRevision: string;
    requestRevision: string;
    /** Declared package executable dependency identity reviewed with this candidate. */
    executableRevision?: string;
    /** Detached workspace, owned by this candidate until discard. */
    workspace: string;
};
export type OptimizationResult = {
    status: OptimizationStatus;
    diagnostics: OptimizationDiagnostic[];
    evidence?: OptimizationEvidence;
    candidate?: OptimizationCandidate;
    output?: {path: string; revision: string; type: import("../project/ProjectType.js").ProjectType};
};
export interface ProjectOptimizing {
    optimize(
        project: import("../project/PokieProject.js").PokieProject,
        request: unknown,
        options?: OptimizationOptions,
    ): Promise<OptimizationResult>;
}
export type OptimizationOptions = {
    /** Optional worker entry for embedders; use the packaged entry by default. */
    workerEntryUrl?: URL;
    isCurrent?: () => boolean;
    signal?: AbortSignal;
    onProgress?: (evidence: OptimizationEvidence) => void;
    /** Synchronous notification after authored commit and receipt consumption, before yielding. */
    onAuthoredCommit?: () => void;
};

export type OptimizationSamplingPolicy = {
    searchSamples: number;
    searchBudget: number;
    assessmentSamples: number;
    minSamples: number;
    minEventCount: number;
    confidence: number;
    chunkSize: number;
    workers: number;
};
export type OptimizationSampleEvidence = {
    authority: "sampled-bounded";
    population: {scope: OptimizationPolicy["scope"]; paidEntries?: number; completedLogicalRounds?: number; nativeOutcomes?: number};
    seed: string;
    requestedSamples: number;
    actualSamples: number;
    stopReason: string;
    returnBound: number;
    estimates: number[];
    targets: {
        observations: number;
        successes: number;
        failures: number;
        estimate: number;
        confidence: {low: number; high: number};
        toleranceRegion: {low: number; high: number};
        verdict: "attained" | "inconclusive" | "missed";
        reason: string;
    }[];
};
