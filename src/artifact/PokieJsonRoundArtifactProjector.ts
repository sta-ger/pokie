import {toCanonicalJson} from "../json/toCanonicalJson.js";
import {computeRoundArtifactHash} from "./computeRoundArtifactHash.js";
import {deepFreeze} from "../internal/deepFreeze.js";
import type {RoundArtifact} from "./RoundArtifact.js";
import type {RoundArtifactJson} from "./RoundArtifactJson.js";
import type {RoundArtifactProjector} from "./RoundArtifactProjector.js";

// The standard POKIE projector: turns a RoundArtifact into a plain, JSON-safe object with a canonical field
// order (sorted keys, via the same toCanonicalJson this shares with computeRoundArtifactHash — so the two can
// never silently drift apart on what a RoundArtifact's JSON shape actually is) and stamps it with its own
// content hash. Fails fast (propagates InvalidJsonValueError) on anything that isn't valid canonical JSON.
export class PokieJsonRoundArtifactProjector<T extends string | number = string>
implements RoundArtifactProjector<T, RoundArtifactJson<T>> {
    public project(artifact: RoundArtifact<T>): RoundArtifactJson<T> {
        const canonical = toCanonicalJson(artifact) as unknown as RoundArtifact<T>;
        return deepFreeze({...canonical, hash: computeRoundArtifactHash(artifact)});
    }
}
