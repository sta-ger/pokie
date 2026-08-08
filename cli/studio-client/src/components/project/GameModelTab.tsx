import {Button} from "@mantine/core";
import {useCallback, useEffect, useState} from "react";
import {getGameModel, loadBlueprint, saveBlueprint, validateBlueprint} from "../../api/apiClient";
import type {GameModelProjection} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {setReelGenerationMode} from "../../domain/blueprintFormOps";
import {describeValidation, type BlueprintValidationView} from "../../domain/interpret/BlueprintEditor";
import type {BlueprintSectionId} from "../../domain/interpret/BlueprintSections";
import {errorMessage} from "../../domain/errorMessage";
import {describePathActionError} from "../../domain/pathActionError";
import {useBlueprintEditor} from "../../hooks/useBlueprintEditor";
import {useConfirm} from "../../hooks/useConfirm";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {useNavigationBlockerConfirm} from "../../hooks/useNavigationBlockerConfirm";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {QuickActions} from "../common/QuickActions";
import {GameModelSections} from "./GameModelSections";

type GameModelState = {status: "loading"} | {status: "error"; message: string} | {status: "loaded"; projection: GameModelProjection};

// `viewing` -- the default, and the only state possible for a non-editable project (see `editable`
// below). `loading` -- Edit was clicked on `section`; the current tracked Blueprint source is being
// (re-)loaded fresh (never the possibly-stale content the read-only `projection` above was built from)
// so an edit always starts from the exact truth on disk. `editing` -- the loaded source is now open in
// `editor` (see useBlueprintEditor.ts), scoped to exactly one section at a time (see
// GameModelSections.tsx's own "one section at a time" doc comment) -- `baselineRevision` is the
// `editor.state.revision` this edit started from (always `revisionBeforeLoad + 1`, see
// loadBlueprintEditorState's own doc comment), so a later mutate (which always bumps revision) is
// detectable as "dirty" via a plain `!==` comparison, no separate dirty flag needed. `saving` -- Save was
// clicked; validate-then-write is in flight.
type EditState =
    | {status: "viewing"}
    | {status: "loading"; section: BlueprintSectionId}
    | {status: "editing"; section: BlueprintSectionId; baselineRevision: number}
    | {status: "saving"; section: BlueprintSectionId; baselineRevision: number};

