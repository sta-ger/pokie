import fs from "fs";
import path from "path";
import {defaultPlatformDirectoryEnvironment, PlatformDirectoryEnvironment} from "./PlatformDirectoryEnvironment.js";

export type UserBaseDirectory = {readonly directory: string; readonly source: "documents" | "home"};

const XDG_DOCUMENTS_DIR_PATTERN = /^\s*XDG_DOCUMENTS_DIR\s*=\s*"(.*)"\s*$/m;

// Windows: %USERPROFILE% is the one stable, always-set answer (Explorer may show a relocated or
// localized "Documents" label, but $USERPROFILE itself is never localized). macOS/Linux: $HOME.
export function resolvePlatformHomeDirectory(env: PlatformDirectoryEnvironment = defaultPlatformDirectoryEnvironment()): string {
    if (env.platform === "win32" && env.env.USERPROFILE && env.env.USERPROFILE.trim().length > 0) {
        return env.env.USERPROFILE;
    }
    return env.homeDir;
}

// Best-effort platform Documents folder. Deliberately returns `undefined` instead of throwing whenever
// it can't be determined, so every caller always has a defined fallback story (see
// resolveUserBaseDirectory below) rather than each needing its own special case for a missing/
// unreadable Documents folder.
export function resolvePlatformDocumentsDirectory(env: PlatformDirectoryEnvironment = defaultPlatformDirectoryEnvironment()): string | undefined {
    const home = resolvePlatformHomeDirectory(env);
    if (!home) {
        return undefined;
    }
    if (env.platform === "win32") {
        // A user-relocated Documents folder (Properties > Location) is recorded in the registry, which
        // Node has no built-in reader for -- %USERPROFILE%\Documents is what every unmodified Windows
        // profile actually resolves to on disk regardless of the (possibly localized) label Explorer
        // shows for it, and isUsableDirectory() below is what catches the relocated-away case (the old
        // path no longer exists) and falls back to Home instead of silently using it.
        return path.win32.join(home, "Documents");
    }
    if (env.platform === "darwin") {
        return path.join(home, "Documents");
    }
    // Linux and every other POSIX platform: honor the XDG user-dirs convention -- moved, localized
    // (e.g. "Dokumente"), and disabled (xdg-user-dirs-update sets XDG_DOCUMENTS_DIR to $HOME itself)
    // Documents folders are all expressed through it -- before falling back to the "~/Documents"
    // convention every desktop environment still defaults new profiles to.
    return readXdgDocumentsDirectory(env, home) ?? path.join(home, "Documents");
}

function readXdgDocumentsDirectory(env: PlatformDirectoryEnvironment, home: string): string | undefined {
    if (env.env.XDG_DOCUMENTS_DIR && env.env.XDG_DOCUMENTS_DIR.trim().length > 0) {
        return expandXdgHomeToken(env.env.XDG_DOCUMENTS_DIR, home);
    }
    const configHome = env.env.XDG_CONFIG_HOME && env.env.XDG_CONFIG_HOME.trim().length > 0 ? env.env.XDG_CONFIG_HOME : path.join(home, ".config");
    try {
        const contents = fs.readFileSync(path.join(configHome, "user-dirs.dirs"), "utf-8");
        const match = contents.match(XDG_DOCUMENTS_DIR_PATTERN);
        return match ? expandXdgHomeToken(match[1], home) : undefined;
    } catch {
        return undefined;
    }
}

function expandXdgHomeToken(rawValue: string, home: string): string {
    return rawValue.startsWith("$HOME") ? home + rawValue.slice("$HOME".length) : rawValue;
}

// True when `directory` exists, is actually a directory (not, say, a file some other app already put
// at the "Documents" path), and is writable by the current process. The one gate every default-
// directory candidate below must pass -- a moved-away, XDG-disabled, or permission-locked-down folder
// falls through to the next candidate instead of being handed to a caller about to create a project in
// it. Drive letters, UNC shares, and symlinked folders are all handled the same way: fs.statSync/
// fs.accessSync follow both transparently, so a symlinked or network-mounted Documents folder is
// "usable" exactly when the OS itself would treat it as such.
export function isUsableDirectory(directory: string): boolean {
    let stats: fs.Stats;
    try {
        stats = fs.statSync(directory);
    } catch {
        return false;
    }
    if (!stats.isDirectory()) {
        return false;
    }
    try {
        fs.accessSync(directory, fs.constants.W_OK);
        return true;
    } catch {
        return false;
    }
}

// The one "where should a brand-new, independent POKIE project live by default" answer: the platform
// Documents folder when it resolves to a real, writable directory, the platform home directory
// otherwise -- see resolvePlatformDocumentsDirectory's own comment for how a moved, localized, or
// disabled Documents folder is handled. Never CWD, never anywhere derived from where POKIE itself is
// installed or running from -- see isUnsafeStartDirectory.ts, which PokiePathResolver double-checks
// this result against before ever handing a default back to a caller.
export function resolveUserBaseDirectory(env: PlatformDirectoryEnvironment = defaultPlatformDirectoryEnvironment()): UserBaseDirectory {
    const documents = resolvePlatformDocumentsDirectory(env);
    if (documents && isUsableDirectory(documents)) {
        return {directory: documents, source: "documents"};
    }
    return {directory: resolvePlatformHomeDirectory(env), source: "home"};
}
