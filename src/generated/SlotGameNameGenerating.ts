import type {SlotGameName} from "./SlotGameName.js";

export interface SlotGameNameGenerating {
    // "seed", when given, always produces the same {id, name} — omit it for a fresh, non-reproducible
    // pick (see SlotGameNameGenerator's own doc comment for how the seed drives both).
    generate(seed?: number): SlotGameName;
}
