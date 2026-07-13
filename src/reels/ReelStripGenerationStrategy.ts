import type {RandomNumberGenerating} from "../session/videoslot/combinations/RandomNumberGenerating.js";
import type {ReelStripDefinition} from "./ReelStripDefinition.js";
import type {ReelStripGenerationRequest} from "./ReelStripGenerationRequest.js";

export interface ReelStripGenerationStrategy {
    generateCandidate(request: ReelStripGenerationRequest, rng: RandomNumberGenerating): ReelStripDefinition;
}
