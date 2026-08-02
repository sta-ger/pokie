import {OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION} from "../weightedoutcome/bundle/OutcomeLibraryBundleManifest.js";
import {recognizeOutcomeLibraryBundleDirectory} from "./internal/isOutcomeLibraryBundleDirectory.js";
import {ProjectTargetMalformedError} from "./ProjectTargetMalformedError.js";
import type {ProjectTargetTypeAdapter} from "./ProjectTargetTypeAdapter.js";

// Recognizes a pre-built outcome-library bundle directory — see ProjectType.ts's own "outcomeLibrary" doc
// comment. A manifest.json that declares a "schemaVersion" but fails validation (invalid JSON, wrong shape)
// throws ProjectTargetMalformedError rather than reporting undefined — see that class's own doc comment.
export class OutcomeLibraryProjectTargetAdapter implements ProjectTargetTypeAdapter {
    public readonly type = "outcomeLibrary";
    public readonly targetKind = "directory";

    public recognize(resolvedPath: string): Promise<string | undefined> {
        const recognition = recognizeOutcomeLibraryBundleDirectory(resolvedPath);
        if (recognition.kind === "malformed") {
            throw new ProjectTargetMalformedError(recognition.reason);
        }
        if (recognition.kind === "unrelated") {
            return Promise.resolve(undefined);
        }
        return Promise.resolve(
            `"manifest.json" matches the outcome-library bundle manifest shape (schemaVersion ${OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION})`,
        );
    }
}
