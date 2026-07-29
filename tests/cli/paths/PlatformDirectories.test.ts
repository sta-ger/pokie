import fs from "fs";
import os from "os";
import path from "path";
import {
    checkDirectoryUsability,
    isUsableDirectory,
    resolvePlatformDocumentsDirectory,
    resolvePlatformHomeDirectory,
    resolveUserBaseDirectory,
} from "../../../cli/paths/PlatformDirectories.js";
import {PlatformDirectoryEnvironment} from "../../../cli/paths/PlatformDirectoryEnvironment.js";

function buildEnv(overrides: Partial<PlatformDirectoryEnvironment> = {}): PlatformDirectoryEnvironment {
    return {platform: "linux", env: {}, homeDir: "/home/alice", ...overrides};
}

describe("resolvePlatformHomeDirectory", () => {
    it("uses USERPROFILE on win32", () => {
        expect(resolvePlatformHomeDirectory(buildEnv({platform: "win32", env: {USERPROFILE: "C:\\Users\\alice"}}))).toBe("C:\\Users\\alice");
    });

    it("falls back to homeDir on win32 when USERPROFILE is unset", () => {
        expect(resolvePlatformHomeDirectory(buildEnv({platform: "win32", env: {}, homeDir: "C:\\Users\\alice"}))).toBe("C:\\Users\\alice");
    });

    it("uses homeDir on darwin/linux", () => {
        expect(resolvePlatformHomeDirectory(buildEnv({platform: "darwin", homeDir: "/Users/alice"}))).toBe("/Users/alice");
        expect(resolvePlatformHomeDirectory(buildEnv({platform: "linux", homeDir: "/home/alice"}))).toBe("/home/alice");
    });
});

describe("resolvePlatformDocumentsDirectory", () => {
    it("resolves win32 to USERPROFILE\\Documents when no known-folder override is available", () => {
        expect(resolvePlatformDocumentsDirectory(buildEnv({platform: "win32", env: {USERPROFILE: "C:\\Users\\alice"}}))).toBe(
            "C:\\Users\\alice\\Documents",
        );
    });

    it("prefers a relocated Documents folder reported by the win32 known-folder lookup", () => {
        const env = buildEnv({
            platform: "win32",
            env: {USERPROFILE: "C:\\Users\\alice"},
            readWindowsDocumentsFolder: () => "D:\\MyStuff\\Documents",
        });
        expect(resolvePlatformDocumentsDirectory(env)).toBe("D:\\MyStuff\\Documents");
    });

    it("prefers a localized Documents folder reported by the win32 known-folder lookup", () => {
        const env = buildEnv({
            platform: "win32",
            env: {USERPROFILE: "C:\\Users\\alice"},
            readWindowsDocumentsFolder: () => "C:\\Users\\alice\\Dokumente",
        });
        expect(resolvePlatformDocumentsDirectory(env)).toBe("C:\\Users\\alice\\Dokumente");
    });

    it("falls back to USERPROFILE\\Documents when the win32 known-folder lookup can't determine one", () => {
        const env = buildEnv({platform: "win32", env: {USERPROFILE: "C:\\Users\\alice"}, readWindowsDocumentsFolder: () => undefined});
        expect(resolvePlatformDocumentsDirectory(env)).toBe("C:\\Users\\alice\\Documents");
    });

    it("resolves darwin to ~/Documents", () => {
        expect(resolvePlatformDocumentsDirectory(buildEnv({platform: "darwin", homeDir: "/Users/alice"}))).toBe("/Users/alice/Documents");
    });

    it("resolves linux to XDG_DOCUMENTS_DIR when the env var is set directly", () => {
        const env = buildEnv({env: {XDG_DOCUMENTS_DIR: "/home/alice/Dokumente"}});
        expect(resolvePlatformDocumentsDirectory(env)).toBe("/home/alice/Dokumente");
    });

    it("resolves linux to ~/Documents when nothing XDG-related is set", () => {
        expect(resolvePlatformDocumentsDirectory(buildEnv({env: {}}))).toBe("/home/alice/Documents");
    });

    it("expands a $HOME-relative XDG_DOCUMENTS_DIR value", () => {
        const env = buildEnv({env: {XDG_DOCUMENTS_DIR: "$HOME/Dokumente"}, homeDir: "/home/alice"});
        expect(resolvePlatformDocumentsDirectory(env)).toBe("/home/alice/Dokumente");
    });

    it("reads XDG_DOCUMENTS_DIR from user-dirs.dirs when the env var itself is unset", () => {
        const configHome = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-xdg-config-test-"));
        try {
            fs.writeFileSync(
                path.join(configHome, "user-dirs.dirs"),
                '# comment\nXDG_DOWNLOAD_DIR="$HOME/Downloads"\nXDG_DOCUMENTS_DIR="$HOME/MyDocs"\n',
            );
            const env = buildEnv({env: {XDG_CONFIG_HOME: configHome}, homeDir: "/home/alice"});
            expect(resolvePlatformDocumentsDirectory(env)).toBe("/home/alice/MyDocs");
        } finally {
            fs.rmSync(configHome, {recursive: true, force: true});
        }
    });

    it("treats a disabled XDG Documents folder (set to $HOME itself) the same as any other resolvable value", () => {
        const env = buildEnv({env: {XDG_DOCUMENTS_DIR: "$HOME"}, homeDir: "/home/alice"});
        expect(resolvePlatformDocumentsDirectory(env)).toBe("/home/alice");
    });
});

