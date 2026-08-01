import {
    BLUEPRINT_BUILD_CAPABILITY,
    OUTCOME_LIBRARY_READ_CAPABILITY,
    PAR_WORKBOOK_EXCHANGE_CAPABILITY,
    RUNTIME_EXECUTE_CAPABILITY,
    STAKE_ADAPTER_EXCHANGE_CAPABILITY,
    type ProjectCapability,
} from "./ProjectCapability.js";
import type {ProjectType} from "./ProjectType.js";

// The fixed set of ProjectCapability ids a resolved PokieProject carries — resolved once, by
// PROJECT_TYPE_CAPABILITIES below, and stamped onto the PokieProject instance itself (see PokieProject.ts) so
// a downstream consumer reads capabilities off the resolved project rather than re-deriving them from "type"
// a second time.
export type ProjectCapabilities = readonly ProjectCapability[];

// The one place that decides which ProjectCapability each ProjectType grants — every other file in this
// module (a future ProjectResolving implementation stamping a resolved PokieProject,
// describeUnsupportedProjectOperation when it looks for an alternative type) reads this map rather than
// re-deciding "does this type support that capability" independently. "wasm" deliberately maps to an empty
// array — see ProjectType.ts's own doc comment on that entry.
export const PROJECT_TYPE_CAPABILITIES: Readonly<Record<ProjectType, ProjectCapabilities>> = {
    blueprint: [BLUEPRINT_BUILD_CAPABILITY],
    tsPackage: [RUNTIME_EXECUTE_CAPABILITY],
    outcomeLibrary: [OUTCOME_LIBRARY_READ_CAPABILITY],
    stakeAdapter: [STAKE_ADAPTER_EXCHANGE_CAPABILITY],
    wasm: [],
    parWorkbook: [PAR_WORKBOOK_EXCHANGE_CAPABILITY],
};
