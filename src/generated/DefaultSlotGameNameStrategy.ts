import type {RandomNumberGenerating} from "../session/videoslot/combinations/RandomNumberGenerating.js";
import type {SlotGameNamePattern} from "./SlotGameNamePattern.js";
import type {SlotGameNameStrategy} from "./SlotGameNameStrategy.js";
import type {SlotGameNameVocabulary} from "./SlotGameNameVocabulary.js";

// Title-cases whatever words `pattern` picks and joins them with a single space -- the only
// assembly rule this generator has. Swap this out via SlotGameNameGenerator's constructor to change
// joiner/casing without touching vocabulary or pattern selection.
export class DefaultSlotGameNameStrategy implements SlotGameNameStrategy {
    private static capitalize(word: string): string {
        return word.length === 0 ? word : `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`;
    }

    public generateCandidate(random: RandomNumberGenerating, vocabulary: SlotGameNameVocabulary, pattern: SlotGameNamePattern): string {
        return pattern
            .pickWords(random, vocabulary)
            .map((word) => DefaultSlotGameNameStrategy.capitalize(word))
            .join(" ");
    }
}
