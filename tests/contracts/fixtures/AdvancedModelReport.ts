import type {AdvancedModelValidationReport} from "../../../src/validation/AdvancedModelValidation.js";

/** Serializer/render fixture only; never evidence that model analysis completed. */
export function advancedUnknownReport(): AdvancedModelValidationReport {
    return {
        schemaVersion: 1, scope: "declared-model", status: "budget-exhausted", structuralValid: true,
        verdict: "inconclusive", executableFidelity: "unverified", adapter: "fixture", declarationAuthority: "Fixture declaration", supportedChecks: [], termination: "all-path",
        assumptions: ["Declared initial state"], limitations: ["Unfinished frontier"], issues: [],
        limits: {inputNodes: 100, outcomes: 10, outcomeCells: 100, states: 10, transitions: 10, depth: 10, evidenceNodes: 100, yieldEvery: 1},
        work: {inputNodes: 10, outcomes: 10, outcomeCells: 100, states: 4, transitions: 10, depth: 2, evidenceNodes: 4, yieldEvery: 0},
        checks: [{id: "termination.unresolved", path: "mechanics.respins", status: "unknown", severity: "warning", message: "Unfinished respin frontier", assumptions: ["Declared initial state"], evidence: {frontier: ["respin-2"]}}],
    };
}
