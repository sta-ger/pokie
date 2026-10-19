import {useEffect, useRef, useState} from "react";
import type {FetchLike} from "../api/apiClient.js";
import {BlueprintDraftPersistence} from "../domain/BlueprintDraftPersistence.js";
import {loadPersistedBlueprintDraft} from "../domain/blueprintDraftStorage.js";
import {errorMessage} from "../domain/errorMessage.js";

export function useBlueprintDraftRecovery(fetchImpl: FetchLike, guided: boolean, offerRecovery: boolean) {
    const [persistedDraft, setPersistedDraft] = useState(() => offerRecovery ? loadPersistedBlueprintDraft() : undefined);
    const [recoveryError, setRecoveryError] = useState<string>();
    const persistenceRef = useRef<BlueprintDraftPersistence | undefined>(undefined);
    useEffect(() => {
        if (!guided) return undefined;
        let active = true;
        const reportError = (error: unknown): void => {
            if (active) setRecoveryError(errorMessage(error));
        };
        const persistence = new BlueprintDraftPersistence(fetchImpl, reportError, () => {
            if (active) setRecoveryError(undefined);
        });
        persistenceRef.current = persistence;
        persistence.recover().then(draft => {
            if (active && offerRecovery && draft !== undefined) setPersistedDraft(previous => previous ?? draft);
        }).catch(reportError);
        return () => {
            active = false;
        };
        // Mount owns the recovery choice. A later explicit Load or job recovery must not re-read it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchImpl, guided]);
    const saveDraft = (blueprint: unknown, source?: string, evidence?: unknown): void => {
        persistenceRef.current?.save(blueprint, source, evidence);
    };
    const clearDraft = (): void => {
        persistenceRef.current?.clear();
    };
    return {persistedDraft, recoveryError, saveDraft, clearDraft};
}
