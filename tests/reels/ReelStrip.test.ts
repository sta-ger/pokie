import {ReelStrip} from "pokie";

describe("ReelStrip", () => {
    test("exposes length, per-position symbols, and per-symbol counts", () => {
        const strip = new ReelStrip(["A", "B", "C"]);

        expect(strip.getLength()).toBe(3);
        expect(strip.toArray()).toEqual(["A", "B", "C"]);
        expect(strip.getSymbolCounts()).toEqual({A: 1, B: 1, C: 1});
    });

    test("getSymbolAt resolves positions circularly, including negative positions", () => {
        const strip = new ReelStrip(["A", "B", "C"]);

        expect(strip.getSymbolAt(0)).toBe("A");
        expect(strip.getSymbolAt(3)).toBe("A");
        expect(strip.getSymbolAt(4)).toBe("B");
        expect(strip.getSymbolAt(-1)).toBe("C");
    });

    test("is immutable: mutating the constructor array or a returned array cannot affect the strip", () => {
        const source = ["A", "B", "C"];
        const strip = new ReelStrip(source);
        source[0] = "Z";

        const firstRead = strip.toArray();
        firstRead[0] = "Z";

        expect(strip.toArray()).toEqual(["A", "B", "C"]);
    });
});
