import fs from "fs";
import os from "os";
import path from "path";
import {PokiePathResolver} from "../../../cli/paths/PokiePathResolver.js";
import {PlatformDirectoryEnvironment} from "../../../cli/paths/PlatformDirectoryEnvironment.js";

describe("PokiePathResolver", () => {
    describe("resolveIndependentProjectDirectory", () => {
        let tmpDir: string;

        beforeEach(() => {
            // Deliberately NOT under os.tmpdir(): the temp/cache directory is itself on the unsafe-
            // default list (see isUnsafeStartDirectory.test.ts), so a fixture rooted there would trip
            // that guard and mask what these "happy path" tests are actually meant to exercise.
            fs.mkdirSync(path.join(process.cwd(), ".pokie-path-resolver-fixtures"), {recursive: true});
            tmpDir = fs.mkdtempSync(path.join(process.cwd(), ".pokie-path-resolver-fixtures", "run-"));
        });

        afterEach(() => {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        });

        afterAll(() => {
            fs.rmSync(path.join(process.cwd(), ".pokie-path-resolver-fixtures"), {recursive: true, force: true});
        });

        it("resolves to Documents/POKIE/<name> when Documents is usable", () => {
            const documents = path.join(tmpDir, "Documents");
            fs.mkdirSync(documents);
            const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: tmpDir};
            // The default unsafe-directory context (real process.cwd()) would never overlap with a
            // tmpDir-rooted fixture, but os.tmpdir() itself is on the unsafe list -- pass an explicit
            // cwd so only the tmpdir-containment check would apply, and confirm it's the Documents
            // fixture (not the real OS temp dir) that gets resolved.
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, env);

            const result = resolver.resolveIndependentProjectDirectory("sample-slot");

            expect(result).toEqual({status: "ok", directory: path.join(documents, "POKIE", "sample-slot"), source: "documents"});
        });

        it("falls back to Home/POKIE/<name> when Documents does not resolve", () => {
            const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: tmpDir};
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, env);

            const result = resolver.resolveIndependentProjectDirectory("sample-slot");

            expect(result).toEqual({status: "ok", directory: path.join(tmpDir, "POKIE", "sample-slot"), source: "home"});
        });

        it("rejects a blank name", () => {
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, {platform: "linux", env: {}, homeDir: tmpDir});

            expect(resolver.resolveIndependentProjectDirectory("   ")).toEqual({status: "error", message: "A project name is required."});
        });

        it("rejects a name containing path separators or traversal segments", () => {
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, {platform: "linux", env: {}, homeDir: tmpDir});

            expect(resolver.resolveIndependentProjectDirectory("../escape").status).toBe("error");
            expect(resolver.resolveIndependentProjectDirectory("nested/name").status).toBe("error");
        });

        it("never silently resolves into the OS temp directory even when Home itself is inside it", () => {
            // Simulates a broken/misconfigured environment where the computed Home directory happens to
            // land inside the OS temp dir -- the unsafe-start-directory guard must still refuse it
            // rather than silently handing back a temp-dir-rooted default.
            const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: path.join(os.tmpdir(), "not-a-real-home")};
            const resolver = new PokiePathResolver({}, env);

            const result = resolver.resolveIndependentProjectDirectory("sample-slot");

            expect(result.status).toBe("error");
        });

        it("never silently resolves into Studio's own internal directory", () => {
            const documents = path.join(tmpDir, "Documents");
            fs.mkdirSync(documents, {recursive: true});
            const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: tmpDir};
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated", studioRoot: documents}, env);

            const result = resolver.resolveIndependentProjectDirectory("sample-slot");

            expect(result.status).toBe("error");
        });
    });

    describe("resolveProjectRelativeDirectory", () => {
        let projectRoot: string;

        beforeEach(() => {
            projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-path-resolver-project-test-"));
        });

        afterEach(() => {
            fs.rmSync(projectRoot, {recursive: true, force: true});
        });

        it("resolves a path nested inside the project root", () => {
            const resolver = new PokiePathResolver();

            const result = resolver.resolveProjectRelativeDirectory(projectRoot, "certification/out");

            expect(result).toEqual({status: "ok", resolvedPath: path.join(projectRoot, "certification", "out")});
        });

        it("rejects a traversal escape", () => {
            const resolver = new PokiePathResolver();

            const result = resolver.resolveProjectRelativeDirectory(projectRoot, "../outside");

            expect(result.status).toBe("error");
        });
    });
});
