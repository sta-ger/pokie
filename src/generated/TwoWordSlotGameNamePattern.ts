import type {RandomNumberGenerating} from "../session/videoslot/combinations/RandomNumberGenerating.js";
import type {SlotGameNamePattern} from "./SlotGameNamePattern.js";
import type {SlotGameNameVocabulary} from "./SlotGameNameVocabulary.js";

// "Adjective Noun" -- the shortest name this generator ever produces, e.g. "Blazing Riches".
export class TwoWordSlotGameNamePattern implements SlotGameNamePattern {
    public readonly wordCount = 2;

    public pickWords(random: RandomNumberGenerating, vocabulary: SlotGameNameVocabulary): string[] {
        const adjective = vocabulary.adjectives[random.getRandomInt(0, vocabulary.adjectives.length)];
        const noun = vocabulary.nouns[random.getRandomInt(0, vocabulary.nouns.length)];
        return [adjective, noun];
    }
}
