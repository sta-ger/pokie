import type {ValidationIssue} from "pokie";

// POST /api/home/blueprints/validate's own DTO — never writes/reads anything, purely
// GameBlueprintValidator.validate() run against whatever blueprint value the editor currently holds.
export type StudioBlueprintValidationView =
    | {status: "ok"; warnings: ValidationIssue[]}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]};
