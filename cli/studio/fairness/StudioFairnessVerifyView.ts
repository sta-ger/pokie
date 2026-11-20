import type {ValidationIssue} from "@fromstan/pokie";

// FairnessRoundProofVerifier.verify() never throws -- every outcome (a malformed candidate, a missing
// commitment/sourceLibraryDir, a genuine mismatch) already rides on its own ValidationIssue[] output, so
// there is only ever one "ok" shape here; "load-error" exists solely for Studio-local path-resolution
// failures (an out-of-project sourceLibraryDir) that never reach the verifier at all.
export type StudioFairnessVerifyView =
    | {readonly status: "ok"; readonly errors: readonly ValidationIssue[]; readonly warnings: readonly ValidationIssue[]}
    | {readonly status: "load-error"; readonly error: string};
