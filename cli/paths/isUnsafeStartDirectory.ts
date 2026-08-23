import fs from "fs";
import os from "os";
import path from "path";

// Node exposes path.win32/path.posix as full path-module implementations regardless of host OS; using
// `typeof path.win32` (rather than importing a `PlatformPath` type that isn't exported by every
// @types/node version) keeps this generic over "whichever concrete module we picked for this call".
type PlatformPathModule = typeof path.win32;

export type UnsafeStartDirectoryContext = {
    // The directory the current process was launched from -- a default-resolution algorithm must never
    // silently fall back to it (an explicit, user-typed path that happens to equal CWD is a different,
    // legitimate contract -- see PokiePathResolver's own comment). Defaults to process.cwd().
    readonly cwd?: string;
    // Where the running `pokie` package itself is installed (its own package.json's directory), and by
    // extension everything under it (node_modules, dist, source).
    readonly installRoot?: string;
    // Studio's own internal asset/runtime directory (StudioServerOptions.studioRoot) -- never a
    // sensible place to create or store a user's game project.
    readonly studioRoot?: string;
    // Which platform's path semantics (drive letters, UNC roots, `\` vs `/` separators) govern
    // `candidate` and the context above -- defaults to the host process's own platform (`path`'s own
    // behavior), but PokiePathResolver always passes the *target* platform it resolved a default for
    // explicitly, so a Windows base directory is judged by Windows containment rules even under test on
    // a POSIX host.
    readonly platform?: NodeJS.Platform;
    // Resolves a path to its real, symlink-free filesystem destination -- injectable so tests can
    // simulate a symlink without touching real fs state. Defaults to fs.realpathSync. A path that
    // doesn't exist (not yet created, or simply not meaningful on this host -- e.g. a Windows-shaped
    // path evaluated from a POSIX test host) is expected to throw; callers here always treat that as
    // "no physical destination to check, fall back to the lexical path" rather than propagating it.
    readonly realpath?: (target: string) => string;
    // A deliberately isolated user profile may itself live below the OS temporary directory (for
    // example, a disposable local Studio profile).  That profile is still the user's explicit Home,
    // not an arbitrary scratch destination.  When supplied, only descendants that remain physically
    // inside this exact root are exempt from the broad OS-temp check; every other unsafe-root and
    // unsafe-segment check below remains in force.
    readonly allowedTemporaryRoot?: string;
};

const UNSAFE_SEGMENT_NAMES = new Set(["node_modules", "dist"]);

function platformPathFor(platform: NodeJS.Platform | undefined): PlatformPathModule {
    if (platform === undefined) {
        return path;
    }
    return platform === "win32" ? path.win32 : path.posix;
}

// Windows drive-letter and UNC paths are case-insensitive at the filesystem level (NTFS preserves case
// but doesn't distinguish it), so `C:\Program Files\Pokie` and `c:\program files\pokie` name the same
// directory -- every containment/equality check below must fold case before comparing when judging
// Windows paths, while POSIX paths (case-sensitive filesystems) must not.
function normalizeForComparison(value: string, platformPath: PlatformPathModule): string {
    return platformPath === path.win32 ? value.toLowerCase() : value;
}

function pathsEqual(a: string, b: string, platformPath: PlatformPathModule): boolean {
    return normalizeForComparison(a, platformPath) === normalizeForComparison(b, platformPath);
}

function isWithin(root: string, candidate: string, platformPath: PlatformPathModule): boolean {
    const normalizedRoot = normalizeForComparison(root, platformPath);
    const normalizedCandidate = normalizeForComparison(candidate, platformPath);
    const rootWithSep = normalizedRoot.endsWith(platformPath.sep) ? normalizedRoot : normalizedRoot + platformPath.sep;
    return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(rootWithSep);
}

// Best-effort realpath: an anchor (temp dir, install root, Studio root) is expected to actually exist in
// production, but tests routinely exercise these checks against fabricated paths that don't -- falling
// back to the lexical value unchanged reproduces the pre-symlink-aware behavior for exactly those cases.
function physicalAnchor(root: string, realpath: (target: string) => string): string {
    try {
        return realpath(root);
    } catch {
        return root;
    }
}

