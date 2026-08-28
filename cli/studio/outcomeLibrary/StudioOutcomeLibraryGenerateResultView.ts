import type {ArtifactConversionPlan, OutcomeLibraryGeneratorDiagnostics, ValidationIssue} from "pokie";
import type {OutcomeLibrarySelector} from "./OutcomeLibrarySelector.js";

// The Studio Generate step's own result: unlike "pokie outcomelibrary generate" (which only ever writes a
// single, unwrapped WeightedOutcomeLibrary JSON file via --out), a successful Studio generate() call always
// goes one step further and writes straight into the project's own canonical outcome-library bundle (see
// StudioOutcomeLibraryGenerateService.generate) -- so this view carries everything the CLI's own "generate"
// (diagnostics/seed) AND "build" (path/files/validation/hash) verbs report separately, in one place, plus a
// ready-to-use `selector` a caller can hand to any other Studio flow that resolves an outcome library
// (e.g. a Deployment mode's own librarySelector) without the user re-typing anything.
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
          // A ready-to-use OutcomeLibrarySelector pointing at the bundle mode this run just wrote, so a
          // later step that needs to select it (e.g. a Deployment mode's own librarySelector) never needs
          // its own parallel version of it.
          readonly selector: OutcomeLibrarySelector;
          /** The server-selected prerequisite/publication decision for this action. */
          readonly plan?: ArtifactConversionPlan;
      }
    | {readonly status: "unsupported"; readonly error: string; readonly plan?: ArtifactConversionPlan}
    | {readonly status: "conflict"; readonly error: string; readonly plan: ArtifactConversionPlan}
    | {readonly status: "generation-error"; readonly code: string; readonly error: string; readonly plan?: ArtifactConversionPlan}
    // The write itself failed validation (e.g. this mode's provenance doesn't match another mode already
    // in the bundle) -- the generated outcomes were never persisted, mirroring the writer's own "no
    // partial bundle" guarantee.
    | {readonly status: "invalid"; readonly errors: readonly ValidationIssue[]; readonly warnings: readonly ValidationIssue[]; readonly plan?: ArtifactConversionPlan}
    | {readonly status: "load-error"; readonly error: string; readonly plan?: ArtifactConversionPlan};
