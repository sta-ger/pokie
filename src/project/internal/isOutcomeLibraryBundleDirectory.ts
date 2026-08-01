import fs from "fs";
import path from "path";
import {OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION} from "../../weightedoutcome/bundle/OutcomeLibraryBundleManifest.js";

// A lightweight, non-throwing recognition check for PokieProjectResolver — deliberately not a structural
// validation pass (OutcomeLibraryBundleValidator already owns that, against an already-recognized bundle
// directory): just enough of manifest.json's own shape to tell "this directory is an outcome-library bundle"
// apart from any other directory, the same "recognize, don't validate" split
// isRecognizedStakeEngineExportDirectory draws for Stake Engine export directories. Returns false for a
// directory that doesn't exist, isn't a directory, has no manifest.json, or whose manifest.json doesn't parse
// or doesn't look like OutcomeLibraryBundleManifest.
export function isOutcomeLibraryBundleDirectory(bundleDir: string): boolean {
    if (!fs.existsSync(bundleDir) || !fs.statSync(bundleDir).isDirectory()) {
        return false;
    }

    const manifestPath = path.join(bundleDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
        return false;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        return (
            parsed?.schemaVersion === OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION &&
            Array.isArray(parsed?.modes) &&
            typeof parsed?.game === "object" &&
            parsed?.game !== null
        );
    } catch {
        return false;
    }
}
