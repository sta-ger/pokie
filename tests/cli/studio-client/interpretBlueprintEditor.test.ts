import {
    describeLoadResult,
    describeReelStripGenerationPreview,
    describeSaveResult,
    describeValidation,
    isStaleReelStripGenerationRequest,
} from "../../../cli/studio-client/interpretBlueprintEditor.js";

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
        it("is not stale when the version is unchanged", () => {
            expect(isStaleReelStripGenerationRequest(3, 3)).toBe(false);
        });

        it("is stale once the version has moved on, in either direction", () => {
            expect(isStaleReelStripGenerationRequest(3, 4)).toBe(true);
            expect(isStaleReelStripGenerationRequest(4, 0)).toBe(true);
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
