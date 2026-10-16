import type {GameBlueprint} from "../generated/GameBlueprint.js";
import type {MathDefinitionMaxWinPolicy} from "../diff/MathDefinitionDiff.js";
import type {SessionStateSchema} from "../session/SessionStateRestoring.js";
import type {ValidationIssue} from "./ValidationIssue.js";

export type AdvancedCheckStatus = "pass" | "violation" | "unknown";
export type AdvancedValidationStatus = "complete" | "counterexample" | "unsupported" | "budget-exhausted" | "cancelled" | "failed" | "invalid";
export type AdvancedAnalysisLimits = {
    inputNodes: number;
    outcomes: number;
    states: number;
    transitions: number;
    depth: number;
    evidenceNodes: number;
    yieldEvery: number;
};
export type AdvancedValidationCheck = {
    id: string;
    path: string;
    status: AdvancedCheckStatus;
    severity: "error" | "warning" | "info";
    message: string;
    assumptions: string[];
    evidence?: unknown;
};
export type AdvancedModelValidationReport = {
    schemaVersion: 1;
    scope: "declared-model";
    status: AdvancedValidationStatus;
    structuralValid: boolean | null;
    /** Never an assertion about arbitrary executable code. */
    verdict: "proved-within-assumptions" | "violated" | "inconclusive";
    executableFidelity: "declarative-runtime-contract" | "unverified";
    adapter: string;
    declarationAuthority: string;
    supportedChecks: string[];
    termination: "all-path";
    assumptions: string[];
    limitations: string[];
    limits: AdvancedAnalysisLimits;
    work: AdvancedAnalysisLimits;
    issues: ValidationIssue[];
    checks: AdvancedValidationCheck[];
};
export type AdvancedValidationOptions = {limits?: Partial<AdvancedAnalysisLimits>; signal?: AbortSignal};
/** Finite transition declarations contain observations, not executable callbacks. No session is advanced. */
export type DeclaredTransitionModel = {
    kind: "declared-transitions";
    initial: string;
    targets?: string[];
    schema?: SessionStateSchema;
    states: {id: string; terminal?: boolean; state?: Record<string, unknown>}[];
    transitions: {
        from: string;
        to: string;
        weight?: number;
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
        accounting?: {creditsBefore: number; creditsAfter: number; stake: number; payout: number; bet: number; multiplier?: number; continuation?: boolean};
    }[];
};
export type AdvancedBlueprintInput = {kind: "blueprint"; model: GameBlueprint | unknown; maxWinPolicy?: MathDefinitionMaxWinPolicy};
export interface AdvancedModelValidating {
    validate(input: AdvancedBlueprintInput | DeclaredTransitionModel, options?: AdvancedValidationOptions): Promise<AdvancedModelValidationReport>;
}
