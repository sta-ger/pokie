import {PublicRoundRecordProjector} from "../../roundrecord/PublicRoundRecordProjector.js";
import {PokieJsonRoundRecordProjector} from "../../roundrecord/PokieJsonRoundRecordProjector.js";
import type {RoundRecord} from "../../roundrecord/RoundRecord.js";
import type {JsonObject} from "../../json/JsonValue.js";
import type {ExternalRoundProjector} from "../ExternalRoundProjector.js";

// The example local target's own ExternalRoundProjector: delegates straight to the SDK's own standard
// PokieJsonRoundRecordProjector (canonical JSON + content hash, see that class's own doc comment) rather than
// building a second, target-specific projection — exactly what a real target's own projector should also do
// whenever its external format has no reason to diverge from POKIE's own canonical JSON shape.
export class LocalJsonExternalRoundProjector<T extends string | number = string> implements ExternalRoundProjector<T> {
    private readonly inner = new PokieJsonRoundRecordProjector<T>();

    public project(artifact: RoundRecord<T>): JsonObject {
        return (artifact.geometry || artifact.steps.some(step => step.geometry) ? new PublicRoundRecordProjector<T>().project(artifact) : this.inner.project(artifact)) as unknown as JsonObject;
    }
}
