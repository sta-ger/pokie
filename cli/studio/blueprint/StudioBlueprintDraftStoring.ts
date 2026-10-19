import type {StudioBlueprintDraftSnapshot} from "./StudioBlueprintDraft.js";

export interface StudioBlueprintDraftStoring {
    read(): StudioBlueprintDraftSnapshot;
    /** Undefined means another editor owns the current version; nothing was written. */
    replace(snapshot: StudioBlueprintDraftSnapshot): StudioBlueprintDraftSnapshot | undefined;
}
