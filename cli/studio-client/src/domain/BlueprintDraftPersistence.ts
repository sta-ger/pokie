import type {FetchLike} from "../api/apiClient.js";
import {validateStudioBlueprintDraft, validateStudioBlueprintDraftSnapshot, type StudioBlueprintDraft, type StudioBlueprintDraftSnapshot} from "../../../studio/blueprint/StudioBlueprintDraft.js";
import {clearPersistedBlueprintDraft, savePersistedBlueprintDraft} from "./blueprintDraftStorage.js";

export interface BlueprintDraftPersistenceHandling {
    recover(): Promise<StudioBlueprintDraft | undefined>;
    save(blueprint: unknown, importedFromParSheetPath?: string, conversionEvidence?: unknown): Promise<void>;
    clear(): Promise<void>;
}

/** Serializes this editor's recovery writes, including clears, across slow network responses. */
export class BlueprintDraftPersistence implements BlueprintDraftPersistenceHandling {
    private snapshot?: StudioBlueprintDraftSnapshot;
    private reading?: Promise<StudioBlueprintDraftSnapshot>;
    private pending: Promise<void> = Promise.resolve();
    private changed = false;
    private conflict = false;
    private readonly fetchImpl: FetchLike;
    private readonly onError: (error: unknown) => void;
    private readonly onSuccess?: () => void;

    public constructor(fetchImpl: FetchLike, onError: (error: unknown) => void, onSuccess?: () => void) {
        this.fetchImpl = fetchImpl;
        this.onError = onError;
        this.onSuccess = onSuccess;
    }

    public async recover(): Promise<StudioBlueprintDraft | undefined> {
        const snapshot = await this.read();
        return this.changed ? undefined : snapshot.draft;
    }

    public save(blueprint: unknown, importedFromParSheetPath?: string, conversionEvidence?: unknown): Promise<void> {
        this.changed = true;
        try {
            // Capture bytes now: later form mutations must not change an already queued request.
            const draft = validateStudioBlueprintDraft(JSON.parse(JSON.stringify({blueprint, importedFromParSheetPath, conversionEvidence})));
            savePersistedBlueprintDraft(draft.blueprint, draft.importedFromParSheetPath, draft.conversionEvidence);
            return this.enqueue(draft);
        } catch (error) {
            this.onError(error);
            return Promise.resolve();
        }
    }

    public clear(): Promise<void> {
        this.changed = true;
        clearPersistedBlueprintDraft();
        return this.enqueue();
    }

    private read(): Promise<StudioBlueprintDraftSnapshot> {
        if (this.snapshot !== undefined) return Promise.resolve(this.snapshot);
        this.reading ??= (async () => {
            try {
                const response = await this.fetchImpl("/api/home/blueprints/draft", {cache: "no-store"});
                if (!response.ok) throw new Error("Could not read the retained Design draft.");
                this.snapshot = validateStudioBlueprintDraftSnapshot(await response.json());
                this.onSuccess?.();
                return this.snapshot;
            } finally {
                this.reading = undefined;
            }
        })();
        return this.reading;
    }

    private enqueue(draft?: StudioBlueprintDraft): Promise<void> {
        this.pending = this.pending.then(async () => {
            if (this.conflict) throw new Error("The retained Design draft changed in another editor. Save your current draft as a project before starting another Studio session.");
            const snapshot = await this.read();
            const response = await this.fetchImpl("/api/home/blueprints/draft", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({version: snapshot.version, ...(draft === undefined ? {} : {draft})}),
            });
            if (response.status === 409) {
                this.conflict = true;
                throw new Error("The retained Design draft changed in another editor. Save your current draft as a project before starting another Studio session.");
            }
            if (!response.ok) throw new Error("Could not update the retained Design draft.");
            this.snapshot = validateStudioBlueprintDraftSnapshot(await response.json());
            this.onSuccess?.();
        }).catch(this.onError);
        return this.pending;
    }
}
