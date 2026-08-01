import {OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION} from "../weightedoutcome/bundle/OutcomeLibraryBundleManifest.js";
import {isOutcomeLibraryBundleDirectory} from "./internal/isOutcomeLibraryBundleDirectory.js";
import type {ProjectTargetTypeAdapter} from "./ProjectTargetTypeAdapter.js";

// Recognizes a pre-built outcome-library bundle directory — see ProjectType.ts's own "outcomeLibrary" doc
// comment.
export class OutcomeLibraryProjectTargetAdapter implements ProjectTargetTypeAdapter {
    public readonly type = "outcomeLibrary";
    public readonly targetKind = "directory";

    public recognize(resolvedPath: string): Promise<string | undefined> {
        if (!isOutcomeLibraryBundleDirectory(resolvedPath)) {
            return Promise.resolve(undefined);
        }
        return Promise.resolve(
            `"manifest.json" matches the outcome-library bundle manifest shape (schemaVersion ${OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION})`,
        );
    }
}
