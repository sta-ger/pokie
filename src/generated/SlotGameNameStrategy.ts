import type {RandomNumberGenerating} from "../session/videoslot/combinations/RandomNumberGenerating.js";
import type {SlotGameNamePattern} from "./SlotGameNamePattern.js";
import type {SlotGameNameVocabulary} from "./SlotGameNameVocabulary.js";

// Turns one `pattern` pick over `vocabulary` into a single display-ready title candidate (joiner,
// casing). `SlotGameNameGenerator` calls this once per attempt and re-checks the result against its
// own exclusion/uniqueness set -- a custom strategy can change assembly but never bypass that check.
export interface SlotGameNameStrategy {
    generateCandidate(random: RandomNumberGenerating, vocabulary: SlotGameNameVocabulary, pattern: SlotGameNamePattern): string;
}
