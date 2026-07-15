import fs from "fs";
import path from "path";
import type {StakeEngineManifest} from "../StakeEngineManifest.js";

const MANIFEST_FILE_NAME = "pokie-manifest.json";
const GENERATED_BY = "pokie stakeengine export";

// Returns a directory's own pokie-manifest.json, or undefined if there's none there, it doesn't parse, or it
// wasn't written by "pokie stakeengine export" — the one shared recognition check both
// assertSafeToReplaceStakeEngineExportDirectory (deciding whether re-exporting into an existing outDir is safe)
// and StakeEngineImporter (deciding whether a directory can be imported at all) use, so the two can never
// silently disagree on what counts as "one of ours".
export function readRecognizedStakeEngineManifest(stakeDir: string): StakeEngineManifest | undefined {
    const manifestPath = path.join(stakeDir, MANIFEST_FILE_NAME);
    if (!fs.existsSync(manifestPath)) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        if (!parsed || parsed.generatedBy !== GENERATED_BY) {
            return undefined;
        }
        return parsed as StakeEngineManifest;
    } catch {
        return undefined;
    }
}
