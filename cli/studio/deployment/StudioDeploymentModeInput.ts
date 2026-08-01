import type {OutcomeLibrarySelector} from "../outcomeLibrary/OutcomeLibrarySelector.js";

// One mode entry of a POST /api/project/deployment/runs request body — "librarySelector" is the exact
// same OutcomeLibrarySelector the Outcome Libraries tab's own Select/Compare/Generate steps already use
// (a plain JSON file, one mode of a canonical outcome-library bundle, or one mode of a Stake Engine
// export), resolved and read server-side (see loadOutcomeLibraryFromSelector) rather than the client ever
// sending a whole WeightedOutcomeLibrary inline: Studio operates on a project directory the same way
// every other Project Dashboard feature does (Inspect/Validate/Simulate/Replay all take a path/selector,
// never a blob). Sharing the selector vocabulary (instead of Deployment's own flat libraryPath-only
// shape) is what lets a deployment mode row discover and deploy straight from a bundle the Outcome
// Libraries registry already found compatible, not only a hand-typed flat JSON file.
export type StudioDeploymentModeInput = {
    readonly modeName: string;
    readonly librarySelector: OutcomeLibrarySelector;
};
