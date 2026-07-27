import path from "path";
import {readPokiePackageConfig} from "pokie";

// Walks up from `startDir` to the filesystem root and returns the first directory that is a POKIE game
// package, or undefined if there is none — this is what makes a bare `pokie` run from anywhere inside a
// project (including a nested subdirectory like src/generated) open that project's dashboard instead of
// Home.
//
// "Is a package" is decided by readPokiePackageConfig, i.e. the same `"pokie": {"entry": ...}` contract
// in package.json that loadPokieGame itself reads — a search that reuses the existing definition rather
// than a second one hardcoded here. It deliberately stops at that check and does NOT go on to load or
// validate the entry module: that stays StudioHomeService.openProject()'s job (via loadPokieGame), and a
// project whose entry is broken should still open its own dashboard, which then reports the error,
// rather than be skipped here as though it were not a project at all.
export function findPokieProjectRoot(
    startDir: string,
    readConfig: (packageRoot: string) => unknown = readPokiePackageConfig,
): string | undefined {
    let current = path.resolve(startDir);

    for (;;) {
        if (isPokiePackage(current, readConfig)) {
            return current;
        }

        const parent = path.dirname(current);
        // path.dirname() of a filesystem root is that same root — the only reliable "walked all the way
        // up" signal that works for both POSIX ("/") and Windows drive/UNC roots.
        if (parent === current) {
            return undefined;
        }
        current = parent;
    }
}

// A directory that has no package.json, has one that doesn't parse, or has one without a usable
// "pokie.entry" is simply not a package root — every one of those is a "keep walking up" answer here,
// not an error to report, since they're the normal state of every ancestor directory.
function isPokiePackage(candidate: string, readConfig: (packageRoot: string) => unknown): boolean {
    try {
        readConfig(candidate);
        return true;
    } catch {
        return false;
    }
}
