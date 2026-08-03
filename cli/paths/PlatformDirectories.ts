import fs from "fs";
import path from "path";
import {defaultPlatformDirectoryEnvironment, PlatformDirectoryEnvironment} from "./PlatformDirectoryEnvironment.js";

// Explicit outcome of checking whether a candidate directory can actually be used as a default
// location: "absent" (doesn't exist -- moved, deleted, or never created), "type" (something exists at
// that path but isn't a directory), "permission" (exists and is a directory, but isn't writable by the
// current process). Kept separate from the two path-safety concerns handled elsewhere -- "unresolved"
// (no home directory could be determined at all) and "unsafe-path" (isUnsafeStartDirectory.ts) -- which
// live on UserBaseDirectoryResult/PokiePathResolver's own result type instead, since neither is a
// property of one specific directory the way these three are.
export type DirectoryUsabilityResult =
    | {readonly status: "valid"}
    | {readonly status: "absent"}
    | {readonly status: "type"}
    | {readonly status: "permission"};

export type UserBaseDirectoryResult =
    | {readonly status: "valid"; readonly directory: string; readonly source: "documents" | "home"}
    | {readonly status: "absent"; readonly directory: string}
    | {readonly status: "type"; readonly directory: string}
    | {readonly status: "permission"; readonly directory: string}
    | {readonly status: "unresolved"};

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
        // Ask the per-user shell-folders registry key for the actual "Personal" known folder first --
        // it reflects a user-relocated (Properties > Location) or localized ("Dokumente", ...) Documents
        // folder, unlike the %USERPROFILE%\Documents convention below, which only holds for an
        // unmodified profile. See PlatformDirectoryEnvironment.ts for how that lookup is made and why
        // it's injectable. checkDirectoryUsability()/resolveUserBaseDirectory below are what catch a
        // relocated-away case (the reported path no longer exists) and fall back to Home instead of
        // silently using it.
        const knownFolder = env.readWindowsDocumentsFolder?.();
        if (knownFolder && knownFolder.trim().length > 0) {
            return knownFolder;
        }
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

// Best-effort platform per-user application-data directory -- where POKIE's own internal state (the
// Studio project registry, see cli/studio/StudioProjectRegistry.ts) lives, as opposed to
// resolvePlatformDocumentsDirectory's user-facing "where do new project files go" answer above. Windows:
// %APPDATA% (Roaming), falling back to the USERPROFILE-relative convention when unset. macOS: the
// standard "Library/Application Support" convention. Linux and every other POSIX platform: the XDG Base
// Directory spec's $XDG_CONFIG_HOME, falling back to "~/.config" -- never a bare "~/.pokie" or other
// hardcoded dotfile, so a user who has already relocated $XDG_CONFIG_HOME is honored the same way
// readXdgDocumentsDirectory honors a relocated $XDG_DOCUMENTS_DIR above. Returns `undefined` only when no
// home directory could be determined at all, same as resolvePlatformDocumentsDirectory.
export function resolvePlatformAppDataDirectory(env: PlatformDirectoryEnvironment = defaultPlatformDirectoryEnvironment()): string | undefined {
    const home = resolvePlatformHomeDirectory(env);
    if (!home) {
        return undefined;
    }
    if (env.platform === "win32") {
        const roaming = env.env.APPDATA && env.env.APPDATA.trim().length > 0 ? env.env.APPDATA : path.win32.join(home, "AppData", "Roaming");
        return path.win32.join(roaming, "pokie");
    }
    if (env.platform === "darwin") {
        return path.join(home, "Library", "Application Support", "pokie");
    }
    const xdgConfigHome = env.env.XDG_CONFIG_HOME && env.env.XDG_CONFIG_HOME.trim().length > 0 ? env.env.XDG_CONFIG_HOME : path.join(home, ".config");
    return path.join(xdgConfigHome, "pokie");
}

// The one gate every default-directory candidate below must pass, broken out into which of the three
// ways it can fail: doesn't exist ("absent"), exists but isn't a directory -- e.g. a file some other app
// already put at the "Documents" path -- ("type"), or exists as a directory but isn't writable by the
// current process ("permission"). Drive letters, UNC shares, and symlinked folders are all handled the
// same way: fs.statSync/fs.accessSync follow both transparently, so a symlinked or network-mounted
// Documents folder is "valid" exactly when the OS itself would treat it as such. `stat`/`access` are
// injectable so callers can exercise each outcome (including "permission", which real filesystem
// permissions can't deterministically simulate when tests run as root) without touching real fs state.
export function checkDirectoryUsability(
    directory: string,
    stat: (target: string) => fs.Stats = (target) => fs.statSync(target),
    access: (target: string, mode: number) => void = (target, mode) => fs.accessSync(target, mode),
): DirectoryUsabilityResult {
    let stats: fs.Stats;
    try {
        stats = stat(directory);
    } catch {
        return {status: "absent"};
    }
    if (!stats.isDirectory()) {
        return {status: "type"};
    }
    try {
        access(directory, fs.constants.W_OK);
        return {status: "valid"};
    } catch {
        return {status: "permission"};
    }
}

export function isUsableDirectory(directory: string): boolean {
    return checkDirectoryUsability(directory).status === "valid";
}

// The one "where should a brand-new, independent POKIE project live by default" answer: the platform
// Documents folder when it resolves to a real, writable directory, the platform home directory
// otherwise -- see resolvePlatformDocumentsDirectory's own comment for how a moved, localized, or
// disabled Documents folder is handled (a Documents folder unusable for *any* reason falls through to
// Home the same way, so only Home's own usability is reported explicitly here). "unresolved" covers the
// rare case where not even a home directory could be determined. Never CWD, never anywhere derived from
// where POKIE itself is installed or running from -- see isUnsafeStartDirectory.ts, which
// PokiePathResolver double-checks this result against before ever handing a default back to a caller.
export function resolveUserBaseDirectory(
    env: PlatformDirectoryEnvironment = defaultPlatformDirectoryEnvironment(),
    checkUsability: (directory: string) => DirectoryUsabilityResult = checkDirectoryUsability,
): UserBaseDirectoryResult {
    const documents = resolvePlatformDocumentsDirectory(env);
    if (documents && checkUsability(documents).status === "valid") {
        return {status: "valid", directory: documents, source: "documents"};
    }

    const home = resolvePlatformHomeDirectory(env);
    if (!home || home.trim().length === 0) {
        return {status: "unresolved"};
    }
    const homeUsability = checkUsability(home);
    if (homeUsability.status === "valid") {
        return {status: "valid", directory: home, source: "home"};
    }
    return {status: homeUsability.status, directory: home};
}
