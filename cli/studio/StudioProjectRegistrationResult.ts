import type {StudioProjectRegistryView} from "./StudioProjectRegistryView.js";

// The outcome of StudioProjectRegistrationService.registerManaged/registerExternal — "unrecognized" (never
// a thrown error a caller has to catch) is an ordinary, expected outcome of pointing registration at an
// arbitrary path ProjectResolving doesn't recognize as any known ProjectType, not a failure a caller
// needs to treat as exceptional.
export type StudioProjectRegistrationResult = {readonly status: "ok"; readonly entry: StudioProjectRegistryView} | {readonly status: "unrecognized"; readonly path: string};
