import {serializeGameBlueprint} from "../../../../cli/studio/blueprint/serializeGameBlueprint.js";

describe("serializeGameBlueprint", () => {
    it("orders known top-level fields into the fixed GameBlueprint field order regardless of input order", () => {
        const blueprint = {
            availableBets: [1, 2],
            symbols: ["A", "B"],
            manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            paytable: {A: {3: 5}},
            rows: 3,
            reels: 3,
        };

        const serialized = serializeGameBlueprint(blueprint);
        const parsed = JSON.parse(serialized);

        expect(Object.keys(parsed)).toEqual(["manifest", "reels", "rows", "symbols", "paytable", "availableBets"]);
    });

    it("preserves unknown top-level fields, appended after the known ones in their original order", () => {
        const blueprint = {
            manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            reels: 3,
            rows: 3,
            symbols: ["A"],
            paytable: {A: {3: 5}},
            futureField: "kept",
            anotherFutureField: 42,
        };

        const serialized = serializeGameBlueprint(blueprint);
        const parsed = JSON.parse(serialized);

        expect(Object.keys(parsed)).toEqual(["manifest", "reels", "rows", "symbols", "paytable", "futureField", "anotherFutureField"]);
        expect(parsed.futureField).toBe("kept");
        expect(parsed.anotherFutureField).toBe(42);
    });

    it("ends with a trailing newline and uses 4-space indentation", () => {
        const serialized = serializeGameBlueprint({manifest: {id: "a", name: "A", version: "0.1.0"}});

        expect(serialized.endsWith("\n")).toBe(true);
        expect(serialized).toContain('{\n    "manifest"');
    });

    it("produces byte-identical output across repeated calls with the same input", () => {
        const blueprint = {
            manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            reels: 3,
            rows: 3,
            symbols: ["A", "B"],
            paytable: {A: {3: 5}, B: {3: 2}},
        };

        expect(serializeGameBlueprint(blueprint)).toBe(serializeGameBlueprint(blueprint));
    });

    it("falls back to an empty object for a non-object input", () => {
        expect(serializeGameBlueprint(null)).toBe("{}\n");
        expect(serializeGameBlueprint("not an object")).toBe("{}\n");
        expect(serializeGameBlueprint([1, 2, 3])).toBe("{}\n");
    });
});
