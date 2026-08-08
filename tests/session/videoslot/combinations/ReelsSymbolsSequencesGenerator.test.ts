import {ReelsSymbolsSequencesGenerator, SeededRandomNumberGenerator} from "pokie";

// Regression coverage for the fix in src/generated/renderBuiltGameModule.ts/renderSessionModule.ts: a
// generated package's own default reel-strip content (no explicit blueprint.reelStrips/symbolWeights)
// is built by this class, whose own shuffle used to be unseeded Math.random() regardless of any
// session seed -- see VideoSlotGoldenTestFixtures.ts's own doc comment, which already named this exact
// gap. Passing a SeededRandomNumberGenerator through the constructor now makes it deterministic.
describe("ReelsSymbolsSequencesGenerator", () => {
    it("produces the exact same reel content for the same rng seed, across independent instances", () => {
        const first = new ReelsSymbolsSequencesGenerator<string>(new SeededRandomNumberGenerator(4242)).generate(
            3,
            ["A", "B", "C", "W", "S"],
            ["W"],
            ["S"],
        );
        const second = new ReelsSymbolsSequencesGenerator<string>(new SeededRandomNumberGenerator(4242)).generate(
            3,
            ["A", "B", "C", "W", "S"],
            ["W"],
            ["S"],
        );

        expect(first.map((sequence) => sequence.toArray())).toEqual(second.map((sequence) => sequence.toArray()));
    });

    it("produces different reel content for a different rng seed", () => {
        const first = new ReelsSymbolsSequencesGenerator<string>(new SeededRandomNumberGenerator(1)).generate(
            3,
            ["A", "B", "C", "W", "S"],
            ["W"],
            ["S"],
        );
        const second = new ReelsSymbolsSequencesGenerator<string>(new SeededRandomNumberGenerator(2)).generate(
            3,
            ["A", "B", "C", "W", "S"],
            ["W"],
            ["S"],
        );

        expect(first.map((sequence) => sequence.toArray())).not.toEqual(second.map((sequence) => sequence.toArray()));
    });

    it("still produces reel content (unseeded, non-reproducible) when constructed with no rng, same as before this param existed", () => {
        const sequences = new ReelsSymbolsSequencesGenerator<string>().generate(2, ["A", "B", "W", "S"], ["W"], ["S"]);

        expect(sequences).toHaveLength(2);
        for (const sequence of sequences) {
            expect(sequence.getSize()).toBeGreaterThan(0);
        }
    });
});
