import {
    describeLoadResult,
    describeReelStripGenerationPreview,
    describeSaveResult,
    describeValidation,
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
        it("passes through an ok result with its reels", () => {
            const reels = [{reelIndex: 0, type: "literal" as const, strip: ["A"], analysis: {length: 1, symbolCounts: {A: 1}, symbolFrequencies: {A: 1}, minimumCircularDistances: {}, maximumCircularDistances: {}, maximumConsecutiveOccurrences: {A: 1}}}];
            expect(describeReelStripGenerationPreview({status: "ok", warnings: [], reels})).toEqual({status: "ok", warnings: [], reels});
        });

        it("passes through an invalid result", () => {
            const errors = [{code: "blueprint-reels-invalid", severity: "error" as const, message: "bad"}];
            expect(describeReelStripGenerationPreview({status: "invalid", errors, warnings: []})).toEqual({status: "invalid", errors, warnings: []});
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
