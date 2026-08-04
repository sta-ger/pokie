import type {ValidationIssue} from "../../validation/ValidationIssue.js";

// What assessWasmComponentCompatibility returns -- "compatible" is the single fact a caller (WasmProjectTargetAdapter,
// a future execution backend) actually branches on; "issues" always explains why when it's false (either
// PokieWasmComponentManifestValidator's own shape issues, or a schemaVersion mismatch), and stays empty when
// true.
export type WasmComponentCompatibilityDiagnostic = {
    readonly compatible: boolean;
    readonly issues: readonly ValidationIssue[];
};
