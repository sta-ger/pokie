import {Button, Text} from "@mantine/core";
import {useCallback, useEffect, useRef, useState} from "react";
import {applyProjectBlueprint, inspectProject, loadBlueprint, loadGameModel, validateBlueprint} from "../../api/apiClient";
import type {GameModelProjection, ValidationIssue} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {asBetModesList, describeNewBetModeDraft, type NewBetModeDraftStatus} from "../../domain/blueprintFormOps";
import {errorMessage} from "../../domain/errorMessage";
import {describeValidation, type BlueprintValidationView} from "../../domain/interpret/BlueprintEditor";
import {describePathActionError} from "../../domain/pathActionError";
import {useBlueprintEditor} from "../../hooks/useBlueprintEditor";
import {useConfirm} from "../../hooks/useConfirm";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {BetModesEditor} from "../blueprintEditor/BetModesEditor";
import {BlueprintJsonPanel} from "../blueprintEditor/BlueprintJsonPanel";
import {FreeGamesFieldset} from "../blueprintEditor/FreeGamesFieldset";
import {SectionedFormEditor} from "../blueprintEditor/SectionedFormEditor";
import {WinModelSelector} from "../blueprintEditor/WinModelSelector";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {GameModelView} from "./GameModelView";

// The guided Design Game editor's own auto-validate debounce (see BlueprintEditorPage's own doc comment)
// -- reused verbatim here so Edit mode's own freshness-aware auto-validate behaves identically.
const AUTO_VALIDATE_DEBOUNCE_MS = 600;

// The Bet modes section's own Draft/Saved/Invalid/Unsaved lifecycle line -- distinct from SectionedFormEditor's
// own per-section status badges (which only ever reflect the last Validate result and stay blank until
// Validate has actually run). A duplicate New bet mode id draft takes priority over everything else:
// BetModesEditor's own field already shows its inline error, but the field error alone left this line free
// to keep saying "Saved" for an id that is, in fact, not usable -- untruthful. Invalid (this section's own
// applied-blueprint validation errors) takes priority over Unsaved next: fixing the error is the more
// urgent fact. See BetModesEditor's own newBetModeIdDescription for the separate "Draft" state -- a typed,
// unique, not-yet-added bet mode id -- which this line does not duplicate.
function describeBetModesLifecycleStatus(
    isDirty: boolean,
    view: BlueprintValidationView,
    newBetModeDraftStatus: NewBetModeDraftStatus,
): {tone: "success" | "warning" | "error"; text: string} {
    if (newBetModeDraftStatus.status === "duplicate") {
        return {
            tone: "error",
            text: `Invalid -- "${newBetModeDraftStatus.id}" is already used by another bet mode; the New bet mode id must be unique before it can be added.`,
        };
    }
    if (view.status === "invalid") {
        return {tone: "error", text: "Invalid -- fix the errors below before saving."};
    }
    if (isDirty) {
        return {tone: "warning", text: "Unsaved changes -- use Save changes above to save them to the project."};
    }
    return {tone: "success", text: "Saved -- matches the project's applied blueprint."};
}

const BET_MODES_LIFECYCLE_TONE_COLOR: Record<"success" | "warning" | "error", string> = {
    success: "green",
    warning: "orange",
    error: "red",
};

type ProjectionView = {status: "loading"} | {status: "error"; message: string} | {status: "ok"; projection: GameModelProjection};

type EditLoadView = {status: "loading"} | {status: "unsupported"; message: string} | {status: "error"; message: string} | {status: "ok"};

type SaveView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "conflict"; message: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {status: "ok"};

