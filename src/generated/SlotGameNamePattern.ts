import type {RandomNumberGenerating} from "../session/videoslot/combinations/RandomNumberGenerating.js";
import type {SlotGameNameVocabulary} from "./SlotGameNameVocabulary.js";

// Picks the words a name is built from -- how many, and from which part of `vocabulary` each one
// comes -- but never how they're joined/cased (see SlotGameNameStrategy for that).
export interface SlotGameNamePattern {
    readonly wordCount: 2 | 3;

    pickWords(random: RandomNumberGenerating, vocabulary: SlotGameNameVocabulary): string[];
}