// Resolves `candidate` to its actual filesystem destination, walking up to the nearest ancestor that
// actually exists (the same approach cli/studio/outcomeLibrary/resolveProjectDirectory.ts uses for a
// project-relative path) so a not-yet-created path underneath an *existing* symlinked ancestor -- e.g. a
// Documents folder that is itself a symlink into os.tmpdir() -- is judged by where that ancestor
// physically points, not by its lexical text. Walks with `platformPath` (not the host's own path module)
// so a target-platform path that isn't meaningful on this host (e.g. a Windows path evaluated from a
// POSIX test host) climbs to its own platform root and gives up there, rather than wandering onto an
// unrelated host path via "." once separators stop matching.
function physicalDestination(resolvedCandidate: string, platformPath: PlatformPathModule, realpath: (target: string) => string): string {
    let current = resolvedCandidate;
    const missingSuffix: string[] = [];
    for (;;) {
        try {
            return missingSuffix.reduce((destination, segment) => platformPath.join(destination, segment), realpath(current));
        } catch {
            const parent = platformPath.dirname(current);
            if (parent === current) {
                return resolvedCandidate;
            }
            missingSuffix.unshift(platformPath.basename(current));
            current = parent;
        }
    }
}

function isUnsafeAgainst(
    root: string,
    resolvedCandidate: string,
    physicalCandidate: string,
    platformPath: PlatformPathModule,
    realpath: (target: string) => string,
): boolean {
    if (isWithin(root, resolvedCandidate, platformPath)) {
        return true;
    }
    return isWithin(physicalAnchor(root, realpath), physicalCandidate, platformPath);
}

// True when `candidate` is, or physically resolves inside, a directory a *default*-resolution algorithm
// must never silently hand back: the process's own CWD, the OS temp/cache directory, POKIE's own install
// root or Studio's own internal asset directory (both as ancestors, and as a bare "node_modules"/"dist"
// path segment anywhere along the way -- so the check still catches these even when a caller only has a
// partial context to offer). Every containment check runs twice -- once lexically, once against each
// side's real, symlink-resolved destination -- so a candidate that only *looks* safe (e.g. a writable
// Documents symlink whose actual target is os.tmpdir(), the install root, or Studio's own directory)
// cannot slip through just because its own path text doesn't mention the forbidden location. This is a
// guard on *computed defaults*, not a blanket validator for every user-supplied path in the app: an
// explicit, user-chosen destination (e.g. `pokie init` scaffolding the directory it was invoked from, or
// a test fixture writing into os.tmpdir()) is a deliberate choice the user or caller made, not a silent
// one this check is meant to catch.
export function isUnsafeStartDirectory(candidate: string, context: UnsafeStartDirectoryContext = {}): boolean {
    const platformPath = platformPathFor(context.platform);
    const realpath = context.realpath ?? ((target: string) => fs.realpathSync(target));

    const resolvedCandidate = platformPath.resolve(candidate);
    const cwd = platformPath.resolve(context.cwd ?? process.cwd());
    if (pathsEqual(resolvedCandidate, cwd, platformPath)) {
        return true;
    }

    const physicalCandidate = physicalDestination(resolvedCandidate, platformPath, realpath);
    if (pathsEqual(physicalCandidate, physicalAnchor(cwd, realpath), platformPath)) {
        return true;
    }

    const allowedTemporaryRoot = context.allowedTemporaryRoot === undefined ? undefined : platformPath.resolve(context.allowedTemporaryRoot);
    // Unlike the other forbidden roots, an isolated HOME may be intentionally absent until the
    // first managed project save creates it. Resolve that planned path through its nearest existing
    // ancestor so a missing /tmp/profile stays a narrow exemption rather than collapsing to /tmp.
    const physicalAllowedTemporaryRoot =
        allowedTemporaryRoot === undefined ? undefined : physicalDestination(allowedTemporaryRoot, platformPath, realpath);
    const isInsideAllowedTemporaryRoot =
        allowedTemporaryRoot !== undefined &&
        physicalAllowedTemporaryRoot !== undefined &&
        isWithin(allowedTemporaryRoot, resolvedCandidate, platformPath) &&
        isWithin(physicalAllowedTemporaryRoot, physicalCandidate, platformPath);
    if (!isInsideAllowedTemporaryRoot && isUnsafeAgainst(platformPath.resolve(os.tmpdir()), resolvedCandidate, physicalCandidate, platformPath, realpath)) {
        return true;
    }
    if (context.installRoot !== undefined && isUnsafeAgainst(platformPath.resolve(context.installRoot), resolvedCandidate, physicalCandidate, platformPath, realpath)) {
        return true;
    }
    if (context.studioRoot !== undefined && isUnsafeAgainst(platformPath.resolve(context.studioRoot), resolvedCandidate, physicalCandidate, platformPath, realpath)) {
        return true;
    }

    const hasUnsafeSegment = (segment: string) => UNSAFE_SEGMENT_NAMES.has(normalizeForComparison(segment, platformPath));
    if (resolvedCandidate.split(platformPath.sep).some(hasUnsafeSegment)) {
        return true;
    }
    return physicalCandidate.split(platformPath.sep).some(hasUnsafeSegment);
}
