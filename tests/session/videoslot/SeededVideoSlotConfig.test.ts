import {VideoSlotConfig} from "../../../src/session/videoslot/VideoSlotConfig.js";
import {VideoSlotSession} from "../../../src/session/videoslot/VideoSlotSession.js";
import {SeededRandomNumberGenerator} from "../../../src/session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {SymbolsCombinationsGenerator} from "../../../src/session/videoslot/combinations/SymbolsCombinationsGenerator.js";

function strips(config: VideoSlotConfig): string[][] {
    return config.getSymbolsSequences().map((sequence) => sequence.toArray());
}

function screens(seed: string, rounds: number): string[][][] {
    const config = VideoSlotConfig.withSeed(seed);
    const session = new VideoSlotSession(
        config,
        new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(seed)),
    );
    const result: string[][][] = [];
    for (let i = 0; i < rounds; i++) {
        session.play();
        result.push(session.getSymbolsCombination().toMatrix());
    }
    return result;
}

describe("VideoSlotConfig.withSeed", () => {
    it("produces identical default reel strips for the same seed", () => {
        expect(strips(VideoSlotConfig.withSeed("same-seed"))).toEqual(strips(VideoSlotConfig.withSeed("same-seed")));
    });

    it("produces different default reel strips for a different seed", () => {
        expect(strips(VideoSlotConfig.withSeed("seed-a"))).not.toEqual(strips(VideoSlotConfig.withSeed("seed-b")));
    });

    it("makes a hand-authored game reproducible from its PokieGameContext seed", () => {
        expect(screens("release-2026-11", 5)).toEqual(screens("release-2026-11", 5));
    });
});
