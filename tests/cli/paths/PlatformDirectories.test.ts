import fs from "fs";
import os from "os";
import path from "path";
import {
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
    it("resolves win32 to USERPROFILE\\Documents", () => {
        expect(resolvePlatformDocumentsDirectory(buildEnv({platform: "win32", env: {USERPROFILE: "C:\\Users\\alice"}}))).toBe(
            "C:\\Users\\alice\\Documents",
        );
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

        expect(resolveUserBaseDirectory(env)).toEqual({directory: documents, source: "documents"});
    });

    it("falls back to Home when Documents does not exist (moved/disabled)", () => {
        const env = buildEnv({env: {}, homeDir: tmpDir});

        expect(resolveUserBaseDirectory(env)).toEqual({directory: tmpDir, source: "home"});
    });
});
