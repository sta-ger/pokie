import type {StakeEngineEvent} from "../StakeEngineEvent.js";
import type {StakeEngineEventClassification, StakeEngineEventClassifying} from "./StakeEngineEventClassifying.js";

const STRUCTURAL_CATEGORIES = new Set(["reveal", "win", "finalWin"]);

// Default StakeEngineEventClassifying: recognizes POKIE's own StakeEngineRoundEventsProjector vocabulary
// (reveal/win/finalWin -- see docs/stake-engine-export.md) as their own category, and classifies everything else
// as "feature". A reasonable starting point when a directory happens to already speak that convention -- never
// assumed for a genuinely foreign export, which should supply its own StakeEngineEventClassifying instead.
export class StakeEngineStandardEventClassifier implements StakeEngineEventClassifying {
    public classify(event: StakeEngineEvent): StakeEngineEventClassification {
        return {category: STRUCTURAL_CATEGORIES.has(event.type) ? event.type : "feature"};
    }
}
