import type {SlotGameNameRequest} from "./SlotGameNameRequest.js";
import type {SlotGameNameResult} from "./SlotGameNameResult.js";

export interface SlotGameNameGenerating {
    // "seed", when given, always produces the same result -- omit it for a fresh, non-reproducible
    // pick (see SlotGameNameGenerator's own doc comment for how the seed drives every resolved field).
    generate(request?: SlotGameNameRequest): SlotGameNameResult;

    // Every result's `title` (and therefore `slug`/`packageName`) is distinct from every other's in
    // the same call. All `count` results echo the one batch seed on their `seed` field, so the whole
    // batch is reproducible from that single number.
    generateUnique(count: number, request?: SlotGameNameRequest): SlotGameNameResult[];
}
