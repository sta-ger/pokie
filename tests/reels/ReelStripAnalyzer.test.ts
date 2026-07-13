import {ReelStrip, ReelStripAnalyzer} from "pokie";

describe("ReelStripAnalyzer", () => {
    test("analyze reports counts, frequencies, minimum circular distances, and maximum consecutive runs", () => {
        const strip = new ReelStrip(["A", "A", "B", "A", "C"]);

        const analysis = ReelStripAnalyzer.analyze(strip);

        expect(analysis.length).toBe(5);
        expect(analysis.symbolCounts).toEqual({A: 3, B: 1, C: 1});
        expect(analysis.symbolFrequencies).toEqual({A: 0.6, B: 0.2, C: 0.2});
        expect(analysis.minimumCircularDistances).toEqual({A: 1});
        expect(analysis.maximumConsecutiveOccurrences).toEqual({A: 2, B: 1, C: 1});
    });

    test("minimum circular distance wraps end-to-start and is omitted for symbols occurring 0 or 1 times", () => {
        const strip = new ReelStrip(["A", "B", "B", "A"]);

        const analysis = ReelStripAnalyzer.analyze(strip);

        // A occurs at 0 and 3: linear gap 3, wrap gap (4 - 3 + 0) = 1 -> minimum is 1.
        expect(analysis.minimumCircularDistances).toEqual({A: 1, B: 1});
    });

    test("a strip made of a single repeated symbol collapses to one full-length run", () => {
        const strip = new ReelStrip(["A", "A", "A", "A"]);

        const analysis = ReelStripAnalyzer.analyze(strip);

        expect(analysis.maximumConsecutiveOccurrences).toEqual({A: 4});
        expect(analysis.minimumCircularDistances).toEqual({A: 1});
    });
});
