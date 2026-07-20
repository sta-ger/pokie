import fs from "fs";
import {readRecognizedStakeEngineManifest} from "./internal/readRecognizedStakeEngineManifest.js";

// Reports whether `outDir` is recognized as a previous "pokie stakeengine export" run's own output (via that
// run's own pokie-manifest.json) — the exact same recognition check assertSafeToReplaceStakeEngineExportDirectory
// itself uses internally to decide whether re-exporting into an existing, non-empty outDir is safe. Exposed
// publicly (unlike readRecognizedStakeEngineManifest, which stays internal) so a caller that needs to classify a
// pre-existing directory *before* attempting a write — e.g. Studio's own conflict/overwrite confirmation step —
// can do so without re-implementing this check itself and silently drifting from the exporter's own criteria for
// what counts as "one of ours". Returns false for a directory that doesn't exist, isn't a directory, or is empty
// — there's nothing to recognize, and nothing exportToDirectory itself would refuse to replace either.
export function isRecognizedStakeEngineExportDirectory(outDir: string): boolean {
    if (!fs.existsSync(outDir) || !fs.statSync(outDir).isDirectory()) {
        return false;
    }
    return readRecognizedStakeEngineManifest(outDir) !== undefined;
}
