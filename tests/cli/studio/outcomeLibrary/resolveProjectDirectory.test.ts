import fs from "fs";
import os from "os";
import path from "path";
import {resolveProjectDirectory} from "../../../../cli/studio/outcomeLibrary/resolveProjectDirectory.js";

describe("resolveProjectDirectory", () => {
    let projectRoot: string;

    beforeEach(() => {
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-resolve-project-directory-test-"));
    });

    afterEach(() => {
        fs.rmSync(projectRoot, {recursive: true, force: true});
    });

    it("resolves an existing directory relative to the project root", () => {
        fs.mkdirSync(path.join(projectRoot, "bundle"));

        const result = resolveProjectDirectory(projectRoot, "bundle");

        expect(result).toEqual({status: "ok", resolvedPath: path.join(projectRoot, "bundle")});
    });

    it("resolves a not-yet-existing path under an ordinary (non-symlinked) project root", () => {
        const result = resolveProjectDirectory(projectRoot, "certification/out");

        expect(result).toEqual({status: "ok", resolvedPath: path.join(projectRoot, "certification", "out")});
    });

    it("rejects a lexical .. escape", () => {
        const result = resolveProjectDirectory(projectRoot, "../outside");

        expect(result.status).toBe("error");
        expect(result.status === "error" && result.message).toContain("resolves outside the project root");
    });

    it("rejects an existing directory that is itself a symlink escaping the project root", () => {
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-resolve-project-directory-outside-"));
        try {
            fs.symlinkSync(outside, path.join(projectRoot, "bundle"));

            const result = resolveProjectDirectory(projectRoot, "bundle");

            expect(result.status).toBe("error");
            expect(result.status === "error" && result.message).toContain("resolves, through a symlink, outside the project root");
        } finally {
            fs.rmSync(outside, {recursive: true, force: true});
        }
    });

    // The core fix: an output path that doesn't exist yet must not be exempted from the symlink check
    // just because its exact leaf isn't there -- a not-yet-existing path escapes just as surely when one
    // of its *ancestors* is a symlink pointing outside the project root. Mirrors what
    // fs.mkdir(resolvedPath, {recursive: true}) would actually walk through on disk.
    describe("nested symlink escape via a not-yet-existing output path", () => {
        it("rejects when an existing intermediate ancestor is a symlink escaping the project root", () => {
            const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-resolve-project-directory-outside-"));
            try {
                fs.symlinkSync(outside, path.join(projectRoot, "evil"));

                const result = resolveProjectDirectory(projectRoot, "evil/nested/certification");

                expect(result.status).toBe("error");
                expect(result.status === "error" && result.message).toContain("resolves, through a symlink, outside the project root");
            } finally {
                fs.rmSync(outside, {recursive: true, force: true});
            }
        });

        it("never lets the escaping path reach an 'ok' result the caller could write through", () => {
            const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-resolve-project-directory-outside-"));
            try {
                fs.symlinkSync(outside, path.join(projectRoot, "evil"));

                const result = resolveProjectDirectory(projectRoot, "evil/deeply/nested/output/dir");

                expect(result.status).toBe("error");
            } finally {
                fs.rmSync(outside, {recursive: true, force: true});
            }
        });

        it("accepts a not-yet-existing nested path whose existing ancestor is an ordinary (non-symlinked) directory", () => {
            fs.mkdirSync(path.join(projectRoot, "certification"));

            const result = resolveProjectDirectory(projectRoot, "certification/2026-07-20/out");

            expect(result).toEqual({status: "ok", resolvedPath: path.join(projectRoot, "certification", "2026-07-20", "out")});
        });

        it("accepts a not-yet-existing nested path whose existing ancestor symlink stays inside the project root", () => {
            fs.mkdirSync(path.join(projectRoot, "real-target"));
            fs.symlinkSync(path.join(projectRoot, "real-target"), path.join(projectRoot, "alias"));

            const result = resolveProjectDirectory(projectRoot, "alias/nested/out");

            expect(result.status).toBe("ok");
        });
    });

    it("reports an error, never throwing, when the project root itself cannot be resolved", () => {
        const realpath = () => {
            throw new Error("simulated realpath failure");
        };

        const result = resolveProjectDirectory(projectRoot, "bundle", realpath);

        expect(result.status).toBe("error");
        expect(result.status === "error" && result.message).toContain("Could not resolve the project root");
    });
});
