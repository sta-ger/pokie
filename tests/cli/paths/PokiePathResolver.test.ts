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

        it("resolves to Documents/POKIE Projects/<name> when Documents is usable", () => {
            const documents = path.join(tmpDir, "Documents");
            fs.mkdirSync(documents);
            const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: tmpDir};
            // The default unsafe-directory context (real process.cwd()) would never overlap with a
            // tmpDir-rooted fixture, but os.tmpdir() itself is on the unsafe list -- pass an explicit
            // cwd so only the tmpdir-containment check would apply, and confirm it's the Documents
            // fixture (not the real OS temp dir) that gets resolved.
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, env);

            const result = resolver.resolveIndependentProjectDirectory("sample-slot");

            expect(result).toEqual({status: "valid", directory: path.join(documents, "POKIE Projects", "sample-slot"), source: "documents"});
        });

        it("falls back to Home/POKIE Projects/<name> when Documents does not resolve", () => {
            const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: tmpDir};
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, env);

            const result = resolver.resolveIndependentProjectDirectory("sample-slot");

            expect(result).toEqual({status: "valid", directory: path.join(tmpDir, "POKIE Projects", "sample-slot"), source: "home"});
        });

        it("rejects a blank name", () => {
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, {platform: "linux", env: {}, homeDir: tmpDir});

            expect(resolver.resolveIndependentProjectDirectory("   ")).toEqual({status: "invalid-name", message: "A project name is required."});
        });

        it("rejects a name containing path separators or traversal segments", () => {
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, {platform: "linux", env: {}, homeDir: tmpDir});

            expect(resolver.resolveIndependentProjectDirectory("../escape").status).toBe("invalid-name");
            expect(resolver.resolveIndependentProjectDirectory("nested/name").status).toBe("invalid-name");
        });

        it("uses an isolated temporary Home as the explicit root for a fresh Studio profile", () => {
            // A fresh Studio/registry can intentionally use a disposable HOME. The project remains
            // beneath that exact profile root; arbitrary temp paths and escaping symlinks stay unsafe.
            const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-temp-home-test-"));
            try {
                const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: tempHome};
                const resolver = new PokiePathResolver({}, env);

                const result = resolver.resolveIndependentProjectDirectory("sample-slot");

                expect(result).toEqual({status: "valid", directory: path.join(tempHome, "POKIE Projects", "sample-slot"), source: "home"});
            } finally {
                fs.rmSync(tempHome, {recursive: true, force: true});
            }
        });

        it("resolves a not-yet-created isolated Home so the first managed save can bootstrap it", () => {
            const profileParent = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-temp-home-parent-test-"));
            const missingHome = path.join(profileParent, "fresh-profile");
            try {
                const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: missingHome};

                expect(new PokiePathResolver({}, env).resolveIndependentProjectDirectory("valera-mathematician")).toEqual({
                    status: "valid",
                    directory: path.join(missingHome, "POKIE Projects", "valera-mathematician"),
                    source: "home",
                });
            } finally {
                fs.rmSync(profileParent, {recursive: true, force: true});
            }
        });

        it("uses an isolated temporary Documents folder only when it stays inside that profile", () => {
            const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-temp-home-documents-test-"));
            try {
                const documents = path.join(tempHome, "Documents");
                fs.mkdirSync(documents);
                const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: tempHome};

                expect(new PokiePathResolver({}, env).resolveIndependentProjectDirectory("valera-mathematician")).toEqual({
                    status: "valid",
                    directory: path.join(documents, "POKIE Projects", "valera-mathematician"),
                    source: "documents",
                });
            } finally {
                fs.rmSync(tempHome, {recursive: true, force: true});
            }
        });

        it("rejects a Documents symlink whose real destination is the OS temp directory", () => {
            const realTarget = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-symlink-target-"));
            try {
                fs.symlinkSync(realTarget, path.join(tmpDir, "Documents"), "dir");
                const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: tmpDir};
                const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, env);

                const result = resolver.resolveIndependentProjectDirectory("sample-slot");

                expect(result.status).toBe("unsafe-path");
            } finally {
                fs.rmSync(realTarget, {recursive: true, force: true});
            }
        });

        it("keeps a benign symlinked Documents directory usable", () => {
            const fixturesRoot = path.join(process.cwd(), ".pokie-path-resolver-fixtures");
            const realTarget = fs.mkdtempSync(path.join(fixturesRoot, "real-documents-"));
            try {
                const documentsLink = path.join(tmpDir, "Documents");
                fs.symlinkSync(realTarget, documentsLink, "dir");
                const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: tmpDir};
                const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, env);

                const result = resolver.resolveIndependentProjectDirectory("sample-slot");

                expect(result).toEqual({status: "valid", directory: path.join(documentsLink, "POKIE Projects", "sample-slot"), source: "documents"});
            } finally {
                fs.rmSync(realTarget, {recursive: true, force: true});
            }
        });

        it("never silently resolves into Studio's own internal directory", () => {
            const documents = path.join(tmpDir, "Documents");
            fs.mkdirSync(documents, {recursive: true});
            const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: tmpDir};
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated", studioRoot: documents}, env);

            const result = resolver.resolveIndependentProjectDirectory("sample-slot");

            expect(result.status).toBe("unsafe-path");
        });

        it("reports the unresolved state when the base-directory lookup can't determine a home directory at all", () => {
            const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: tmpDir};
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, env, () => ({status: "unresolved"}));

            const result = resolver.resolveIndependentProjectDirectory("sample-slot");

            expect(result.status).toBe("unresolved");
            expect((result as {message: string}).message.length).toBeGreaterThan(0);
        });

        it("reports the absent state when Home itself does not exist", () => {
            const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: tmpDir};
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, env, () => ({status: "absent", directory: "/no/such/home"}));

            const result = resolver.resolveIndependentProjectDirectory("sample-slot");

            expect(result).toEqual({status: "absent", message: 'The default project location "/no/such/home" does not exist.'});
        });

        it("reports the type state when Home resolves to a non-directory", () => {
            const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: tmpDir};
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, env, () => ({status: "type", directory: "/home/a-file"}));

            const result = resolver.resolveIndependentProjectDirectory("sample-slot");

            expect(result).toEqual({status: "type", message: 'The default project location "/home/a-file" is not a directory.'});
        });

        it("reports the permission state when Home is not writable", () => {
            const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: tmpDir};
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, env, () => ({status: "permission", directory: "/home/locked"}));

            const result = resolver.resolveIndependentProjectDirectory("sample-slot");

            expect(result).toEqual({status: "permission", message: 'The default project location "/home/locked" is not writable.'});
        });

        it("joins a win32 base directory using Windows path semantics regardless of the host OS", () => {
            // Bypasses PlatformDirectories' own fs-backed usability check (a Windows-style path can't be
            // meaningfully validated against a non-Windows test host's real filesystem -- see
            // PlatformDirectories.test.ts for that layer's own coverage) so this test isolates exactly
            // what it's meant to check: that the base directory and project name are joined with
            // backslashes, not the host's forward-slash path.join.
            const env: PlatformDirectoryEnvironment = {platform: "win32", env: {USERPROFILE: "C:\\Users\\alice"}, homeDir: "C:\\Users\\alice"};
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, env, () => ({
                status: "valid",
                directory: "C:\\Users\\alice\\Documents",
                source: "documents",
            }));

            const result = resolver.resolveIndependentProjectDirectory("sample-slot");

            expect(result).toEqual({status: "valid", directory: "C:\\Users\\alice\\Documents\\POKIE Projects\\sample-slot", source: "documents"});
        });

        it("joins a relocated/localized win32 Documents base directory using Windows path semantics", () => {
            const env: PlatformDirectoryEnvironment = {platform: "win32", env: {USERPROFILE: "C:\\Users\\alice"}, homeDir: "C:\\Users\\alice"};
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, env, () => ({
                status: "valid",
                directory: "D:\\MyStuff\\Dokumente",
                source: "documents",
            }));

            const result = resolver.resolveIndependentProjectDirectory("sample-slot");

            expect(result).toEqual({status: "valid", directory: "D:\\MyStuff\\Dokumente\\POKIE Projects\\sample-slot", source: "documents"});
        });

        it("falls back to a win32 Home base directory using Windows path semantics when Documents is disabled/unusable", () => {
            const env: PlatformDirectoryEnvironment = {platform: "win32", env: {USERPROFILE: "C:\\Users\\alice"}, homeDir: "C:\\Users\\alice"};
            const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, env, () => ({
                status: "valid",
                directory: "C:\\Users\\alice",
                source: "home",
            }));

            const result = resolver.resolveIndependentProjectDirectory("sample-slot");

            expect(result).toEqual({status: "valid", directory: "C:\\Users\\alice\\POKIE Projects\\sample-slot", source: "home"});
        });

        it("flags a win32 default that resolves into the install root using Windows path semantics, regardless of host platform", () => {
            const env: PlatformDirectoryEnvironment = {platform: "win32", env: {USERPROFILE: "C:\\Users\\alice"}, homeDir: "C:\\Users\\alice"};
            const resolver = new PokiePathResolver(
                {cwd: "/somewhere/unrelated", installRoot: "C:\\Program Files\\Pokie"},
                env,
                () => ({status: "valid", directory: "C:\\Program Files\\Pokie\\Documents", source: "documents"}),
            );

            const result = resolver.resolveIndependentProjectDirectory("sample-slot");

            expect(result.status).toBe("unsafe-path");
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

    describe("resolveBaseDirectory", () => {
        it("reports the same Documents/Home policy as resolveIndependentProjectDirectory, without a POKIE Projects/<name> suffix", () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-path-resolver-base-test-"));
            try {
                const documents = path.join(tmpDir, "Documents");
                fs.mkdirSync(documents);
                const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: tmpDir};
                const resolver = new PokiePathResolver({cwd: "/somewhere/unrelated"}, env);

                const result = resolver.resolveBaseDirectory();

                expect(result).toEqual({status: "valid", directory: documents, source: "documents"});
            } finally {
                fs.rmSync(tmpDir, {recursive: true, force: true});
            }
        });
    });

    describe("resolveAppDataDirectory", () => {
        it("delegates to resolvePlatformAppDataDirectory using the resolver's own env, honoring XDG_CONFIG_HOME rather than a hardcoded Linux home path", () => {
            const env: PlatformDirectoryEnvironment = {platform: "linux", env: {XDG_CONFIG_HOME: "/home/alice/.config-custom"}, homeDir: "/home/alice"};
            const resolver = new PokiePathResolver({}, env);

            expect(resolver.resolveAppDataDirectory()).toBe("/home/alice/.config-custom/pokie");
        });

        it("returns undefined when no home directory can be determined", () => {
            const env: PlatformDirectoryEnvironment = {platform: "linux", env: {}, homeDir: ""};
            const resolver = new PokiePathResolver({}, env);

            expect(resolver.resolveAppDataDirectory()).toBeUndefined();
        });
    });
});
