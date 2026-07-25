import type {RandomNumberGenerating} from "../session/videoslot/combinations/RandomNumberGenerating.js";
import type {SlotGameNamePattern} from "./SlotGameNamePattern.js";
import type {SlotGameNameVocabulary} from "./SlotGameNameVocabulary.js";

// "Adjective Adjective Noun" -- e.g. "Blazing Golden Riches". The two adjectives are picked without
// replacement (an offset walk around the pool, not two independent draws) so a small pool never
// doubles up on itself within one name.
export class ThreeWordSlotGameNamePattern implements SlotGameNamePattern {
    public readonly wordCount = 3;

    public pickWords(random: RandomNumberGenerating, vocabulary: SlotGameNameVocabulary): string[] {
        const {adjectives, nouns} = vocabulary;
        const firstIndex = random.getRandomInt(0, adjectives.length);
        const offset = adjectives.length > 1 ? random.getRandomInt(1, adjectives.length) : 0;
        const secondIndex = (firstIndex + offset) % adjectives.length;
        const noun = nouns[random.getRandomInt(0, nouns.length)];
        return [adjectives[firstIndex], adjectives[secondIndex], noun];
    }
}
