import type {FormatConversionPlan, StakeEngineManifest, ValidationIssue} from "@fromstan/pokie";

// POST /api/project/stakeengine/export's own DTO — mirrors the planner's no-overwrite destination
// contract exactly. A conflict is terminal for this prepared plan; callers must choose a new output
// directory and prepare a new plan rather than attempting a writer-specific recovery.
export type StudioStakeEngineExportView =
    | {
          readonly status: "ok";
          readonly outDir: string;
          readonly files: readonly string[];
          readonly manifest: StakeEngineManifest;
          readonly warnings: readonly ValidationIssue[];
          readonly plan: FormatConversionPlan;
      }
    | {readonly status: "conflict"; readonly outDir: string; readonly overwritable: boolean; readonly error: string; readonly plan: FormatConversionPlan}
    | {readonly status: "unavailable"; readonly error: string; readonly plan: FormatConversionPlan}
    | {readonly status: "invalid"; readonly errors: readonly ValidationIssue[]; readonly warnings: readonly ValidationIssue[]; readonly plan: FormatConversionPlan}
    | {readonly status: "cancelled"; readonly message: string; readonly plan: FormatConversionPlan}
    | {readonly status: "load-error"; readonly error: string; readonly plan: FormatConversionPlan};
