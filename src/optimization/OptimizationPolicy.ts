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
    strategy: "exact-finite-v1";
    seed: string;
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
    | "success"
    | "infeasible"
    | "invalid"
    | "unsupported"
    | "exhausted"
    | "cancelled"
    | "failure";
export type OptimizationDiagnostic = {path: string; message: string};
export type OptimizationEvidence = {
    version: 1;
    sourceRevision: string;
    adapter: string;
    strategy: "exact-finite-v1";
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
        verdict: "constraint-rejected" | "target-missed" | "selected";
    }[];
    diff?: {path: string; before: OptimizationScalar; after: OptimizationScalar}[];
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
    isCurrent?: () => boolean;
    signal?: AbortSignal;
    onProgress?: (evidence: OptimizationEvidence) => void;
};
