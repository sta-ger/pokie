import type {RandomGameBlueprintRequest} from "./RandomGameBlueprintRequest.js";
import type {RandomGameBlueprintResult} from "./RandomGameBlueprintResult.js";

export interface RandomGameBlueprintGenerating {
    // "request.seed", when given, always produces the same blueprint; omit it for a fresh one every
    // call (the seed actually used comes back either way -- see RandomGameBlueprintResult).
    generate(request?: RandomGameBlueprintRequest): RandomGameBlueprintResult;
}
