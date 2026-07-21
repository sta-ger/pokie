import fs from "fs";
import path from "path";

// Reports whether "dir" looks like a Stake Engine outcome artifacts directory worth attempting to read via
// StakeEngineOutcomeSourceReader -- deliberately much looser than isRecognizedStakeEngineExportDirectory (which
// requires a pokie-manifest.json this standalone pipeline never looks for): only "index.json exists, is valid
// JSON, and has a non-empty modes array" is checked here, the minimum shape Stake's own schema always requires.
// This is a cheap upfront classification for a caller deciding which pipeline to run (e.g. Studio's own directory
// picker) -- it never validates CSV/books, mode names, or per-outcome data; use
// StakeEngineOutcomeSourceReader.readFromDirectory for the full structural/per-outcome validation picture.
export function isStakeEngineOutcomeDirectory(dir: string): boolean {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return false;
    }

    const indexPath = path.join(dir, "index.json");
    if (!fs.existsSync(indexPath)) {
        return false;
    }

    try {
        const parsed: unknown = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        return (
            typeof parsed === "object" &&
            parsed !== null &&
            Array.isArray((parsed as {modes?: unknown}).modes) &&
            (parsed as {modes: unknown[]}).modes.length > 0
        );
    } catch {
        return false;
    }
}
