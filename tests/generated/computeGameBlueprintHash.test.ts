import {computeGameBlueprintHash} from "pokie";

describe("computeGameBlueprintHash", () => {
    it("hashes semantically identical content the same way regardless of top-level key order", () => {
        const inInsertionOrder = {manifest: {id: "a"}, reels: 3, rows: 3, symbols: ["A", "B"], availableBets: [1, 2], paytable: {A: {3: 5}}};
        const inCanonicalOrder = {manifest: {id: "a"}, reels: 3, rows: 3, symbols: ["A", "B"], paytable: {A: {3: 5}}, availableBets: [1, 2]};

        expect(computeGameBlueprintHash(inInsertionOrder)).toBe(computeGameBlueprintHash(inCanonicalOrder));
    });

    it("hashes identically regardless of nested object key order", () => {
        const a = {manifest: {id: "a", name: "A", version: "0.1.0"}};
        const b = {manifest: {version: "0.1.0", id: "a", name: "A"}};

        expect(computeGameBlueprintHash(a)).toBe(computeGameBlueprintHash(b));
    });

    it("still changes the hash when actual content changes, key order aside", () => {
        const a = {manifest: {id: "a"}, reels: 3};
        const b = {manifest: {id: "a"}, reels: 4};

        expect(computeGameBlueprintHash(a)).not.toBe(computeGameBlueprintHash(b));
    });

    it("preserves array element order as meaningful (does not sort array entries)", () => {
        const a = {reelStrips: [["A", "B"], ["B", "A"]]};
        const b = {reelStrips: [["B", "A"], ["A", "B"]]};

        expect(computeGameBlueprintHash(a)).not.toBe(computeGameBlueprintHash(b));
    });

    // The regression this guards: StudioBlueprintService.save() always writes a fixed canonical
    // top-level key order (see serializeGameBlueprint's KNOWN_TOP_LEVEL_KEYS), regardless of what order
    // the in-memory blueprint held them in. Without key-order-independent hashing, the hash Studio's
    // Apply endpoint returns right after a successful commit (computed on the pre-save, editor-ordered
    // object) would disagree with the hash a fresh load() computes moments later from the very file that
    // commit just wrote (parsed in canonical order) -- a false "conflict" with no real edit in between.
    it("agrees between an editor-ordered in-memory object and its canonically re-ordered, round-tripped form", () => {
        const editorOrdered = {manifest: {id: "a"}, reels: 3, rows: 3, symbols: ["A", "B"], availableBets: [1, 2], paytable: {A: {3: 5}}};
        const canonicalOrdered = {manifest: {id: "a"}, reels: 3, rows: 3, symbols: ["A", "B"], paytable: {A: {3: 5}}, availableBets: [1, 2]};
        const roundTripped = JSON.parse(JSON.stringify(canonicalOrdered)) as unknown;

        expect(computeGameBlueprintHash(editorOrdered)).toBe(computeGameBlueprintHash(roundTripped));
    });
});
