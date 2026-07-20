import type {ValidationIssue} from "pokie";

// A per-mode provenance summary read straight off each loaded WeightedOutcomeLibrary — never recomputed
// or Stake-specific; the same fields StakeEngineManifestModeEntry itself carries, shown *before* a real
// export so the user can see what they're about to send without committing to a write.
export type StudioStakeEngineExportModeSummary = {
    readonly modeName: string;
    readonly cost: number;
    readonly outcomeCount: number;
    readonly libraryId: string;
    readonly libraryHash: string;
};

// POST /api/project/stakeengine/validate's own DTO — the Stake Engine Export tab's "Validate diagnostics"
// step, running the exact same structural/representability validation StakeEngineExporter itself runs
// (and aborts the whole export on) before writing a single file. See
// StudioStakeEngineExportService.validate()'s own doc comment.
export type StudioStakeEngineExportValidateView =
    | {
          readonly status: "ok";
          readonly modes: readonly StudioStakeEngineExportModeSummary[];
          readonly errors: readonly ValidationIssue[];
          readonly warnings: readonly ValidationIssue[];
      }
    | {readonly status: "load-error"; readonly error: string};
