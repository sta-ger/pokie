import type {RandomNumberGenerating} from "../session/videoslot/combinations/RandomNumberGenerating.js";
import {SeededRandomNumberGenerator} from "../session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {DefaultSlotGameNameStrategy} from "./DefaultSlotGameNameStrategy.js";
import {SlotGameNameExhaustedError} from "./SlotGameNameExhaustedError.js";
import type {SlotGameNameGenerating} from "./SlotGameNameGenerating.js";
import type {SlotGameNamePattern} from "./SlotGameNamePattern.js";
import type {SlotGameNameRequest} from "./SlotGameNameRequest.js";
import type {SlotGameNameResult} from "./SlotGameNameResult.js";
import type {SlotGameNameStrategy} from "./SlotGameNameStrategy.js";
import {ALL_SLOT_GAME_NAME_STYLES, type SlotGameNameStyle} from "./SlotGameNameStyle.js";
import {ALL_SLOT_GAME_NAME_THEMES, type SlotGameNameTheme} from "./SlotGameNameTheme.js";
import type {SlotGameNameVocabulary} from "./SlotGameNameVocabulary.js";
import {ThreeWordSlotGameNamePattern} from "./ThreeWordSlotGameNamePattern.js";
import {TwoWordSlotGameNamePattern} from "./TwoWordSlotGameNamePattern.js";

// Tone pools, keyed by style -- contribute *adjectives* only (see SlotGameNameStyle). "classic" is
// deliberately the most neutral pool and doubles as one of the equally-likely picks when no style
// is given.
const STYLE_ADJECTIVES: Record<SlotGameNameStyle, readonly string[]> = {
    classic: ["Golden", "Royal", "Grand", "Lucky", "Diamond", "Silver", "Crown", "Prime"],
    bold: ["Blazing", "Savage", "Thunder", "Turbo", "Roaring", "Feral", "Volcanic", "Rampaging"],
    elegant: ["Radiant", "Opulent", "Serene", "Velvet", "Pristine", "Refined", "Gilded", "Graceful"],
    playful: ["Jolly", "Giddy", "Wacky", "Bouncy", "Zany", "Peppy", "Frisky", "Whimsical"],
};

// Subject-matter pools, keyed by theme -- contribute *nouns* only (see SlotGameNameTheme).
const THEME_NOUNS: Record<SlotGameNameTheme, readonly string[]> = {
    adventure: ["Odyssey", "Expedition", "Frontier", "Voyage", "Quest", "Trailblazer", "Safari", "Passage"],
    mystic: ["Oracle", "Rune", "Enigma", "Charm", "Sorcery", "Coven", "Talisman", "Prophecy"],
    fortune: ["Riches", "Jackpot", "Bonanza", "Fortune", "Windfall", "Treasury", "Payout", "Bounty"],
    mythic: ["Titan", "Phoenix", "Olympus", "Legend", "Pantheon", "Colossus", "Valkyrie", "Chimera"],
    cosmic: ["Nebula", "Galaxy", "Nova", "Eclipse", "Orbit", "Comet", "Starfall", "Meteor"],
    wild: ["Stampede", "Rampage", "Wilderness", "Prowl", "Howl", "Thicket", "Instinct", "Pride"],
};

const SLUG_SUFFIX_MIN = 1000;
const SLUG_SUFFIX_MAX_EXCLUSIVE = 10000;
const DEFAULT_MAX_ATTEMPTS = 200;

// Deterministic, offline generator for slot game names -- no AI, no network, no external APIs. Picks
// a 2-3 word title from small curated word lists (an adjective-contributing `style` crossed with a
// noun-contributing `theme`), or from a fully custom `vocabulary` when one is given, and projects it
// three distinct ways:
//   - `title`: the display name, e.g. "Blazing Riches";
//   - `slug`: a directory/manifest-id-safe form with a numeric suffix, e.g. "blazing-riches-4821";
//   - `packageName`: an npm-package-name-safe form with no suffix, e.g. "blazing-riches" -- the same
//     title always yields the same packageName, unlike `slug`.
// Given the same seed, `generate`/`generateUnique` always produce the same result(s) (see
// RandomNumberGenerating); omit "seed" for a fresh, non-reproducible pick.
export class SlotGameNameGenerator implements SlotGameNameGenerating {
    private readonly strategy: SlotGameNameStrategy;
    private readonly patterns: Record<2 | 3, SlotGameNamePattern>;
    private readonly createRandom: (seed: number) => RandomNumberGenerating;
    private readonly maxAttempts: number;

