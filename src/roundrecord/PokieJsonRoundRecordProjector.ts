import {RoundRecordValidator} from "./RoundRecordValidator.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import {computeRoundRecordHash} from "./computeRoundRecordHash.js";
import {deepFreeze} from "../internal/deepFreeze.js";
import type {RoundRecord} from "./RoundRecord.js";
import type {RoundRecordJson} from "./RoundRecordJson.js";
import type {RoundRecordProjector} from "./RoundRecordProjector.js";

// The standard POKIE projector: turns a RoundRecord into a plain, JSON-safe object with a canonical field
// order (sorted keys, via the same toCanonicalJson this shares with computeRoundRecordHash — so the two can
// never silently drift apart on what a RoundRecord's JSON shape actually is) and stamps it with its own
// content hash. Fails fast (propagates InvalidJsonValueError) on anything that isn't valid canonical JSON.
export class PokieJsonRoundRecordProjector<T extends string | number = string>
implements RoundRecordProjector<T, RoundRecordJson<T>> {
    public project(artifact: RoundRecord<T>): RoundRecordJson<T> {
        const canonical = toCanonicalJson(artifact) as unknown as RoundRecord<T>;
        if (artifact.sequenceSelections || artifact.geometry || artifact.steps.some(step => step.geometry)) {
            const issues = new RoundRecordValidator<T>().validate(artifact);
            if (issues.length) throw new Error(issues.map(issue => issue.message).join("; "));
        }
        return deepFreeze({...canonical, hash: computeRoundRecordHash(artifact)});
    }
}