// The Game Model tab -- one unified view of the *current project's* own game model, read-only by
// default for both a Blueprint project's own editable source and an introspectable-but-not-editable
// package/WASM project's tracked source alike (see GameModelView's own doc comment; both load the exact
// same server/core-owned GameModelProjection, GET /api/project/gameModel). `canEdit` (BLUEPRINT_BUILD_
// CAPABILITY, resolved by ProjectDashboardPage) is the only thing that decides whether an "Edit" action
// into the guided editor below is offered at all -- an introspectable-only project never sees it.
//
// Edit mode reuses the Home "Design Game" editor's own SectionedFormEditor -- the exact same component,
// not a re-implementation of it -- for every field Design Game already covers (basics, layout, symbols,
// reels, paytable, bets), plus WinModelSelector/FreeGamesFieldset/BetModesEditor for the fields that are
// unique to a Blueprint's own game model and have no Design Game equivalent yet. This retires the former
// EditableMechanicsEditor's own Stepper, which duplicated Design Game's own Layout/Symbols/Paytable/Bets
// fields behind a second, differently-shaped guided flow. Validation is inline and automatic (the same
// debounced auto-validate Design Game's own guided mode uses), not a separate manual "Run validation"
// step. Saving reuses the existing blueprint load/validate/apply services as-is -- no new backend routes,
// no re-implemented domain math (see GameBlueprintValidator/GamePackageGenerator for the real rules) --
// and returns straight to the read-only view on success, reloading the projection so the view can never
// show stale data. Project-switch cleanup is a full remount, not page-level state -- see
// ProjectDashboardPage's `key={projectKey ?? "no-project"}` on this component.
export function MechanicsEditorTab({canEdit, onDirtyChange}: {canEdit: boolean; onDirtyChange?: (dirty: boolean) => void}) {
    const fetchImpl = useStudioApi();
    const confirm = useConfirm();
    const editor = useBlueprintEditor();
    const [mode, setMode] = useState<"view" | "edit">("view");

    // The read-only view's own data source -- reloaded on mount and again after every successful Save
    // changes below, so View never shows a stale projection once an edit has actually been persisted.
    const [projectionView, setProjectionView] = useState<ProjectionView>({status: "loading"});
    const projectionRequestIdRef = useRef(0);
    const loadProjection = useCallback(() => {
        const requestId = ++projectionRequestIdRef.current;
        setProjectionView({status: "loading"});
        loadGameModel(fetchImpl)
            .then((projection) => {
                if (requestId !== projectionRequestIdRef.current) {
                    return;
                }
                setProjectionView({status: "ok", projection});
            })
            .catch((error: unknown) => {
                if (requestId !== projectionRequestIdRef.current) {
                    return;
                }
                setProjectionView({status: "error", message: errorMessage(error)});
            });
    }, [fetchImpl]);
    useEffect(() => {
        loadProjection();
    }, [loadProjection]);

    // Lifted out of BetModesEditor itself: it only renders while Edit mode is active, so a local
    // useState there would be silently discarded -- losing whatever id the user had typed but not yet
    // clicked "Add bet mode" for -- every time Edit mode remounts (Cancel then Edit again, or a Save).
    // Held here instead, and reset on every wholesale blueprint replace (a fresh Edit-mode load) via the
    // formGeneration effect below.
    const [newBetModeId, setNewBetModeId] = useState("");
    useEffect(() => {
        setNewBetModeId("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor.formGeneration]);
    const newBetModeDraftStatus = describeNewBetModeDraft(asBetModesList(editor.state.blueprint.betModes), newBetModeId);

    const [editLoadView, setEditLoadView] = useState<EditLoadView>({status: "loading"});
    const editLoadRequestIdRef = useRef(0);
    const lastLoadedBlueprintHashRef = useRef<string | undefined>(undefined);

    const [validateView, setValidateView] = useState<BlueprintValidationView>({status: "idle"});
    const validateRequestIdRef = useRef(0);
    const validateGuard = useDoubleSubmitGuard();
    const revisionRef = useRef(editor.state.revision);
    useEffect(() => {
        revisionRef.current = editor.state.revision;
    }, [editor.state.revision]);

    const [saveView, setSaveView] = useState<SaveView>({status: "idle"});
    const saveGuard = useDoubleSubmitGuard();

    // Dirty-tracking: same cleanRevisionRef/nextFormGenerationIsClean/markClean scheme as
    // BlueprintEditorPage's own (see its doc comment) -- kept local to this tab rather than shared,
    // matching the rest of this codebase's convention of not abstracting this small a pattern across
    // unrelated tabs. Scoped to Edit mode: View mode never has a draft of its own to lose.
    const cleanRevisionRef = useRef(editor.state.revision);
    const nextFormGenerationIsClean = useRef(false);
    const [isDirty, setIsDirty] = useState(false);
    const [, forceRerenderAfterMarkClean] = useState(0);
    const markClean = (revisionThatWasPersisted: number): void => {
        cleanRevisionRef.current = revisionThatWasPersisted;
        forceRerenderAfterMarkClean((n) => n + 1);
    };
    useEffect(() => {
        if (nextFormGenerationIsClean.current) {
            cleanRevisionRef.current = editor.state.revision;
            nextFormGenerationIsClean.current = false;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor.formGeneration]);
    // Refs must never be read during render (react-hooks/refs) -- derive isDirty in an effect with no
    // dependency array instead, which runs after every render. Reported up through onDirtyChange so
    // ProjectDashboardPage can gate navigation away from this tab (or Close project) on it -- see its own
    // handleMechanicsEditorDirtyChange doc comment. Also folds in a pending "New bet mode id" draft: a
    // typed-but-not-yet-added id is real, uncommitted user input that a bare tab switch or Back/Forward
    // would otherwise silently throw away with zero warning, same as any other unsaved field edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const dirty = mode === "edit" && (editor.state.revision !== cleanRevisionRef.current || newBetModeDraftStatus.status !== "empty");
        setIsDirty(dirty);
        onDirtyChange?.(dirty);
    });

    // Runs whenever Edit mode is (re-)entered -- a fresh load every time, so Cancel (which simply
    // switches back to "view" without reverting anything itself) and a prior failed Save both always
    // resolve to reloading the genuinely-current source rather than trying to reconcile a stale draft.
    useEffect(() => {
        if (mode !== "edit") {
            return;
        }
        const requestId = ++editLoadRequestIdRef.current;
        setEditLoadView({status: "loading"});
        setSaveView({status: "idle"});
        inspectProject(fetchImpl)
            .then((report) => {
                if (requestId !== editLoadRequestIdRef.current) {
                    return undefined;
                }
                if (!report.generated || report.buildInfo?.source === undefined) {
                    setEditLoadView({
                        status: "unsupported",
                        message: "This project wasn't built from a tracked source blueprint (no \"source\" recorded in build-info.json), so it can't be edited here.",
                    });
                    return undefined;
                }
                return loadBlueprint(fetchImpl, report.buildInfo.source).then((result) => {
                    if (requestId !== editLoadRequestIdRef.current) {
                        return;
                    }
                    if (result.status === "load-error") {
                        setEditLoadView({status: "error", message: result.error});
                        return;
                    }
                    lastLoadedBlueprintHashRef.current = result.blueprintHash;
                    nextFormGenerationIsClean.current = true;
                    editor.loadFrom(result.blueprint);
                    setEditLoadView({status: "ok"});
                });
            })
            .catch((error: unknown) => {
                if (requestId !== editLoadRequestIdRef.current) {
                    return;
                }
                setEditLoadView({status: "error", message: errorMessage(error)});
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    // Freshness-aware auto-validate -- same debounced, revision-driven contract as BlueprintEditorPage's
    // own guided mode (see its doc comment): every edit (and the initial Edit-mode load itself) reschedules
    // a validate AUTO_VALIDATE_DEBOUNCE_MS after the last change, so a typing burst collapses into one
    // request. Bumping validateRequestIdRef and releasing the guard here (not just resetting the view)
    // means an edit made while a validate request is still pending frees up a fresh auto-validate
    // immediately, instead of that request being silently swallowed until the stale one eventually settles.
    const autoValidateTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const handleValidate = (): void => {
        if (!validateGuard.begin()) {
            return;
        }
        const requestedRevision = editor.state.revision;
        const requestId = ++validateRequestIdRef.current;
        const isStale = (): boolean => requestId !== validateRequestIdRef.current || requestedRevision !== revisionRef.current;
        setValidateView({status: "loading"});
        validateBlueprint(fetchImpl, editor.state.blueprint)
            .then((result) => {
                if (isStale()) {
                    return;
                }
                setValidateView(describeValidation(result));
            })
            .catch((error: unknown) => {
                if (isStale()) {
                    return;
                }
                setValidateView({status: "error", message: errorMessage(error)});
            })
            .finally(() => validateGuard.end());
    };
    useEffect(() => {
        if (mode !== "edit") {
            // Leaving Edit mode (Cancel, a successful Save, or an unsupported/error edit-load's own
            // Cancel) must cancel any pending debounced auto-validate and invalidate any validate
            // request still in flight -- otherwise a Cancel made just before the debounce fires would
            // still send a validate for the just-discarded draft, and a response that settles after
            // leaving Edit could still land (via isStale()'s requestId check in handleValidate) against
            // the restored View or a brand-new Edit session's own state.
            if (autoValidateTimerRef.current !== undefined) {
                clearTimeout(autoValidateTimerRef.current);
                autoValidateTimerRef.current = undefined;
            }
            validateRequestIdRef.current++;
            validateGuard.end();
            return undefined;
        }
        validateRequestIdRef.current++;
        validateGuard.end();
        setValidateView((prev) => (prev.status === "ok" || prev.status === "invalid" || prev.status === "stale" ? {status: "stale"} : {status: "idle"}));
        if (autoValidateTimerRef.current !== undefined) {
            clearTimeout(autoValidateTimerRef.current);
        }
        autoValidateTimerRef.current = setTimeout(() => {
            autoValidateTimerRef.current = undefined;
            handleValidate();
        }, AUTO_VALIDATE_DEBOUNCE_MS);
        return undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor.state.revision, mode]);
    // Cancels a pending debounced auto-validate on unmount -- a stray setTimeout firing after this page
    // is gone would call setValidateView on an unmounted component.
    useEffect(
        () => () => {
            if (autoValidateTimerRef.current !== undefined) {
                clearTimeout(autoValidateTimerRef.current);
            }
        },
        [],
    );

    // Save changes is a single request to the server's own conditional-commit endpoint (see
    // applyGameBlueprintToProject.ts) -- this tab does no load-then-compare-then-write of its own: the
    // server re-checks the source blueprint's hash itself, immediately before staging its own build+save,
    // and stages both before committing either, so a failed/conflicting save always leaves the project's
    // source and generated output exactly as they were before the attempt. A successful save returns to
    // the read-only view and reloads its projection, so it can never show what was just overwritten.
    function handleSaveChanges(): void {
        const expectedHash = lastLoadedBlueprintHashRef.current;
        if (expectedHash === undefined || !saveGuard.begin()) {
            return;
        }
        const savedRevision = editor.state.revision;
        setSaveView({status: "loading"});
        applyProjectBlueprint(fetchImpl, editor.state.blueprint, expectedHash)
            .then((result) => {
                if (result.status === "conflict") {
                    setSaveView({
                        status: "conflict",
                        message:
                            "The project's blueprint file changed on disk since it was loaded here, so saving would silently overwrite those changes. Cancel and open Edit again to reload the latest version before saving.",
                    });
                    return;
                }
                if (result.status === "invalid") {
                    setSaveView({status: "invalid", errors: result.errors, warnings: result.warnings});
                    return;
                }
                if (result.status !== "ok") {
                    setSaveView({status: "error", message: result.error});
                    return;
                }
                markClean(savedRevision);
                setSaveView({status: "ok"});
                setMode("view");
                loadProjection();
            })
            .catch((error: unknown) => setSaveView({status: "error", message: errorMessage(error)}))
            .finally(() => saveGuard.end());
    }

    // Cancel only confirms when there's actually something to lose -- a clean draft (nothing edited, or
    // freshly loaded/saved) returns to the view straight away.
    function handleCancel(): void {
        if (isDirty) {
            confirm("Discard your unsaved changes to this project's game model?", () => setMode("view"));
            return;
        }
        setMode("view");
    }

    if (mode === "view") {
        return (
            <PageSection legend="Game Model">
                <QuickActions>
                    {canEdit ? (
                        <Button onClick={() => setMode("edit")}>Edit</Button>
                    ) : (
                        <Text size="sm" c="dimmed">
                            Read-only — this project doesn&apos;t support editing its game model directly.
                        </Text>
                    )}
                </QuickActions>
                {projectionView.status === "loading" && <LoadingState label="Loading the project's game model…" />}
                {projectionView.status === "error" && <ErrorState message={describePathActionError("The project's game model", projectionView.message)} />}
                {projectionView.status === "ok" && <GameModelView projection={projectionView.projection} />}
            </PageSection>
        );
    }

    if (editLoadView.status === "loading") {
        return (
            <PageSection legend="Game Model">
                <LoadingState label="Loading the project's blueprint…" />
            </PageSection>
        );
    }
    if (editLoadView.status === "unsupported") {
        return (
            <PageSection legend="Game Model">
                <EmptyState message={editLoadView.message} />
                <QuickActions>
                    <Button variant="default" onClick={() => setMode("view")}>
                        Cancel
                    </Button>
                </QuickActions>
            </PageSection>
        );
    }
    if (editLoadView.status === "error") {
        return (
            <PageSection legend="Game Model">
                <ErrorState message={describePathActionError("The project's source blueprint", editLoadView.message)} />
                <QuickActions>
                    <Button variant="default" onClick={() => setMode("view")}>
                        Cancel
                    </Button>
                </QuickActions>
            </PageSection>
        );
    }

    const {blueprint, revision} = editor.state;
    const betModesLifecycleStatus = describeBetModesLifecycleStatus(isDirty, validateView, newBetModeDraftStatus);

    return (
        <PageSection legend="Edit Game Model">
            <QuickActions>
                <Button onClick={handleSaveChanges} loading={saveView.status === "loading"} disabled={validateView.status !== "ok"}>
                    Save changes
                </Button>
                <Button variant="default" onClick={handleCancel}>
                    Cancel
                </Button>
            </QuickActions>
            <Text size="sm" c="dimmed" mb="sm">
                Configure this project&apos;s layout, symbols, win model, paytable, mechanics/features, and bet
                modes, backed by the same GameBlueprint validators and build service the CLI uses — nothing
                here re-implements or duplicates that logic.
            </Text>
            {validateView.status === "error" && <ErrorState message={describePathActionError("This validation request", validateView.message)} />}
            {validateView.status !== "ok" && validateView.status !== "error" && (
                <Text size="sm" c="dimmed" mb="sm">
                    Checking for validation issues automatically as you edit — Save changes stays disabled until your configuration is valid.
                </Text>
            )}
            {saveView.status === "error" && <ErrorState message={describePathActionError("The project's blueprint file", saveView.message)} />}
            {saveView.status === "conflict" && <ErrorState message={saveView.message} />}
            {saveView.status === "invalid" && (
                <div>
                    <IssueList title="Errors" issues={saveView.errors} />
                    <IssueList title="Warnings" issues={saveView.warnings} />
                </div>
            )}

            <SectionedFormEditor key={editor.formGeneration} blueprint={blueprint} mutate={editor.mutate} drafts={editor.drafts} revision={revision} validationView={validateView} />

            <PageSection legend="Win model & mechanics">
                <WinModelSelector blueprint={blueprint} mutate={editor.mutate} />
                <FreeGamesFieldset blueprint={blueprint} mutate={editor.mutate} />
            </PageSection>

            <PageSection legend="Bet modes">
                <Text size="sm" c={BET_MODES_LIFECYCLE_TONE_COLOR[betModesLifecycleStatus.tone]} mb="sm">
                    {betModesLifecycleStatus.text}
                </Text>
                <BetModesEditor blueprint={blueprint} mutate={editor.mutate} newBetModeId={newBetModeId} onNewBetModeIdChange={setNewBetModeId} />
            </PageSection>

            <AdvancedDisclosure detail="raw blueprint JSON">
                {/* BlueprintJsonPanel's Textarea is uncontrolled (defaultValue, read via a ref on Apply)
                    -- correct as long as it remounts fresh whenever the underlying blueprint changes.
                    AdvancedDisclosure keeps its children mounted at all times (see its own doc comment on
                    why), so without this key the panel would capture the blueprint's JSON once at initial
                    load and silently go stale on every subsequent field edit -- and clicking "Apply JSON"
                    against that stale text would revert those edits. Keyed on `revision` (bumped by every
                    mutate(), not just a wholesale load/JSON apply) so it always remounts with the current
                    jsonText, same convention ReelStripGenerationEditor/ParSheetImportExportPanel already
                    use for "must never show stale content" panels. */}
                <BlueprintJsonPanel key={editor.state.revision} jsonText={editor.state.jsonText} jsonError={editor.state.jsonError} onApply={editor.applyJson} />
            </AdvancedDisclosure>
        </PageSection>
    );
}