    constructor(
        strategy: SlotGameNameStrategy = new DefaultSlotGameNameStrategy(),
        createRandom: (seed: number) => RandomNumberGenerating = (seed) => new SeededRandomNumberGenerator(seed),
        maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
    ) {
        this.strategy = strategy;
        this.createRandom = createRandom;
        this.maxAttempts = maxAttempts;
        this.patterns = {2: new TwoWordSlotGameNamePattern(), 3: new ThreeWordSlotGameNamePattern()};
    }

    private static mintSeed(): number {
        return Math.floor(Math.random() * 0x7fffffff);
    }

    private static slugify(value: string): string {
        const slug = value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        return slug.length > 0 ? slug : "slot-game";
    }

    private static normalizeExclusions(exclusions: readonly string[] | undefined): string[] {
        return (exclusions ?? []).map((title) => title.trim().toLowerCase());
    }

    public generate(request: SlotGameNameRequest = {}): SlotGameNameResult {
        const seed = request.seed ?? SlotGameNameGenerator.mintSeed();
        const random = this.createRandom(seed);
        const excludedTitles = new Set(SlotGameNameGenerator.normalizeExclusions(request.exclusions));
        return this.produceOne(random, seed, request, excludedTitles);
    }

    public generateUnique(count: number, request: SlotGameNameRequest = {}): SlotGameNameResult[] {
        if (!Number.isInteger(count) || count <= 0) {
            throw new RangeError(`count must be a positive integer, got ${count}.`);
        }

        const seed = request.seed ?? SlotGameNameGenerator.mintSeed();
        const random = this.createRandom(seed);
        const excludedTitles = new Set(SlotGameNameGenerator.normalizeExclusions(request.exclusions));

        const results: SlotGameNameResult[] = [];
        for (let i = 0; i < count; i++) {
            const result = this.produceOne(random, seed, request, excludedTitles);
            excludedTitles.add(result.title.toLowerCase());
            results.push(result);
        }
        return results;
    }

    private produceOne(
        random: RandomNumberGenerating,
        seed: number,
        request: SlotGameNameRequest,
        excludedTitles: ReadonlySet<string>,
    ): SlotGameNameResult {
        const vocabulary = this.resolveVocabulary(random, request);
        const pattern = this.patterns[request.wordCount ?? (random.getRandomInt(0, 2) === 0 ? 2 : 3)];

        let title: string | undefined;
        for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
            const candidate = this.strategy.generateCandidate(random, vocabulary, pattern);
            if (!excludedTitles.has(candidate.toLowerCase())) {
                title = candidate;
                break;
            }
        }

        if (title === undefined) {
            throw new SlotGameNameExhaustedError(
                `Could not produce a name outside the excluded/already-used set within ${this.maxAttempts} attempts -- the vocabulary is too small for what was asked.`,
            );
        }

        const packageName = SlotGameNameGenerator.slugify(title);
        const suffix = random.getRandomInt(SLUG_SUFFIX_MIN, SLUG_SUFFIX_MAX_EXCLUSIVE);
        return {title, packageName, slug: `${packageName}-${suffix}`, seed};
    }

    private resolveVocabulary(random: RandomNumberGenerating, request: SlotGameNameRequest): SlotGameNameVocabulary {
        if (request.vocabulary !== undefined) {
            return request.vocabulary;
        }

        const theme = request.theme ?? ALL_SLOT_GAME_NAME_THEMES[random.getRandomInt(0, ALL_SLOT_GAME_NAME_THEMES.length)];
        const style = request.style ?? ALL_SLOT_GAME_NAME_STYLES[random.getRandomInt(0, ALL_SLOT_GAME_NAME_STYLES.length)];
        return {adjectives: STYLE_ADJECTIVES[style], nouns: THEME_NOUNS[theme]};
    }
}
