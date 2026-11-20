import fs from "fs";
import path from "path";
import {OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION} from "../../weightedoutcome/folder/OutcomeLibraryFolderIndex.js";
import type {ProjectTargetInfoRecognition} from "./ProjectTargetInfoRecognition.js";

// A recognition check for ProjectTargetResolver's outcomeLibrary adapter — deliberately not a structural
// validation pass (OutcomeLibraryFolderValidator already owns that, against an already-recognized bundle
// directory): just enough of manifest.json's own shape to tell "this directory is an outcome-library bundle"
// apart from any other directory, the same "recognize, don't validate" split isRecognizedStakeEngineExportDirectory
// draws for Stake Engine export directories. A directory with no manifest.json, or one whose manifest.json
// never declares a "schemaVersion" field at all, is "unrelated" — manifest.json is a common filename well
// outside outcome-library bundles (e.g. web app / extension manifests), so its mere presence isn't a POKIE
// signal on its own. But a manifest.json that fails to parse as JSON, or that does declare a "schemaVersion"
// yet doesn't match this bundle's required shape (wrong schemaVersion, non-array "modes", non-object "game"),
// has already signalled intent to be an outcome-library bundle manifest and gotten the shape wrong — that's
// "malformed", not "unrelated" (see ProjectTargetInfoRecognition's own doc comment).
export function recognizeOutcomeLibraryFolderDirectory(libraryDir: string): ProjectTargetInfoRecognition {
    if (!fs.existsSync(libraryDir) || !fs.statSync(libraryDir).isDirectory()) {
        return {kind: "unrelated"};
    }

    const manifestPath = path.join(libraryDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
        return {kind: "unrelated"};
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch (error) {
        return {
            kind: "malformed",
            reason: `Could not parse "${manifestPath}" as JSON: ${error instanceof Error ? error.message : String(error)}`,
        };
    }

    const declaresSchemaVersion =
        typeof parsed === "object" && parsed !== null && (parsed as {schemaVersion?: unknown}).schemaVersion !== undefined;
    if (!declaresSchemaVersion) {
        return {kind: "unrelated"};
    }

    const candidate = parsed as {schemaVersion?: unknown; modes?: unknown; game?: unknown};
    const matchesRequiredShape =
        candidate.schemaVersion === OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION &&
        Array.isArray(candidate.modes) &&
        typeof candidate.game === "object" &&
        candidate.game !== null;
    if (!matchesRequiredShape) {
        return {
            kind: "malformed",
            reason:
                `"${manifestPath}" declares a "schemaVersion" but doesn't match the outcome-library bundle manifest ` +
                `shape (expected schemaVersion ${OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION}, an array "modes", and an object "game").`,
        };
    }

    return {kind: "recognized"};
}