// The Project Workspace's own Game Model tab -- View Mode's default (and only) content: a calm,
// read-only rendering of GET /api/project/gameModel's own resolved-project-type-aware projection (see
// buildProjectGameModel's own doc comment for exactly what's available per project type). Fetches on its
// own (mounted fresh per project via ProjectDashboardPage's `key={projectKey}`, same convention as
// CertificationTab) rather than threading yet another piece of state through the page, since nothing
// else on the page needs this projection.
//
// For an editable Blueprint Project (`editable` -- see BLUEPRINT_BUILD_CAPABILITY's own doc comment,
// exactly the projects `buildProjectGameModel` reads a real tracked source for), this is *also* Edit
// Mode's own home: each section with a canonical field editor (see GameModelSections.tsx's own doc
// comment on which sections that covers) gets Edit/Save/Cancel. Editing reuses the exact same
// GameBlueprint model, mutate() functions, and validateBlueprint()/saveBlueprint() endpoints the guided
// Design Game editor uses (via useBlueprintEditor.ts and the same field-editor components, see
// GameModelSections.tsx) -- this tab never re-implements a mutation or a validation rule of its own. A
// save is atomic (one saveBlueprint() write of the whole, just-validated blueprint) and automatically
// validated (Save itself runs validateBlueprint() first; a validation error blocks the write outright,
// leaving the tracked source untouched). A successful save exits edit mode, refetches the projection
// (`refresh()`) so View
// Mode always shows the exact saved truth, and calls `onBlueprintSaved` so the page can invalidate
// whatever was already materialized from the old content (see ProjectDashboardPage's own doc comment on
// that prop). Navigating away (a tab switch, browser Back/Forward, or a project close) with unsaved
// section edits is blocked behind a confirm, the same predicate-driven useBlocker pattern
// useDesignNavigationGuard already uses for a dirty Home Design Game draft.
export function GameModelTab({
    editable = false,
    projectRoot,
    onDirtyChange,
    onBlueprintSaved,
}: {
    editable?: boolean;
    projectRoot?: string;
    onDirtyChange?: (dirty: boolean) => void;
    onBlueprintSaved?: () => void;
} = {}) {
    const fetchImpl = useStudioApi();
    const confirm = useConfirm();
    const editor = useBlueprintEditor();
    const [state, setState] = useState<GameModelState>({status: "loading"});
    const [editState, setEditState] = useState<EditState>({status: "viewing"});
    const [validationView, setValidationView] = useState<BlueprintValidationView>({status: "idle"});
    const [editError, setEditError] = useState<string>();
    // Undefined keeps the Reels section's own default, reproducible "symbolWeights"/"default" sample
    // (see buildGameModelReels' own SHARED_WEIGHTS_SAMPLE_SEED) -- only ever set by the "New sample"
    // action below, and carried across an ordinary refresh() (a save, the Refresh button) so that action
    // doesn't get silently reset out from under the user.
    const [sharedWeightsSampleSeed, setSharedWeightsSampleSeed] = useState<number>();
    const loadGuard = useDoubleSubmitGuard();
    const saveGuard = useDoubleSubmitGuard();

    const refresh = useCallback(() => {
        setState({status: "loading"});
        getGameModel(fetchImpl, sharedWeightsSampleSeed)
            .then((projection) => setState({status: "loaded", projection}))
            .catch((error: unknown) => setState({status: "error", message: errorMessage(error)}));
    }, [fetchImpl, sharedWeightsSampleSeed]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // Re-rolls the Reels section's own dynamic inspection sample with a fresh, still-reproducible seed --
    // setting the seed alone is enough to trigger a refetch, since `refresh` (and the effect above that
    // calls it) both depend on it.
    const handleNewSample = useCallback(() => {
        setSharedWeightsSampleSeed(Math.floor(Math.random() * 1_000_000));
    }, []);

    const isDirty = editState.status === "editing" && editor.state.revision !== editState.baselineRevision;

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    // Blocks leaving the Game Model tab (another tab, Home, a project close, browser Back/Forward -- any
    // in-app `navigate()` call or history transition) while a section edit has unsaved changes -- same
    // shared hook (predicate-driven useBlocker + an undismissable confirm modal) useDesignNavigationGuard
    // uses for a dirty Home Design Game draft. `currentLocation` is only ever this tab's own route while
    // this component is mounted at all (ProjectDashboardPage only renders GameModelTab for
    // activeTab === "gameModel"), so the predicate only needs to check where the transition is *going*.
    useNavigationBlockerConfirm(
        ({nextLocation}) => isDirty && nextLocation.pathname !== "/project/gameModel",
        {
            title: "Unsaved changes",
            children: "You have unsaved changes to this game model section. Leave and lose them?",
            labels: {confirm: "Leave", cancel: "Stay"},
        },
        () => setEditState({status: "viewing"}),
    );

    // Covers the one exit a router transition can never see -- an actual tab/browser close or refresh.
    useEffect(() => {
        if (!isDirty) {
            return undefined;
        }
        const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [isDirty]);

    const handleEdit = (section: BlueprintSectionId): void => {
        if (!editable || projectRoot === undefined || !loadGuard.begin()) {
            return;
        }
        setEditError(undefined);
        setEditState({status: "loading", section});
        // Always reloaded fresh from the tracked source, never derived from the already-fetched
        // `projection` above -- the projection is a read-only *derived* view (see
        // buildProjectGameModel's own doc comment), not the raw, editable GameBlueprint document itself.
        loadBlueprint(fetchImpl, projectRoot)
            .then((result) => {
                if (result.status === "load-error") {
                    setEditState({status: "viewing"});
                    setEditError(describePathActionError("This project's Blueprint source", result.error));
                    return;
                }
                const revisionBeforeLoad = editor.state.revision;
                setValidationView({status: "idle"});
                editor.loadFrom(result.blueprint);
                setEditState({status: "editing", section, baselineRevision: revisionBeforeLoad + 1});
            })
            .catch((error: unknown) => {
                setEditState({status: "viewing"});
                setEditError(errorMessage(error));
            })
            .finally(() => loadGuard.end());
    };

    // The Reels section's own "Convert this sample to generated reels…" action -- takes exactly the
    // per-reel strips View Mode is showing right now (the currently-loaded sample, `state.projection`'s
    // own `reels`, not a fresh, possibly-different re-derivation) and seeds a reelStripGeneration draft
    // with them as literal entries, then opens Edit Mode on "reels" so the user reviews/adjusts through
    // the one existing Reel Strip Modeler entrypoint (see ReelGenerationModeSelector.tsx) and explicitly
    // Saves -- this action alone never writes anything to disk.
    const handleConvertToGeneratedReels = (): void => {
        if (!editable || projectRoot === undefined || state.status !== "loaded" || state.projection.reels.status !== "available" || !loadGuard.begin()) {
            return;
        }
        const strips = state.projection.reels.data.reels.map((reel) => ("positions" in reel ? reel.positions.map((position) => position.symbolId) : []));
        setEditError(undefined);
        setEditState({status: "loading", section: "reels"});
        loadBlueprint(fetchImpl, projectRoot)
            .then((result) => {
                if (result.status === "load-error") {
                    setEditState({status: "viewing"});
                    setEditError(describePathActionError("This project's Blueprint source", result.error));
                    return;
                }
                const revisionBeforeLoad = editor.state.revision;
                setValidationView({status: "idle"});
                editor.loadFrom(result.blueprint);
                editor.mutate((blueprint) => {
                    setReelGenerationMode(blueprint, "reelStripGeneration");
                    blueprint.reelStripGeneration = strips.map((strip) => ({type: "literal", strip}));
                });
                setEditState({status: "editing", section: "reels", baselineRevision: revisionBeforeLoad + 1});
            })
            .catch((error: unknown) => {
                setEditState({status: "viewing"});
                setEditError(errorMessage(error));
            })
            .finally(() => loadGuard.end());
    };

    const handleCancel = (): void => {
        if (editState.status !== "editing") {
            return;
        }
        const discard = (): void => {
            setEditState({status: "viewing"});
            setValidationView({status: "idle"});
            setEditError(undefined);
        };
        if (editor.state.revision !== editState.baselineRevision) {
            confirm("Discard your unsaved changes to this section?", discard);
        } else {
            discard();
        }
    };

    const handleSave = (): void => {
        if (editState.status !== "editing" || projectRoot === undefined || !saveGuard.begin()) {
            return;
        }
        const {section, baselineRevision} = editState;
        const blueprintToSave = editor.state.blueprint;
        setEditError(undefined);
        setEditState({status: "saving", section, baselineRevision});
        setValidationView({status: "loading"});
        validateBlueprint(fetchImpl, blueprintToSave)
            .then((validation) => {
                const view = describeValidation(validation);
                setValidationView(view);
                if (view.status === "invalid") {
                    setEditState({status: "editing", section, baselineRevision});
                    return undefined;
                }
                // "ok" (possibly with warnings, which never block a save -- same "warnings-only never
                // blocks" contract BlueprintBuildPanel's own Build already follows) -- the one, atomic
                // write of the whole just-validated blueprint back to its own already-tracked path.
                // `overwrite: true`: this section's edit started from that exact path's own content (see
                // handleEdit above), so there's nothing here to confirm overwriting.
                return saveBlueprint(fetchImpl, projectRoot, blueprintToSave, true).then((saveResult) => {
                    if (saveResult.status !== "ok") {
                        setEditState({status: "editing", section, baselineRevision});
                        setEditError(describePathActionError("This project's Blueprint source", saveResult.error));
                        return;
                    }
                    setEditState({status: "viewing"});
                    // View Mode must show exactly the saved truth, straight off the server -- never the
                    // in-editor draft this component happens to still be holding.
                    refresh();
                    onBlueprintSaved?.();
                });
            })
            .catch((error: unknown) => {
                setEditState({status: "editing", section, baselineRevision});
                setValidationView({status: "error", message: errorMessage(error)});
            })
            .finally(() => saveGuard.end());
    };

    return (
        <div>
            {editError && <ErrorState message={editError} />}
            {state.status === "loading" && <LoadingState label="Loading game model…" />}
            {state.status === "error" && <ErrorState message={`Couldn't load the game model: ${state.message}`} />}
            {state.status === "loaded" && (
                <GameModelSections
                    projection={state.projection}
                    edit={
                        editable
                            ? {
                                activeSection: editState.status === "viewing" ? undefined : editState.section,
                                ready: editState.status === "editing" || editState.status === "saving",
                                onEdit: handleEdit,
                                onSave: handleSave,
                                onCancel: handleCancel,
                                saving: editState.status === "saving",
                                validationView,
                                blueprint: editor.state.blueprint,
                                mutate: editor.mutate,
                                drafts: editor.drafts,
                                revision: editor.state.revision,
                            }
                            : undefined
                    }
                    reelsSampleControls={{
                        onNewSample: handleNewSample,
                        // GameModelSections (and this control) only ever renders while `state.status ===
                        // "loaded"` -- a New sample re-fetch flips `state` straight to "loading" and
                        // unmounts this in favor of the page-level `LoadingState` above, so there's no
                        // in-between render where this button's own spinner would ever show.
                        loading: false,
                        onConvertToGeneratedReels: editable ? handleConvertToGeneratedReels : undefined,
                        convertDisabled: editState.status !== "viewing",
                    }}
                />
            )}
            <QuickActions>
                <Button variant="default" size="xs" onClick={refresh} loading={state.status === "loading"} disabled={editState.status !== "viewing"}>
                    Refresh
                </Button>
            </QuickActions>
        </div>
    );
}
