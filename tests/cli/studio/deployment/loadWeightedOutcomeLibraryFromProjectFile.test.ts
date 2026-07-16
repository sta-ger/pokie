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

    describe("realpath containment — a symlink placed inside the project pointing outside it", () => {
        it("rejects a symlink whose real target resolves outside the project root", () => {
            const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-load-library-symlink-outside-"));
            try {
                const secretPath = path.join(outside, "secret.json");
                fs.writeFileSync(secretPath, JSON.stringify({schemaVersion: 1, libraryId: "secret", outcomes: []}));
                const linkPath = path.join(projectRoot, "link.json");
                fs.symlinkSync(secretPath, linkPath);

                const result = loadWeightedOutcomeLibraryFromProjectFile(projectRoot, "link.json");

                expect(result.status).toBe("error");
                expect(result.status === "error" && result.message).toContain("resolves, through a symlink, outside the project root");
            } finally {
                fs.rmSync(outside, {recursive: true, force: true});
            }
        });

        it("never actually reads the symlink's target when it escapes the project root", () => {
            const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-load-library-symlink-outside-"));
            try {
                fs.writeFileSync(path.join(outside, "secret.json"), JSON.stringify({schemaVersion: 1, libraryId: "secret", outcomes: []}));
                fs.symlinkSync(path.join(outside, "secret.json"), path.join(projectRoot, "link.json"));
                const readFile = jest.fn(() => {
                    throw new Error("should never be called");
                });

                loadWeightedOutcomeLibraryFromProjectFile(projectRoot, "link.json", readFile);

                expect(readFile).not.toHaveBeenCalled();
            } finally {
                fs.rmSync(outside, {recursive: true, force: true});
            }
        });

        it("accepts a symlink whose real target stays inside the project root", () => {
            fs.writeFileSync(path.join(projectRoot, "real.json"), JSON.stringify({schemaVersion: 1, libraryId: "lib", outcomes: []}));
            fs.symlinkSync(path.join(projectRoot, "real.json"), path.join(projectRoot, "link.json"));

            const result = loadWeightedOutcomeLibraryFromProjectFile(projectRoot, "link.json");

            expect(result).toEqual({status: "ok", library: {schemaVersion: 1, libraryId: "lib", outcomes: []}});
        });

        it("falls through to the ordinary read attempt (not a symlink-escape error) for a broken symlink", () => {
            fs.symlinkSync(path.join(projectRoot, "does-not-exist.json"), path.join(projectRoot, "broken-link.json"));

            const result = loadWeightedOutcomeLibraryFromProjectFile(projectRoot, "broken-link.json");

            expect(result.status).toBe("error");
            expect(result.status === "error" && result.message).toContain("Could not read");
        });

        it("uses the injected realpath rather than touching the real filesystem", () => {
            const realpath = jest.fn((resolvedPath: string) => resolvedPath);
            const readFile = jest.fn(() => JSON.stringify({schemaVersion: 1, libraryId: "injected", outcomes: []}));

            const result = loadWeightedOutcomeLibraryFromProjectFile(projectRoot, "anything.json", readFile, realpath);

            expect(realpath).toHaveBeenCalledWith(path.resolve(projectRoot));
            expect(realpath).toHaveBeenCalledWith(path.join(projectRoot, "anything.json"));
            expect(result.status).toBe("ok");
        });

        it("reports an error, never throwing, when the project root itself cannot be resolved", () => {
            const realpath = () => {
                throw new Error("simulated realpath failure");
            };

            const result = loadWeightedOutcomeLibraryFromProjectFile(projectRoot, "base.json", undefined, realpath);

            expect(result.status).toBe("error");
            expect(result.status === "error" && result.message).toContain("Could not resolve the project root");
        });
    });
});
