export function renderSessionModule(className: string): string {
    return `import {PokieGameContext, ReelsSymbolsSequencesGenerator, SeededRandomNumberGenerator, SymbolsCombinationsGenerator, VideoSlotConfig, VideoSlotSession} from "pokie";

export function create${className}Session(context?: PokieGameContext): VideoSlotSession {
    const seedRng = context && context.seed !== undefined ? new SeededRandomNumberGenerator(context.seed) : undefined;
    // VideoSlotConfig's own default reel-strip content (this scaffold sets no symbols/reelStrips of
    // its own -- a developer hand-edits those in) is otherwise shuffled with unseeded Math.random() at
    // construction time; passing a seeded ReelsSymbolsSequencesGenerator here makes it deterministic
    // too, not just the stop-position draws below.
    const config = new VideoSlotConfig(undefined, seedRng ? new ReelsSymbolsSequencesGenerator(seedRng) : undefined);
    const combinationsGenerator = context && context.seed !== undefined
        ? new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(context.seed))
        : new SymbolsCombinationsGenerator(config);
    return new VideoSlotSession(config, combinationsGenerator);
}
`;
}
