import {browseFilesystem, FetchLike, resolveDefaultBrowseLocation} from "../api/apiClient";
import {getRememberedBrowseLocation} from "./rememberedBrowseLocation";

export type BrowseStartLocationParams = {
    fetchImpl: FetchLike;
    currentValue: string;
    // A stable id for this specific field's own use-case (e.g. "create-project-destination") -- unlocks
    // the "remembered type location" rung below. Omitted entirely, that rung is simply skipped.
    browseId?: string;
    // The currently open project's root, or any other directory the caller already knows is the most
    // relevant place to start browsing from (e.g. a Project Dashboard tab). Trusted as-is, never
    // re-validated: the caller is expected to only ever pass a location it already knows is real.
    relevantDirectory?: string;
    // Forwarded to GET /api/home/fs/default-location's own `name` — see resolveDefaultBrowseLocation.
    defaultLocationName?: string;
};

// The one shared "where should Browse start looking" policy every PathInput uses, in precedence order:
// (1) the field's own current value, but only once confirmed to actually resolve to something real (a
// bare unvalidated string could easily be mid-edit garbage); (2) a caller-supplied relevant directory
// (e.g. the open project's root); (3) the last location remembered for this field's own browseId; (4)
// the platform Documents-or-Home default (see StudioDefaultLocationView). Returns undefined only when
// every rung comes up empty — the native/fallback picker then simply opens at its own default (Studio's
// working directory).
export async function resolveBrowseStartLocation(params: BrowseStartLocationParams): Promise<string | undefined> {
    const trimmedCurrentValue = params.currentValue.trim();
    if (trimmedCurrentValue.length > 0) {
        const hint = await browseFilesystem(params.fetchImpl, trimmedCurrentValue);
        if (hint.status === "ok") {
            return trimmedCurrentValue;
        }
    }

    const trimmedRelevantDirectory = params.relevantDirectory?.trim();
    if (trimmedRelevantDirectory && trimmedRelevantDirectory.length > 0) {
        return trimmedRelevantDirectory;
    }

    const remembered = params.browseId ? getRememberedBrowseLocation(params.browseId) : undefined;
    if (remembered && remembered.trim().length > 0) {
        return remembered;
    }

    const defaultLocation = await resolveDefaultBrowseLocation(params.fetchImpl, params.defaultLocationName);
    return defaultLocation.status === "valid" ? defaultLocation.directory : undefined;
}
