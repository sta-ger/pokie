import {useCallback, useRef, useState, type RefObject} from "react";
import {
    applyJsonText,
    createEmptyBlueprintEditorState,
    loadBlueprintEditorState,
    withFieldUpdate,
    type BlueprintEditorState,
} from "../domain/blueprintEditorState";
import type {ReelStripGenerationDrafts} from "../domain/blueprintFormOps";

export type BlueprintMutate = (mutate: (blueprint: Record<string, unknown>) => void) => void;
export type ReelStripGenerationDraftsRef = RefObject<ReelStripGenerationDrafts>;

// Owns the Blueprint Editor's one BlueprintEditorState (ported unchanged) for the lifetime of the page.
//
// `drafts` is the Reel Strip Modeler's own literal<->generated/counts<->weights bookkeeping (see
// blueprintFormOps.ts's own doc comment on ReelStripGenerationDraft) -- kept in a ref, never in state,
// since it's mutated in place by the same pure functions the old app used and must never trigger its
// own re-render; drafts.clear() on New/Load matches the old app's exact reset points. Returned as the
// ref itself (not its .current) -- consumers read `.current` only inside event handlers, never during
// render.
//
// `formGeneration` only increments on a *wholesale* blueprint replace (New/Load/a successful JSON
// apply) -- deliberately NOT on every mutate(). It exists so the Form view's uncontrolled scalar inputs
// (Metadata's text/number fields) can be forced to remount and pick up the new value via `key=
// {formGeneration}` on their container, without also tearing down the whole Form subtree (and any
// in-flight request it holds, e.g. the Reel Strip Modeler's "Resolve reels") on every single field edit
// -- see ReelStripGenerationEditor's own stale-response guard, which depends on surviving exactly that.
export function useBlueprintEditor() {
    const [state, setState] = useState<BlueprintEditorState>(() => createEmptyBlueprintEditorState());
    const [formGeneration, setFormGeneration] = useState(0);
    const draftsRef = useRef<ReelStripGenerationDrafts>(new Map());

    const mutate: BlueprintMutate = useCallback((fn) => {
        setState((prev) => withFieldUpdate(prev, fn));
    }, []);

    const newBlueprint = useCallback(() => {
        draftsRef.current.clear();
        setState((prev) => createEmptyBlueprintEditorState(prev.revision));
        setFormGeneration((g) => g + 1);
    }, []);

    const loadFrom = useCallback((blueprint: unknown) => {
        draftsRef.current.clear();
        setState((prev) => loadBlueprintEditorState(blueprint, prev.revision));
        setFormGeneration((g) => g + 1);
    }, []);

    // Not a functional updater -- applyJson is only ever triggered by one deliberate user click at a
    // time, so reading `state` directly (rather than via setState's updater form) is safe and lets us
    // synchronously tell success from failure (a successful parse always produces a new `blueprint`
    // object reference; a failed one spreads the previous state, keeping the same reference) to decide
    // whether this was a wholesale replace.
    const applyJson = useCallback(
        (text: string) => {
            const next = applyJsonText(state, text);
            setState(next);
            if (next.blueprint !== state.blueprint) {
                setFormGeneration((g) => g + 1);
            }
        },
        [state],
    );

    return {state, formGeneration, mutate, newBlueprint, loadFrom, applyJson, drafts: draftsRef};
}
