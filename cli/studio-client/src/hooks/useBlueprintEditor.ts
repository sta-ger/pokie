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
// own re-render; drafts.clear() on every wholesale blueprint replace (New/Load/a successful JSON apply)
// matches the old app's exact reset points. Returned as the ref itself (not its .current) -- consumers
// read `.current` only inside event handlers, never during render.
//
// `formGeneration` only increments on a *wholesale* blueprint replace (New/Load/a successful JSON
// apply) -- deliberately NOT on every mutate(). It exists so the Form view's uncontrolled scalar inputs
// (Metadata's text/number fields) can be forced to remount and pick up the new value via `key=
// {formGeneration}` on their container, without also tearing down the whole Form subtree (and any
// in-flight request it holds, e.g. the Reel Strip Modeler's "Resolve reels") on every single field edit
// -- see ReelStripGenerationEditor's own stale-response guard, which depends on surviving exactly that.
export function useBlueprintEditor(initialBlueprint?: Record<string, unknown>) {
    // Design Game supplies a complete Recommended Project here; the standalone/raw editor keeps the
    // explicit empty document it has always used.  The argument is intentionally read only for the
    // initial state, just like React's other `useState` initializers.
    const [state, setState] = useState<BlueprintEditorState>(() =>
        initialBlueprint === undefined ? createEmptyBlueprintEditorState() : loadBlueprintEditorState(initialBlueprint),
    );
    // Form controls commit on blur. A primary action can be clicked in that same React event batch,
    // before the component has re-rendered with the resulting state. Keep the event-time state here so
    // that action validates and persists the just-committed field value, rather than the previous render.
    const stateRef = useRef(state);
    const [formGeneration, setFormGeneration] = useState(0);
    const draftsRef = useRef<ReelStripGenerationDrafts>(new Map());

    const mutate: BlueprintMutate = useCallback((fn) => {
        const next = withFieldUpdate(stateRef.current, fn);
        stateRef.current = next;
        setState(next);
    }, []);

    const newBlueprint = useCallback(() => {
        draftsRef.current.clear();
        const next = createEmptyBlueprintEditorState(stateRef.current.revision);
        stateRef.current = next;
        setState(next);
        setFormGeneration((g) => g + 1);
    }, []);

    const loadFrom = useCallback((blueprint: unknown) => {
        draftsRef.current.clear();
        const next = loadBlueprintEditorState(blueprint, stateRef.current.revision);
        stateRef.current = next;
        setState(next);
        setFormGeneration((g) => g + 1);
    }, []);

    // Not a functional updater -- applyJson is only ever triggered by one deliberate user click at a
    // time, so reading `state` directly (rather than via setState's updater form) is safe and lets us
    // synchronously tell success from failure (a successful parse always produces a new `blueprint`
    // object reference; a failed one spreads the previous state, keeping the same reference) to decide
    // whether this was a wholesale replace.
    const applyJson = useCallback(
        (text: string) => {
            const previous = stateRef.current;
            const next = applyJsonText(previous, text);
            stateRef.current = next;
            setState(next);
            if (next.blueprint !== previous.blueprint) {
                // A successful JSON apply is a wholesale blueprint replace exactly like New/Load -- must
                // clear the Reel Strip Modeler's own toggle bookkeeping the same way those two do, or a
                // reel's literal<->generated/counts<->weights memory from the *old* blueprint could
                // resurrect via a type/source toggle against the new one (same reelIndex, unrelated data).
                draftsRef.current.clear();
                setFormGeneration((g) => g + 1);
            }
        },
        [],
    );

    const getCurrentState = useCallback(() => stateRef.current, []);

    return {state, formGeneration, mutate, newBlueprint, loadFrom, applyJson, getCurrentState, drafts: draftsRef};
}
