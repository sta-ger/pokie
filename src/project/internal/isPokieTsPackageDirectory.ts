import {readPokiePackageConfig} from "../../gamepackage/readPokiePackageConfig.js";

// A lightweight, non-throwing recognition check for ProjectTargetResolver's tsPackage adapter — reuses
// readPokiePackageConfig, the same "pokie.entry" contract findPokieProjectRoot/loadPokieGame themselves read,
// rather than re-deriving a second definition of "what makes a directory a POKIE package" here. Returns false
// for a directory with no package.json, an unparseable package.json, or one missing "pokie.entry" — any of
// those is simply not recognized, not an error.
export function isPokieTsPackageDirectory(dir: string): boolean {
    try {
        readPokiePackageConfig(dir);
        return true;
    } catch {
        return false;
    }
}
