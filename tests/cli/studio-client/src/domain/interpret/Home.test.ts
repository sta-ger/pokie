import {
    describeBuildPreview,
    describeBuildResult,
    describeRecentProjectsList,
    describeScaffoldResult,
} from "../../../../../../cli/studio-client/src/domain/interpret/Home";
import type {
    StudioBuildPreviewView,
    StudioBuildResult,
    StudioHomeRecentProjectView,
    StudioScaffoldResultView,
} from "../../../../../../cli/studio-client/src/api/types";

function createEntry(overrides: Partial<StudioHomeRecentProjectView> = {}): StudioHomeRecentProjectView {
    return {
        projectRoot: "/projects/crazy-fruits",
        name: "Crazy Fruits",
        openedAt: "2026-01-01T00:00:00.000Z",
        missing: false,
        ...overrides,
    };
}

describe("describeRecentProjectsList", () => {
    it("reports empty for no entries", () => {
        expect(describeRecentProjectsList([])).toEqual({status: "empty"});
    });

    it("wraps a non-empty list as loaded, unchanged", () => {
        const entries = [createEntry({projectRoot: "/a"}), createEntry({projectRoot: "/b", missing: true})];

        expect(describeRecentProjectsList(entries)).toEqual({status: "loaded", entries});
    });
});

describe("describeScaffoldResult", () => {
    it("passes an ok result through unchanged", () => {
        const result: StudioScaffoldResultView = {
            status: "ok",
            projectRoot: "/a/crazy-fruits",
            manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            createdFiles: ["package.json"],
            updatedFiles: [],
            skippedFiles: [],
        };

        expect(describeScaffoldResult(result)).toEqual(result);
    });

    it("renames a domain-level error to status \"failed\" (distinct from an apiClient-call error)", () => {
        const result: StudioScaffoldResultView = {status: "error", error: "already exists"};

        expect(describeScaffoldResult(result)).toEqual({status: "failed", message: "already exists"});
    });
});

describe("describeBuildPreview", () => {
    it("passes an ok preview through unchanged", () => {
        const preview: StudioBuildPreviewView = {
            status: "ok",
            warnings: [],
            manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            reels: 5,
            rows: 3,
            symbolsCount: 7,
            blueprintHash: "sha256:abc",
            expectedFiles: ["package.json"],
        };

        expect(describeBuildPreview(preview)).toEqual(preview);
    });

    it("passes an invalid preview through unchanged", () => {
        const preview: StudioBuildPreviewView = {
            status: "invalid",
            errors: [{code: "blueprint-reels-invalid", severity: "error", message: '"reels" must be a positive integer.'}],
            warnings: [],
        };

        expect(describeBuildPreview(preview)).toEqual(preview);
    });

    it("renames a load-error's error field to message", () => {
        const preview: StudioBuildPreviewView = {status: "load-error", error: "not found"};

        expect(describeBuildPreview(preview)).toEqual({status: "load-error", message: "not found"});
    });
});

describe("describeBuildResult", () => {
    it("passes an ok result through unchanged", () => {
        const result: StudioBuildResult = {
            status: "ok",
            projectRoot: "/out",
            manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            createdFiles: ["package.json"],
            buildInfo: {
                schemaVersion: 1,
                generatedBy: "pokie build",
                pokieVersion: "1.0.0",
                generatedAt: "2026-01-01T00:00:00.000Z",
                blueprintHash: "sha256:abc",
                game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            },
            unchanged: false,
            warnings: [],
        };

        expect(describeBuildResult(result)).toEqual(result);
    });

    it("passes an invalid result through unchanged", () => {
        const result: StudioBuildResult = {
            status: "invalid",
            errors: [{code: "blueprint-reels-invalid", severity: "error", message: '"reels" must be a positive integer.'}],
            warnings: [],
        };

        expect(describeBuildResult(result)).toEqual(result);
    });

    it("renames a load-error's error field to message", () => {
        const result: StudioBuildResult = {status: "load-error", error: "not found"};

        expect(describeBuildResult(result)).toEqual({status: "load-error", message: "not found"});
    });

    it("renames a domain-level error (e.g. a build conflict) to status \"failed\"", () => {
        const result: StudioBuildResult = {status: "error", error: "already exists and contains file(s)"};

        expect(describeBuildResult(result)).toEqual({status: "failed", message: "already exists and contains file(s)"});
    });
});
