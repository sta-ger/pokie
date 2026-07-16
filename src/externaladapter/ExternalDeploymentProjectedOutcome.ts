import type {JsonObject} from "../json/JsonValue.js";

// One outcome, already projected by the target's own ExternalRoundProjector — what an ExternalArtifactGenerator
// actually receives, never a raw RoundArtifact. "id"/"weight" are carried over unchanged from the source
// WeightedOutcome (see ExternalDeploymentProjectedModeInput's own doc comment for why projection, not
// generation, is where that carry-over happens); "projected" is exactly whatever
// `target.roundProjector.project(outcome.artifact)` returned, already confirmed canonical-JSON-safe by
// ExternalDeploymentService before a generator ever sees it.
export type ExternalDeploymentProjectedOutcome = {
    readonly id: string;
    readonly weight: number;
    readonly projected: JsonObject;
};
