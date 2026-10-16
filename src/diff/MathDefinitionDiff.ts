import type {AdvancedModelValidationReport} from "../validation/AdvancedModelValidation.js";
import type {GameBlueprint} from "../generated/GameBlueprint.js";
import type {PackageExtractionField} from "../generated/PackageBlueprintExtraction.js";

export type DefinitionJson = null | boolean | number | string | DefinitionJson[] | {[key: string]: DefinitionJson};
/** A declaration at the comparison boundary. It never installs a runtime payout cap. */
export type MathDefinitionMaxWinPolicy =
    | {type: "none"; authority: string; scope: "logical-round" | "paid-entry"}
    | {type: "unknown"; authority: string}
    | {
          type: "declared";
          value: number;
          unit: "currency" | "bet-multiple";
          scope: "logical-round" | "paid-entry";
          authority: string;
      };
export type MathDefinitionDiagnostic = {
    code: string;
    severity: "error" | "warning" | "info" | "suggestion";
    path: string;
    message: string;
};
export type MathDefinitionProvenance = {
    authority: string;
    status: "authored" | "effective" | "defaulted" | "unknown";
    authored: {present: false} | {present: true; value: DefinitionJson};
};
export type MathDefinitionValue = ({present: false} | {present: true; value: DefinitionJson}) & {
    provenance: MathDefinitionProvenance;
};
export type MathDefinitionSnapshot = {
    advanced?: AdvancedModelValidationReport;
    identity: {
        kind: string;
        location?: string;
        gameId?: string;
        gameVersion?: string;
        descriptorVersion?: number;
        descriptorKind?: "generated" | "custom" | "legacy";
        revision?: string;
        blueprintSchemaVersion?: number;
    };
    support: "complete" | "partial" | "unsupported" | "invalid" | "failed" | "cancelled";
    authored?: DefinitionJson;
    effective?: DefinitionJson;
    fields: PackageExtractionField[];
    diagnostics: MathDefinitionDiagnostic[];
    limits: string[];
};
export type MathDefinitionChange = {
    /** RFC 6901 JSON Pointer, rooted at the effective model (or authored model for representation changes). */
    path: string;
    classification: "mathematical" | "representation" | "provenance" | "order" | "validation";
    mathematical: boolean;
    seededTraceImpact: boolean;
    context?: {before: Record<string, string | number>; after: Record<string, string | number>};
    before: MathDefinitionValue;
    after: MathDefinitionValue;
};
export interface MathDefinitionDiff {
    schemaVersion: 1;
    comparisonKind: "math-definition";
    status: "identical" | "different" | "partial" | "unsupported" | "invalid" | "failed" | "cancelled";
    scope: "declared-effective-model";
    left: MathDefinitionSnapshot;
    right: MathDefinitionSnapshot;
    changes: MathDefinitionChange[];
}
export interface MathDefinitionDiffing {
    diff(left: MathDefinitionSnapshot, right: MathDefinitionSnapshot): MathDefinitionDiff;
}
export type MathDefinitionBlueprintInput = {
    kind: "blueprint";
    model: GameBlueprint | unknown;
    location?: string;
    maxWinPolicy?: MathDefinitionMaxWinPolicy;
};