describe("isUsableDirectory", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-usable-directory-test-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, {recursive: true, force: true});
    });

    it("is true for an existing, writable directory", () => {
        expect(isUsableDirectory(tmpDir)).toBe(true);
    });

    it("is false for a missing directory", () => {
        expect(isUsableDirectory(path.join(tmpDir, "does-not-exist"))).toBe(false);
    });

    it("is false for a path that is a file, not a directory", () => {
        const filePath = path.join(tmpDir, "a-file");
        fs.writeFileSync(filePath, "content");
        expect(isUsableDirectory(filePath)).toBe(false);
    });
});

describe("checkDirectoryUsability", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-directory-usability-test-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, {recursive: true, force: true});
    });

    it("reports valid for an existing, writable directory", () => {
        expect(checkDirectoryUsability(tmpDir)).toEqual({status: "valid"});
    });

    it("reports absent for a missing directory", () => {
        expect(checkDirectoryUsability(path.join(tmpDir, "does-not-exist"))).toEqual({status: "absent"});
    });

    it("reports type for a path that is a file, not a directory", () => {
        const filePath = path.join(tmpDir, "a-file");
        fs.writeFileSync(filePath, "content");
        expect(checkDirectoryUsability(filePath)).toEqual({status: "type"});
    });

    it("reports permission when the writability check fails, via injected stat/access", () => {
        // Real chmod-based permission denial is unreliable in CI (root bypasses filesystem permission
        // checks entirely), so this exercises the "exists as a directory but access() fails" branch
        // through the injectable stat/access seam instead.
        const stats = fs.statSync(tmpDir);
        const result = checkDirectoryUsability(
            tmpDir,
            () => stats,
            () => {
                throw Object.assign(new Error("EACCES"), {code: "EACCES"});
            },
        );
        expect(result).toEqual({status: "permission"});
    });
});

describe("resolveUserBaseDirectory", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-user-base-directory-test-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, {recursive: true, force: true});
    });

    it("prefers a usable Documents directory", () => {
        const documents = path.join(tmpDir, "Documents");
        fs.mkdirSync(documents);
        const env = buildEnv({env: {}, homeDir: tmpDir});

        expect(resolveUserBaseDirectory(env)).toEqual({status: "valid", directory: documents, source: "documents"});
    });

    it("falls back to Home when Documents does not exist (moved/disabled)", () => {
        const env = buildEnv({env: {}, homeDir: tmpDir});

        expect(resolveUserBaseDirectory(env)).toEqual({status: "valid", directory: tmpDir, source: "home"});
    });

    it("falls back to Home when Documents exists but is a file, not a directory", () => {
        const documents = path.join(tmpDir, "Documents");
        fs.writeFileSync(documents, "not a directory");
        const env = buildEnv({env: {}, homeDir: tmpDir});

        expect(resolveUserBaseDirectory(env)).toEqual({status: "valid", directory: tmpDir, source: "home"});
    });

    it("reports absent when Home itself does not exist either", () => {
        const missingHome = path.join(tmpDir, "does-not-exist");
        const env = buildEnv({env: {}, homeDir: missingHome});

        expect(resolveUserBaseDirectory(env)).toEqual({status: "absent", directory: missingHome});
    });

    it("reports type when Home exists but is a file, not a directory", () => {
        const homeFile = path.join(tmpDir, "home-file");
        fs.writeFileSync(homeFile, "not a directory");
        const env = buildEnv({env: {}, homeDir: homeFile});

        expect(resolveUserBaseDirectory(env)).toEqual({status: "type", directory: homeFile});
    });

    it("reports unresolved when no home directory could be determined at all", () => {
        const env = buildEnv({env: {}, homeDir: ""});

        expect(resolveUserBaseDirectory(env)).toEqual({status: "unresolved"});
    });

    it("reports permission when Home exists as a directory but its usability check fails, via injected checkUsability", () => {
        const env = buildEnv({env: {}, homeDir: tmpDir});
        const checkUsability = jest.fn((directory: string) =>
            directory === tmpDir ? {status: "permission" as const} : {status: "absent" as const},
        );

        expect(resolveUserBaseDirectory(env, checkUsability)).toEqual({status: "permission", directory: tmpDir});
    });

    it("resolves a relocated/localized win32 Documents folder as the base directory using an injected usability check", () => {
        // The win32 Documents folder reported by the known-folder lookup is a Windows-style path -- real
        // fs.statSync on a non-Windows test host can't meaningfully validate it, so this injects a
        // deterministic usability check instead (see PokiePathResolver.test.ts for the equivalent,
        // end-to-end "does the win32 path actually get joined with win32 semantics" coverage).
        const env = buildEnv({
            platform: "win32",
            env: {USERPROFILE: "C:\\Users\\alice"},
            readWindowsDocumentsFolder: () => "D:\\MyStuff\\Dokumente",
        });
        const checkUsability = jest.fn(() => ({status: "valid" as const}));

        expect(resolveUserBaseDirectory(env, checkUsability)).toEqual({
            status: "valid",
            directory: "D:\\MyStuff\\Dokumente",
            source: "documents",
        });
        expect(checkUsability).toHaveBeenCalledWith("D:\\MyStuff\\Dokumente");
    });

    it("falls back to win32 Home when a relocated/localized Documents folder is reported but unusable", () => {
        const env = buildEnv({
            platform: "win32",
            env: {USERPROFILE: "C:\\Users\\alice"},
            readWindowsDocumentsFolder: () => "D:\\MyStuff\\Dokumente",
        });
        const checkUsability = jest.fn((directory: string) => ({status: directory === "C:\\Users\\alice" ? ("valid" as const) : ("absent" as const)}));

        expect(resolveUserBaseDirectory(env, checkUsability)).toEqual({status: "valid", directory: "C:\\Users\\alice", source: "home"});
    });
});
