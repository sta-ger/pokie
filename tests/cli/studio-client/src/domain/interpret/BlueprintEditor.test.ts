import {
    computeReelStopWindow,
    describeLoadResult,
    describeReelStripGenerationEntrySummary,
    describeReelStripGenerationPreview,
    describeSaveResult,
    describeValidation,
    hasReelStripGenerationDraftChanged,
    isStaleReelStripGenerationRequest,
} from "../../../../../../cli/studio-client/src/domain/interpret/BlueprintEditor";

describe("interpretBlueprintEditor", () => {
    describe("describeValidation", () => {
        it("passes through an ok result", () => {
            expect(describeValidation({status: "ok", warnings: []})).toEqual({status: "ok", warnings: []});
        });

        it("passes through an invalid result", () => {
            const errors = [{code: "blueprint-reels-invalid", severity: "error" as const, message: "bad"}];
            expect(describeValidation({status: "invalid", errors, warnings: []})).toEqual({status: "invalid", errors, warnings: []});
        });
    });

    describe("describeReelStripGenerationPreview", () => {
        it("passes through an ok result with its reels and no errors", () => {
            const reels = [{reelIndex: 0, type: "literal" as const, strip: ["A"], analysis: {length: 1, symbolCounts: {A: 1}, symbolFrequencies: {A: 1}, minimumCircularDistances: {}, maximumCircularDistances: {}, maximumConsecutiveOccurrences: {A: 1}}}];
            expect(describeReelStripGenerationPreview({status: "ok", errors: [], warnings: [], reels})).toEqual({
                status: "ok",
                errors: [],
                warnings: [],
                reels,
            });
        });

        it("passes through an ok result carrying unrelated blueprint errors alongside its resolved reels", () => {
            const errors = [{code: "blueprint-paytable-empty", severity: "error" as const, message: "bad"}];
            const reels = [{reelIndex: 0, type: "literal" as const, strip: ["A"], analysis: {length: 1, symbolCounts: {A: 1}, symbolFrequencies: {A: 1}, minimumCircularDistances: {}, maximumCircularDistances: {}, maximumConsecutiveOccurrences: {A: 1}}}];
            expect(describeReelStripGenerationPreview({status: "ok", errors, warnings: [], reels})).toEqual({
                status: "ok",
                errors,
                warnings: [],
                reels,
            });
        });
    });

    describe("isStaleReelStripGenerationRequest", () => {
        it("is not stale when the revision is unchanged", () => {
            expect(isStaleReelStripGenerationRequest(3, 3)).toBe(false);
        });

        it("is stale once the revision has moved on, in either direction", () => {
            expect(isStaleReelStripGenerationRequest(3, 4)).toBe(true);
            expect(isStaleReelStripGenerationRequest(4, 0)).toBe(true);
        });
    });

    describe("hasReelStripGenerationDraftChanged", () => {
        it("is false for two structurally identical entries", () => {
            const draft = {type: "generated", length: 10, seed: 1, symbolCounts: {A: 3, B: 2}};
            const applied = {type: "generated", length: 10, seed: 1, symbolCounts: {A: 3, B: 2}};
            expect(hasReelStripGenerationDraftChanged(draft, applied)).toBe(false);
        });

        it("is false when only field insertion order differs (canonicalized before comparing)", () => {
            const draft = {seed: 1, type: "generated", symbolCounts: {B: 2, A: 3}, length: 10};
            const applied = {type: "generated", length: 10, seed: 1, symbolCounts: {A: 3, B: 2}};
            expect(hasReelStripGenerationDraftChanged(draft, applied)).toBe(false);
        });

        it("is true when a scalar field differs", () => {
            const draft = {type: "generated", length: 12, seed: 1, symbolCounts: {A: 3}};
            const applied = {type: "generated", length: 10, seed: 1, symbolCounts: {A: 3}};
            expect(hasReelStripGenerationDraftChanged(draft, applied)).toBe(true);
        });

        it("is true when a literal strip's own symbol order differs (array order is meaningful)", () => {
            const draft = {type: "literal", strip: ["A", "B", "C"]};
            const applied = {type: "literal", strip: ["A", "C", "B"]};
            expect(hasReelStripGenerationDraftChanged(draft, applied)).toBe(true);
        });

        it("is true when one side has an extra field the other doesn't", () => {
            const draft = {type: "generated", length: 10, seed: 1, symbolCounts: {A: 3}, maxAttempts: 50};
            const applied = {type: "generated", length: 10, seed: 1, symbolCounts: {A: 3}};
            expect(hasReelStripGenerationDraftChanged(draft, applied)).toBe(true);
        });
    });

    describe("describeReelStripGenerationEntrySummary", () => {
        it("summarizes a literal entry by its own symbol count", () => {
            expect(describeReelStripGenerationEntrySummary({type: "literal", strip: ["A", "B", "C"]})).toBe("Literal — 3 symbol(s)");
        });

        it("summarizes a literal entry with no strip yet as 0 symbols", () => {
            expect(describeReelStripGenerationEntrySummary({type: "literal"})).toBe("Literal — 0 symbol(s)");
        });

        it("summarizes a generated entry by its own length and seed", () => {
            expect(describeReelStripGenerationEntrySummary({type: "generated", length: 30, seed: 42, symbolCounts: {}})).toBe(
                "Generated — length 30, seed 42",
            );
        });

        it("falls back to '?' for a generated entry missing length/seed", () => {
            expect(describeReelStripGenerationEntrySummary({type: "generated"})).toBe("Generated — length ?, seed ?");
        });
    });

    describe("computeReelStopWindow", () => {
        it("returns the rows consecutive symbols starting at stop", () => {
            expect(computeReelStopWindow(["A", "B", "C", "D"], 1, 2)).toEqual(["B", "C"]);
        });

        it("wraps around to the strip's own start once it runs past the end", () => {
            expect(computeReelStopWindow(["A", "B", "C", "D"], 3, 3)).toEqual(["D", "A", "B"]);
        });

        it("wraps an out-of-range (too large) stop via modulo", () => {
            expect(computeReelStopWindow(["A", "B", "C", "D"], 6, 1)).toEqual(["C"]);
        });

        it("wraps a negative stop into range", () => {
            expect(computeReelStopWindow(["A", "B", "C", "D"], -1, 1)).toEqual(["D"]);
        });

        it("can wrap around the whole strip more than once when rows exceeds the strip length", () => {
            expect(computeReelStopWindow(["A", "B"], 0, 5)).toEqual(["A", "B", "A", "B", "A"]);
        });

        it("returns an empty window for an empty strip", () => {
            expect(computeReelStopWindow([], 0, 3)).toEqual([]);
        });

        it("returns an empty window for a non-positive rows count", () => {
            expect(computeReelStopWindow(["A", "B"], 0, 0)).toEqual([]);
        });
    });

    describe("describeLoadResult", () => {
        it("maps a successful load to its path", () => {
            expect(describeLoadResult({status: "ok", path: "/a/blueprint.json", blueprint: {}})).toEqual({
                status: "ok",
                path: "/a/blueprint.json",
            });
        });

        it("maps a load-error to a message", () => {
            expect(describeLoadResult({status: "load-error", error: "not found"})).toEqual({status: "load-error", message: "not found"});
        });
    });

    describe("describeSaveResult", () => {
        it("maps ok to its path", () => {
            expect(describeSaveResult({status: "ok", path: "/a/blueprint.json"})).toEqual({status: "ok", path: "/a/blueprint.json"});
        });

        it("maps conflict to its own distinct status (not 'failed')", () => {
            expect(describeSaveResult({status: "conflict", path: "/a/blueprint.json", error: "already exists"})).toEqual({
                status: "conflict",
                path: "/a/blueprint.json",
                message: "already exists",
            });
        });

        it("maps error to failed", () => {
            expect(describeSaveResult({status: "error", error: "disk full"})).toEqual({status: "failed", message: "disk full"});
        });
    });
});
