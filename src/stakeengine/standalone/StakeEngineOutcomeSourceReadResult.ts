import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {StakeEngineStandaloneMode} from "./StakeEngineStandaloneMode.js";

// The outcome of reading and normalizing a candidate Stake Engine outcome directory. Same all-or-nothing
// discipline as StakeEngineImportResult: on any error-level issue -- structural or per-outcome -- "modes" is
// empty and every issue actually found is in "issues", so a caller (or StakeEngineStandaloneAnalyzer) can never
// silently compute weighted statistics over a partially-corrupted read.
export type StakeEngineOutcomeSourceReadResult = {
    readonly stakeDir: string;
    readonly modes: readonly StakeEngineStandaloneMode[];
    readonly issues: readonly ValidationIssue[];
};
