import {ReelStrip, ReelStripAnalyzer} from "pokie";

describe("ReelStripAnalyzer", () => {
    test("analyze reports counts, frequencies, min/max circular distances, and maximum consecutive runs", () => {
        const strip = new ReelStrip(["A", "A", "B", "A", "C"]);

        const analysis = ReelStripAnalyzer.analyze(strip);

        expect(analysis.length).toBe(5);
        expect(analysis.symbolCounts).toEqual({A: 3, B: 1, C: 1});
        expect(analysis.symbolFrequencies).toEqual({A: 0.6, B: 0.2, C: 0.2});
        expect(analysis.minimumCircularDistances).toEqual({A: 1});
        // A occurs at 0, 1, 3: gaps are (0->1)=1, (1->3)=2, wrap (3->0)=5-3+0=2 -> maximum is 2.
        expect(analysis.maximumCircularDistances).toEqual({A: 2});
        expect(analysis.maximumConsecutiveOccurrences).toEqual({A: 2, B: 1, C: 1});
    });

    test("min/max circular distance both wrap end-to-start and are omitted for symbols occurring 0 or 1 times", () => {
        const strip = new ReelStrip(["A", "B", "B", "A"]);

        const analysis = ReelStripAnalyzer.analyze(strip);

        // A occurs at 0 and 3: linear gap 3, wrap gap (4 - 3 + 0) = 1 -> minimum 1, maximum 3.
        expect(analysis.minimumCircularDistances).toEqual({A: 1, B: 1});
        expect(analysis.maximumCircularDistances).toEqual({A: 3, B: 3});
    });

    test("a strip made of a single repeated symbol collapses to one full-length run", () => {
        const strip = new ReelStrip(["A", "A", "A", "A"]);

        const analysis = ReelStripAnalyzer.analyze(strip);

        expect(analysis.maximumConsecutiveOccurrences).toEqual({A: 4});
        expect(analysis.minimumCircularDistances).toEqual({A: 1});
        expect(analysis.maximumCircularDistances).toEqual({A: 1});
    });
});
