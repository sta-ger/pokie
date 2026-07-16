import fs from "fs";
import os from "os";
import path from "path";
import {loadWeightedOutcomeLibraryFromProjectFile} from "../../../../cli/studio/deployment/loadWeightedOutcomeLibraryFromProjectFile.js";

describe("loadWeightedOutcomeLibraryFromProjectFile", () => {
    let projectRoot: string;

    beforeEach(() => {
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-load-library-test-"));
    });

    afterEach(() => {
        fs.rmSync(projectRoot, {recursive: true, force: true});
    });

    it("reads and parses a library file relative to the project root", () => {
        fs.writeFileSync(path.join(projectRoot, "base.json"), JSON.stringify({schemaVersion: 1, libraryId: "lib", outcomes: []}));

        const result = loadWeightedOutcomeLibraryFromProjectFile(projectRoot, "base.json");

        expect(result).toEqual({status: "ok", library: {schemaVersion: 1, libraryId: "lib", outcomes: []}});
    });

    it("reads a library file nested under a subdirectory", () => {
        fs.mkdirSync(path.join(projectRoot, "libraries"));
        fs.writeFileSync(path.join(projectRoot, "libraries", "base.json"), JSON.stringify({schemaVersion: 1, libraryId: "lib", outcomes: []}));

        const result = loadWeightedOutcomeLibraryFromProjectFile(projectRoot, "libraries/base.json");

        expect(result.status).toBe("ok");
    });

    it("reports an error, never throwing, for a missing file", () => {
        const result = loadWeightedOutcomeLibraryFromProjectFile(projectRoot, "missing.json");

        expect(result.status).toBe("error");
        expect(result.status === "error" && result.message).toContain("Could not read");
    });

    it("reports an error for malformed JSON", () => {
        fs.writeFileSync(path.join(projectRoot, "bad.json"), "{ not json");

        const result = loadWeightedOutcomeLibraryFromProjectFile(projectRoot, "bad.json");

        expect(result.status).toBe("error");
        expect(result.status === "error" && result.message).toContain("is not valid JSON");
    });

    it("rejects a libraryPath that escapes the project root via ..", () => {
        const result = loadWeightedOutcomeLibraryFromProjectFile(projectRoot, "../outside.json");

        expect(result.status).toBe("error");
        expect(result.status === "error" && result.message).toContain("resolves outside the project root");
    });

    it("rejects an absolute libraryPath pointing outside the project root", () => {
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-load-library-outside-"));
        try {
            fs.writeFileSync(path.join(outside, "secret.json"), JSON.stringify({schemaVersion: 1, libraryId: "lib", outcomes: []}));

            const result = loadWeightedOutcomeLibraryFromProjectFile(projectRoot, path.join(outside, "secret.json"));

            expect(result.status).toBe("error");
            expect(result.status === "error" && result.message).toContain("resolves outside the project root");
        } finally {
            fs.rmSync(outside, {recursive: true, force: true});
        }
    });

    it("uses the injected readFile rather than touching the real filesystem", () => {
        const readFile = jest.fn(() => JSON.stringify({schemaVersion: 1, libraryId: "injected", outcomes: []}));

        const result = loadWeightedOutcomeLibraryFromProjectFile(projectRoot, "anything.json", readFile);

        expect(readFile).toHaveBeenCalledWith(path.join(projectRoot, "anything.json"));
        expect(result.status).toBe("ok");
        expect(result.status === "ok" && result.library.libraryId).toBe("injected");
    });
});
