import type {ProjectCapability} from "./ProjectCapability.js";
import type {ProjectType} from "./ProjectType.js";
import type {PokieOperation} from "./PokieOperation.js";

// What describeUnsupportedProjectOperation returns for an operation a resolved PokieProject can't perform —
// names every fact a caller needs to explain the failure to a user and point them at a fix, rather than
// surfacing a bare "operation not supported" string: which type was actually detected, which operation was
// attempted, which single capability was missing, and which other project types (if any) already support it.
export type UnsupportedProjectOperationDiagnostic = {
    readonly detectedType: ProjectType;
    readonly operation: PokieOperation;
    readonly missingCapability: ProjectCapability;
    // Other ProjectType values whose PROJECT_TYPE_CAPABILITIES already grants missingCapability — empty when
    // no project type supports this operation yet (e.g. every "wasm.export" attempt today; see
    // ProjectType.ts's "wasm" doc comment).
    readonly alternatives: readonly ProjectType[];
    /**
     * The actionable part of `message`, exposed independently so CLI, Studio,
     * and evidence writers never need to split or reword a human diagnostic.
     */
    // Optional for backwards-compatible diagnostic objects supplied by
    // embedders; describeUnsupportedProjectOperation itself always provides it.
    readonly recovery?: string;
    readonly message: string;
};
