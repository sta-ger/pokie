import type {RandomNumberGenerating} from "../session/videoslot/combinations/RandomNumberGenerating.js";
import {SeededRandomNumberGenerator} from "../session/videoslot/combinations/SeededRandomNumberGenerator.js";
import type {SlotGameName} from "./SlotGameName.js";
import type {SlotGameNameGenerating} from "./SlotGameNameGenerating.js";

const ADJECTIVES = [
    "Blazing", "Wild", "Golden", "Mystic", "Frozen", "Crimson", "Roaring", "Electric",
    "Sunken", "Ancient", "Neon", "Turbo", "Savage", "Lucky", "Royal", "Shadow",
    "Radiant", "Thunder", "Rogue", "Emerald", "Diamond", "Midnight", "Solar", "Feral",
];
const NOUNS = [
    "Riches", "Fortune", "Bonanza", "Cascade", "Rampage", "Odyssey", "Legacy", "Vortex",
    "Reels", "Empire", "Frenzy", "Voyage", "Kingdom", "Rumble", "Eclipse", "Stampede",
    "Jubilee", "Inferno", "Serenade", "Expedition",
];
const ID_SUFFIX_MIN = 1000;
const ID_SUFFIX_MAX_EXCLUSIVE = 10000;

// Picks one adjective + one noun (plus a short numeric suffix for the id, to keep repeated
// unseeded calls from colliding on the same directory name) from small curated word lists —
// "Blazing Riches" / "blazing-riches-4821". Given the same seed, always the same pick (see
// RandomNumberGenerating); omit "seed" for a fresh one every call.
export class SlotGameNameGenerator implements SlotGameNameGenerating {
    private readonly createRandom: (seed: number) => RandomNumberGenerating;

    constructor(createRandom: (seed: number) => RandomNumberGenerating = (seed) => new SeededRandomNumberGenerator(seed)) {
        this.createRandom = createRandom;
    }

    private static mintSeed(): number {
        return Math.floor(Math.random() * 0x7fffffff);
    }

    public generate(seed?: number): SlotGameName {
        const random = this.createRandom(seed ?? SlotGameNameGenerator.mintSeed());
        const adjective = ADJECTIVES[random.getRandomInt(0, ADJECTIVES.length)];
        const noun = NOUNS[random.getRandomInt(0, NOUNS.length)];
        const suffix = random.getRandomInt(ID_SUFFIX_MIN, ID_SUFFIX_MAX_EXCLUSIVE);

        return {
            id: `${adjective.toLowerCase()}-${noun.toLowerCase()}-${suffix}`,
            name: `${adjective} ${noun}`,
        };
    }
}
