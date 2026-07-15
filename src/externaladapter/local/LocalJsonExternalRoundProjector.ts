import {PokieJsonRoundArtifactProjector} from "../../artifact/PokieJsonRoundArtifactProjector.js";
import type {RoundArtifact} from "../../artifact/RoundArtifact.js";
import type {JsonObject} from "../../json/JsonValue.js";
import type {ExternalRoundProjector} from "../ExternalRoundProjector.js";

// The example local target's own ExternalRoundProjector: delegates straight to the SDK's own standard
// PokieJsonRoundArtifactProjector (canonical JSON + content hash, see that class's own doc comment) rather than
// building a second, target-specific projection — exactly what a real target's own projector should also do
// whenever its external format has no reason to diverge from POKIE's own canonical JSON shape.
export class LocalJsonExternalRoundProjector<T extends string | number = string> implements ExternalRoundProjector<T> {
    private readonly inner = new PokieJsonRoundArtifactProjector<T>();

    public project(artifact: RoundArtifact<T>): JsonObject {
        return this.inner.project(artifact) as unknown as JsonObject;
    }
}
