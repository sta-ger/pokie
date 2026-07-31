import type {OutcomeLibraryGeneratorDiagnostics, ValidationIssue} from "pokie";
import type {OutcomeLibrarySelector} from "./OutcomeLibrarySelector.js";

// The Studio Generate step's own result: unlike "pokie outcomelibrary generate" (which only ever writes a
// single, unwrapped WeightedOutcomeLibrary JSON file via --out), a successful Studio generate() call always
// goes one step further and writes straight into the project's own canonical outcome-library bundle (see
// StudioOutcomeLibraryGenerateService.generate) -- so this view carries everything the CLI's own "generate"
// (diagnostics/seed) AND "build" (path/files/validation/hash) verbs report separately, in one place, plus a
// ready-to-use `selector` a caller can hand straight to select()/compare()/the Runtime tab without the user
// re-typing anything.
export type StudioOutcomeLibraryGenerateResultView =
    | {
          readonly status: "ok";
          readonly bundleDir: string; // project-relative
          readonly files: readonly string[];
          readonly warnings: readonly ValidationIssue[];
          readonly mode: {
              readonly modeName: string;
              readonly libraryId: string;
              readonly hash: string;
              readonly outcomeCount: number;
              readonly totalWeight: number;
              readonly rtp: number;
          };
          // Generator/algorithm/seed/build provenance for this run, copied verbatim from
          // generateExactWeightedOutcomeLibrary's own result -- never recomputed here.
          readonly generator: OutcomeLibraryGeneratorDiagnostics;
          // sampledRawCount / totalOutcomeSpaceSize as a plain 0..1 fraction -- always 1 for an "exact"
          // strategy (every reachable reel-stop tuple was swept), less than 1 for "bounded-coverage".
          // Derived purely for display; the authoritative numbers are still generator's own fields.
          readonly coverage: number;
          // Chains straight into the existing Select/import -> Validate & analyze -> Inspect -> Compare or
          // use workflow (see OutcomeLibrariesTab) -- Inspect, Validate/analyze, and "serve pre-generated
          // outcomes" (Use in runtime) are all already built on a bundle OutcomeLibrarySelector, so this
          // step never needs its own parallel versions of them.
          readonly selector: OutcomeLibrarySelector;
      }
    | {readonly status: "unsupported"; readonly error: string}
    | {readonly status: "generation-error"; readonly code: string; readonly error: string}
    // The write itself failed validation (e.g. this mode's provenance doesn't match another mode already
    // in the bundle) -- the generated outcomes were never persisted, mirroring the writer's own "no
    // partial bundle" guarantee.
    | {readonly status: "invalid"; readonly errors: readonly ValidationIssue[]; readonly warnings: readonly ValidationIssue[]}
    | {readonly status: "load-error"; readonly error: string};
