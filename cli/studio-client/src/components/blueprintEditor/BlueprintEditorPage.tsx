import {Anchor, Badge, Button, Collapse, Group, SegmentedControl, Text, Title} from "@mantine/core";
import {useDisclosure} from "@mantine/hooks";
import {useCallback, useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {checkBlueprintSource, loadBlueprint, openProject, saveBlueprint, saveManagedBlueprint, validateBlueprint} from "../../api/apiClient";
import type {StudioProjectRegistryView} from "../../api/types";
import {useAllowNextDesignNavigation} from "../../context/DesignNavigationGuardContext";
import {useStudioApi} from "../../context/StudioApiProvider";
import {clearPersistedBlueprintDraft, loadPersistedBlueprintDraft, savePersistedBlueprintDraft} from "../../domain/blueprintDraftStorage";
import {createRecommendedBlueprint} from "../../domain/blueprintEditorState";
import {errorMessage} from "../../domain/errorMessage";
import {describePathActionError} from "../../domain/pathActionError";
import {
    describeLoadResult,
    describeSaveManagedResult,
    describeSaveResult,
    describeValidation,
    type BlueprintLoadView,
    type BlueprintSaveView,
    type BlueprintValidationView,
} from "../../domain/interpret/BlueprintEditor";
import type {BuiltBlueprintSnapshot} from "../../domain/interpret/Home";
import {useBlueprintEditor, type BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {useConfirm} from "../../hooks/useConfirm";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {ErrorState} from "../common/ErrorState";
import {QuickActions} from "../common/QuickActions";
import {RecoveryNotice} from "../common/RecoveryNotice";
import {SuccessResult} from "../common/SuccessResult";
import {BetsList} from "./BetsList";
import {BlueprintBuildPanel} from "./BlueprintBuildPanel";
import {BlueprintJsonPanel} from "./BlueprintJsonPanel";
import {BlueprintLoadSaveControls} from "./BlueprintLoadSaveControls";
import {BlueprintValidationPanel} from "./BlueprintValidationPanel";
import {GameModelPreviewPanel} from "./GameModelPreviewPanel";
import {LayoutFieldset} from "./LayoutFieldset";
import {MetadataFieldset} from "./MetadataFieldset";
import {NewBlueprintDialog} from "./NewBlueprintDialog";
import {ParSheetImportExportPanel} from "./ParSheetImportExportPanel";
import {PaylinesEditor} from "./PaylinesEditor";
import {PaytableEditor} from "./PaytableEditor";
import {ReelGenerationModeSelector} from "./ReelGenerationModeSelector";
import {SectionedFormEditor} from "./SectionedFormEditor";
import {SymbolsTable} from "./SymbolsTable";

type BlueprintMode = "form" | "json";
type DebouncedCallbackTimer = {
    schedule: (callback: () => void, delayMs: number) => void;
    cancel: () => void;
    isScheduled: () => boolean;
};

// The guided Design Game editor's own auto-validate debounce (see the revision-bump effect below) --
// long enough that a normal typing burst (several field edits/blurs in quick succession) collapses into
// one request once the user actually pauses, short enough that the "stale" freshness state (see
// BlueprintValidationView's own doc comment) never lingers long enough to read as broken. Only ever
// scheduled in guided mode -- the raw/non-guided editor keeps its existing manual-only "Validate" button.
const AUTO_VALIDATE_DEBOUNCE_MS = 600;

function useDebouncedCallbackTimer(): DebouncedCallbackTimer {
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const cancel = useCallback((): void => {
        if (timerRef.current !== undefined) {
            clearTimeout(timerRef.current);
            timerRef.current = undefined;
        }
    }, []);
    const schedule = useCallback(
        (callback: () => void, delayMs: number): void => {
            cancel();
            timerRef.current = setTimeout(() => {
                timerRef.current = undefined;
                callback();
            }, delayMs);
        },
        [cancel],
    );
    const isScheduled = useCallback((): boolean => timerRef.current !== undefined, []);
    useEffect(() => cancel, [cancel]);
    return {schedule, cancel, isScheduled};
}

// The guided editor's own background check for the opened Blueprint source changing *externally* (see
// sourceVersionRef's own doc comment below) -- same 500ms interval useSimulationPoll/useReplayPoll/
// useProjectContext already use for their own real, setTimeout-based polling (see this project's own
// jest setupTests.ts doc comment), just uncapped in duration: unlike those (each polling a bounded job
// to completion), there's no natural end condition here beyond this page unmounting or the watched
// source itself being cleared (a New/Random/PAR-import replace, or an Undo).
const SOURCE_CHECK_POLL_MS = 500;

// The two ways this session's background source-check poll (see the poll effect below) can find the
// persisted Blueprint source no longer matching what this session believes it last confirmed:
// "changed" (a hand edit, another Studio tab, a CLI command -- the file itself still exists and reads
// fine, just isn't what was last confirmed) or "unavailable" (deleted, moved, or no longer valid JSON).
type SourceDrift = {kind: "changed"} | {kind: "unavailable"; message: string};

// `guided`/`initialPath`/`initialParSheetPath` are purely additive -- omitted (the removed "Advanced
// Tools" raw editor's own usage), this component renders exactly as it always has. `guided` adds a step
// indicator + next-step hint and tucks JSON mode/Load-by-path/Save/PAR Sheet Import-Export behind an
// "advanced options" disclosure, since Build works directly off the in-memory blueprint and doesn't
// strictly need any of them in the guided happy path. `initialPath`, when set, auto-loads that blueprint
// on mount, reusing the exact same handleLoad a manual Load click would use. `initialParSheetPath` (set
// when Home's own Projects "Import Project" action detects a PAR sheet -- see HomePage's own doc
// comment) opens the advanced disclosure and hands the path to ParSheetImportExportPanel, which
// auto-runs Import against it on mount.
export function BlueprintEditorPage({
    guided = false,
    initialPath,
    initialParSheetPath,
    onDirtyChange,
    onManagedProjectSaved,
    isVisible = true,
}: {
    guided?: boolean;
    initialPath?: string;
    initialParSheetPath?: string;
    onDirtyChange?: (dirty: boolean) => void;
    onManagedProjectSaved?: (registeredProject?: StudioProjectRegistryView) => void;
    isVisible?: boolean;
} = {}) {
    const fetchImpl = useStudioApi();
    const navigate = useNavigate();
    const allowNextDesignNavigation = useAllowNextDesignNavigation();
    const confirm = useConfirm();
    // Design Game opens on a real, immediately playable Recommended Project. The raw editor remains
    // intentionally blank when used outside this guided entry point.
    const editor = useBlueprintEditor(guided ? createRecommendedBlueprint() : undefined);
    const [mode, setMode] = useState<BlueprintMode>("form");
    const [blueprintPath, setBlueprintPath] = useState<string>();
    const [overwriteConfirmedForPath, setOverwriteConfirmedForPath] = useState<string>();
    const [loadView, setLoadView] = useState<BlueprintLoadView>({status: "idle"});
    const [saveView, setSaveView] = useState<BlueprintSaveView>({status: "idle"});
    // The guided flow's own prominent "Save" action (see handleGuidedSave below) -- kept separate from
    // `saveView` above since that one renders inside the advanced-options Collapse and would be invisible
    // whenever this action's own result needs to be seen.
    const [managedSaveView, setManagedSaveView] = useState<BlueprintSaveView>({status: "idle"});
    const [workspaceOpenError, setWorkspaceOpenError] = useState<string>();
    // A successful managed save immediately continues into its Workspace. Keep that terminal
    // navigation separate from the creator's save-result UI: once the Workspace has accepted the
    // project, an older creator result must not remain (or reappear) beside the Workspace outcome.
    const workspaceOpenRequestIdRef = useRef(0);
    const [showManagedConflictComparison, setShowManagedConflictComparison] = useState(false);
    const [validationView, setValidationView] = useState<BlueprintValidationView>({status: "idle"});
    // Read once, at mount, whatever a previous Design Game session left in this browser tab's own draft-
    // recovery slot (see blueprintDraftStorage.ts) -- undefined when there's nothing to recover, storage
    // is unusable, or this page mounted with an explicit `initialPath` (a deliberate navigation that
    // already knows exactly which blueprint it wants -- see the initialPath effect below, which would
    // otherwise race this same draft for "what the editor opens showing"). A
    // once-only useState (its setter is never called) rather than a ref, since a ref's `.current` can't
    // be read during render -- same pattern CertificationTab's own persistedFields uses.
    const [persistedDraft] = useState(() => (guided && !initialPath ? loadPersistedBlueprintDraft() : undefined));
    const [draftRecoveryDismissed, setDraftRecoveryDismissed] = useState(false);
    // The persistent "last successful build" record BlueprintBuildPanel renders -- kept here, not inside
    // that panel's own local state, so it survives that panel's own key={`build-${formGeneration}`}
    // remount on a "Restore built blueprint" (itself a wholesale replace, see handleRestoreBuilt below).
    // Cleared on every wholesale replace *except* a restore -- New/Load/Random/a PAR import all make the
    // draft describe a different blueprint than whatever was last built, so showing that old build's
    // summary (and offering to "restore" back to it) would be actively misleading.
    const [builtSnapshot, setBuiltSnapshot] = useState<BuiltBlueprintSnapshot | undefined>(undefined);
    // The .xlsx PAR sheet workbook this draft was Applied from (see handleApplyImportedBlueprint below),
    // undefined for a draft that was never touched by a PAR import -- carried forward through edits, the
    // guided flow's own first Save (as `sourceWorkbookPath`, see handleGuidedSave), a browser-refresh draft
    // recovery (see blueprintDraftStorage's own PersistedBlueprintDraft), and the New flow's own Undo, so
    // "Imported from PAR" stays true of this draft's identity through the whole Apply -> Save ->
    // reopen-from-Projects lifecycle rather than only for the one request that happens to run right after
    // Apply. Deliberately NOT cleared by a successful guided Save -- the whole point is that this project's
    // provenance survives being saved, exactly like the persisted StudioProjectRegistryEntry it produced
    // (see StudioProjectRegistryEntry's own doc comment).
    const [importedFromParSheetPath, setImportedFromParSheetPath] = useState<string | undefined>(undefined);
    const loadGuard = useDoubleSubmitGuard();
    const saveGuard = useDoubleSubmitGuard();
    const validateGuard = useDoubleSubmitGuard();
    const [advancedOpened, {toggle: toggleAdvanced, open: openAdvanced}] = useDisclosure(Boolean(initialParSheetPath));
    // useDisclosure's own initial value above only ever covers a fresh mount -- Projects -> Design (both
    // under the same `/home/:tab` route, see HomePage's own routing doc comment) never remounts this page,
    // so a *second* "Import Project" -> "Open in Design Game" click while already on the Design tab would
    // otherwise land on a PAR sheet the advanced-options Collapse (and therefore
    // ParSheetImportExportPanel's own auto-import effect inside it -- Mantine's Collapse defers a hidden
    // child's effects via React's Activity API) never actually reveals. Reacting to initialParSheetPath
    // itself, not just reading it once, closes that gap the same way ParSheetImportExportPanel's own
    // initialImportPath effect below now does.
    useEffect(() => {
        if (initialParSheetPath) {
            openAdvanced();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialParSheetPath]);
    const [newDialogOpened, {open: openNewDialog, close: closeNewDialog}] = useDisclosure(false);
    // A single-level "undo" for the New flow's own Blank/Generate random replace -- see
    // handleChooseBlank/handleUseRandomBlueprint below for where this is captured, and
    // handleUndoReplace for the restore itself. `validAtRevision` is the revision the replace itself
    // produced (see loadBlueprintEditorState's own "always fromRevision + 1"): any further edit bumps
    // `editor.state.revision` past it, which is what makes the "Undo" banner disappear on its own the
    // moment the user commits to the new draft by editing it, without a separate reset effect.
    const [undoSnapshot, setUndoSnapshot] = useState<
        | {
              blueprint: unknown;
              path: string | undefined;
              overwriteConfirmedForPath: string | undefined;
              wasClean: boolean;
              builtSnapshot: BuiltBlueprintSnapshot | undefined;
              validAtRevision: number;
              importedFromParSheetPath: string | undefined;
          }
        | undefined
    >(undefined);

    // Dirty-tracking: `cleanRevisionRef` is the last revision known to be "safe" -- freshly loaded or
    // freshly saved, i.e. matches the source blueprint on disk -- any revision past it means there are
    // edits unsaved to disk. Deliberately NOT also "freshly built": building a package is a separate fact
    // from saving the source (see BlueprintBuildPanel's own `onBuilt` doc comment), so it must never mark
    // this clean -- doing so used to hide a genuinely unsaved draft's own unsaved-changes warning the
    // moment it happened to build successfully. New/Load reset it via `nextFormGenerationIsClean`
    // (consumed in the formGeneration effect below, since only a *post-commit* read of
    // `editor.state.revision` is correct there -- see the stabilization-pass plan for why manual `+1`
    // arithmetic in the click handler isn't reliable). A successful JSON-textarea apply also bumps
    // formGeneration but is deliberately NOT treated as clean -- it's still an unsaved edit, just a
    // wholesale one.
    const cleanRevisionRef = useRef(editor.state.revision);
    const nextFormGenerationIsClean = useRef(false);
    // Whether the JSON-mode textarea currently holds a typed edit that was never "Apply JSON"-ed --
    // reported up by BlueprintJsonPanel's own dirty derivation (live text vs. editor.state.jsonText).
    // Folded into `isDirty` below so this unsaved, in-progress edit gets exactly the same New/navigation/
    // beforeunload protection a Form edit already has, instead of the zero-warning silent loss switching
    // away from JSON mode (or navigating away) used to cause. Reset on every wholesale replace
    // (New/Load/a successful JSON apply all bump formGeneration) since BlueprintJsonPanel remounts fresh,
    // in sync, at that point -- see the formGeneration effect below.
    const [jsonDraftDirty, setJsonDraftDirty] = useState(false);
    // Save success mutates cleanRevisionRef from an async callback, which (being a ref) doesn't itself
    // trigger a re-render -- this forces one so `isDirty` below gets recomputed against whatever
    // editor.state.revision *actually* is by then (which may have moved past what was saved, if the user
    // kept editing during the round-trip -- markClean must never just report "not dirty").
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
        setJsonDraftDirty(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor.formGeneration]);
    // Refs must never be read during render (react-hooks/refs) -- reading cleanRevisionRef.current here,
    // inside an effect with no dependency array, runs after every render instead, which for this
    // component is effectively every meaningful state change anyway (a mutate/New/Load/Save/Build always
    // re-renders); onDirtyChange is idempotent, so a few redundant calls with the same value are harmless.
    // `isDirty` mirrors the same computation into render-readable state -- the New flow's own dialog
    // needs it synchronously (to decide whether to gate behind a Save/Discard/Cancel confirm) rather
    // than only as a side-effecting callback.
    const [isDirty, setIsDirty] = useState(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const dirty = editor.state.revision !== cleanRevisionRef.current || jsonDraftDirty;
        setIsDirty(dirty);
        onDirtyChange?.(dirty);
    });

    // A second, independent staleness signal alongside revision: incremented once per validate request
    // that actually starts, so a request whose *response* arrives after a *newer* validate request began
    // is recognized as stale even in the (currently impossible, since validateGuard already serializes
    // validate calls) case that guarantee ever changes.
    const validateRequestIdRef = useRef(0);
    // React batches the automatic validation response's state update. If Create Project is clicked in
    // the small gap after that response settles but before the next render observes `validationView`,
    // consult this completed result as well. This keeps one model revision to one validation request
    // while preserving the same success/error outcome the rendered panel will show.
    const completedValidationRef = useRef<{
        revision: number;
        blueprint: Record<string, unknown>;
        validation: BlueprintValidationView;
    } | undefined>(undefined);
    // Clear a completed result at the event boundary too. React may batch a field change and the
    // following Create Project click, so waiting for the revision effect would leave the preceding
    // valid result observable by that click.
    const mutateBlueprint: BlueprintMutate = (mutate) => {
        completedValidationRef.current = undefined;
        editor.mutate(mutate);
    };
    // The scheduled automatic validation may already have begun when Create Project is clicked. Keep
    // its revision separately from the rendered view so the primary action can join that exact check
    // instead of issuing a second request for the same model while React is committing "loading".
    const activeValidationRevisionRef = useRef<number | undefined>(undefined);
    const autoValidateTimer = useDebouncedCallbackTimer();
    // A Create Project action which joined the automatic check above owns saveGuard until that check
    // settles. Its completion is handled by finishPendingGuidedSave below, after the shared result has
    // passed the same revision staleness check as every automatic validation.
    const pendingGuidedSaveRevisionRef = useRef<number | undefined>(undefined);
    const releaseStalePendingGuidedSave = (validatedRevision: number): void => {
        if (pendingGuidedSaveRevisionRef.current !== validatedRevision) {
            return;
        }
        pendingGuidedSaveRevisionRef.current = undefined;
        saveGuard.end();
    };

    // Declared here (rather than down among the other handlers) so the auto-validate debounce inside the
    // revision-bump effect just below can call it directly -- an equivalent ref-indirection would only
    // obscure the same thing ESLint's own react-hooks/immutability rule is asking for: a function used by
    // an earlier-declared effect must itself be declared first.
    const handleValidate = (): void => {
        if (!validateGuard.begin()) {
            return;
        }
        // Captured now, at request-send time -- compared against the *current* refs at response time, so
        // a response for a blueprint that's since changed (an edit, New, Load, JSON Apply -- anything
        // that bumped revision) or been superseded by a newer validate request is discarded rather than
        // clobbering whatever the current, already-reset-to-idle state should be.
        const currentState = editor.getCurrentState();
        const requestedRevision = currentState.revision;
        const requestId = ++validateRequestIdRef.current;
        activeValidationRevisionRef.current = requestedRevision;
        const isStale = (): boolean => requestId !== validateRequestIdRef.current || requestedRevision !== editor.getCurrentState().revision;
        setValidationView({status: "loading"});
        validateBlueprint(fetchImpl, currentState.blueprint)
            .then((result) => {
                if (isStale()) {
                    // A Create Project click may be waiting on this automatic check. Once an edit or
                    // newer validation has made the result stale, it must no longer own saveGuard:
                    // retaining it would make the next primary action appear to do nothing forever.
                    releaseStalePendingGuidedSave(requestedRevision);
                    return;
                }
                const validation = describeValidation(result);
                completedValidationRef.current = {revision: requestedRevision, blueprint: currentState.blueprint, validation};
                setValidationView(validation);
                // eslint-disable-next-line react-hooks/immutability -- the request resolves after this render initializes the shared completion handler.
                finishPendingGuidedSave(validation, requestedRevision);
            })
            .catch((error: unknown) => {
                if (isStale()) {
                    releaseStalePendingGuidedSave(requestedRevision);
                    return;
                }
                const validation: BlueprintValidationView = {status: "error", message: errorMessage(error)};
                completedValidationRef.current = {revision: requestedRevision, blueprint: currentState.blueprint, validation};
                setValidationView(validation);
                // eslint-disable-next-line react-hooks/immutability -- the request resolves after this render initializes the shared completion handler.
                finishPendingGuidedSave(validation, requestedRevision);
            })
            .finally(() => {
                if (activeValidationRevisionRef.current === requestedRevision) {
                    activeValidationRevisionRef.current = undefined;
                }
                validateGuard.end();
                // An edit can outlive the 600ms debounce while this request still owns validateGuard.
                // In that case the scheduled check already fired, observed the guard, and returned;
                // re-run now so the edited revision does not remain permanently unvalidated. When the
                // debounce is still pending it remains the single owner of that follow-up instead.
                if (
                    guided &&
                    isVisible &&
                    requestedRevision !== editor.getCurrentState().revision &&
                    !autoValidateTimer.isScheduled()
                ) {
                    handleValidateRef.current();
                }
            });
    };

    // Always the *latest* handleValidate closure -- kept up to date every render so the background
    // source-check poll below (whose own recursive setTimeout chain is set up once, at mount, and would
    // otherwise keep calling back into whichever handleValidate closure happened to exist that one time)
    // always revalidates against the editor's current blueprint/revision, not a stale mount-time snapshot.
    const handleValidateRef = useRef(handleValidate);
    useEffect(() => {
        handleValidateRef.current = handleValidate;
    });

    // The path + content-hash of the persisted Blueprint source this session currently believes it's
    // watching for external changes -- set together with `blueprintPath` on a successful Load or Save
    // (this exact content is now known to match what's on disk), and cleared (`undefined`) by every
    // wholesale replace that leaves `blueprintPath` describing something this ref's own hash no longer
    // corresponds to (New/Random/PAR-import/Undo -- see each handler's own assignment below). The
    // background poll effect below only ever calls checkBlueprintSource while this is set, and treats a
    // resolved check's own object identity (captured as `watched` at request-send time) as its staleness
    // guard: once a newer Load/Save/change-detection has replaced `sourceVersionRef.current` with a
    // different object, an earlier, now-late response for the *previous* one is recognized as no longer
    // describing what's open and is discarded -- the same current-revision comparison
    // style guard handleValidate's own isStale() uses, just keyed on this ref's identity instead of a
    // revision number, since a source-check response doesn't carry (or need) one of its own.
    const sourceVersionRef = useRef<{path: string; hash: string} | undefined>(undefined);
    // Once drift is found, retain sourceVersionRef as the save's expected hash but stop repeatedly
    // polling the same known-conflicted snapshot. Load or a successful Save clears this pause together
    // with establishing a new source baseline.
    const sourceCheckPausedRef = useRef(false);

    // Set once the background source-check poll below (never any other caller) confirms the persisted
    // Blueprint source `sourceVersionRef` was watching either changed externally ("changed") or has
    // become unreadable (deleted, moved, or no longer valid JSON -- "load-error", see SourceDrift's own
    // doc comment for the two kinds). Deliberately independent of `validationView`: the whole point is
    // that a stale-but-still-"ok"-looking validation of the in-memory draft must never again read as
    // authorizing Build once the persisted source it was last confirmed against has moved on, even after
    // a later content-only edit/auto-validate legitimately re-earns "ok" for the draft itself (see
    // guidedBuildBlocked below, which ANDs both) -- a "changed" result's own guarded revalidate (below)
    // is purely informational about the *current* in-memory draft and must never, by itself, restore the
    // normal Valid/Ready-to-build presentation. Cleared -- the only way out, matching this step's own
    // "block ... until an appropriate reload/save action" contract -- by every handler that establishes a
    // fresh known-good `sourceVersionRef` baseline (Load, Save, guided Save) or that replaces the draft
    // wholesale with something that has no persisted source of its own to complain about (New/Random/
    // Undo/PAR-import, which also clear `sourceVersionRef` itself).
    const [sourceDrift, setSourceDrift] = useState<SourceDrift | undefined>(undefined);

    // A form edit, New, Load, and a successful JSON Apply all bump `revision` (see
    // blueprintEditorState.ts's own doc comment). Every run of this effect, including the very first
    // (component mount):
    //   - resets validationView, uniformly making *any* revision bump stale a previous validation result
    //     -- section statuses (describeSectionStatus already returns "neutral" for "idle"), the guided
    //     progress list/NextStepCallout ("Ready to build" only shows for "ok"), and guided Build-gating
    //     (below, keyed off "ok") all revert for free, with no separate reset needed at each call site.
    //     Guided mode resets to "stale" (not "idle") when the *previous* result was itself a completed
    //     check ("ok"/"invalid"/already-"stale") -- see BlueprintValidationView's own doc comment for why
    //     that's a more truthful state than "never checked" here; every other case (never validated yet,
    //     or non-guided) still resets to plain "idle", exactly as before this pass. The very first run's
    //     own `prev` is always the initial {status: "idle"}, so this step alone is a no-op then.
    //   - (guided only) schedules a debounced auto-validate -- freshness-aware validation running on
    //     every edit *and*, this step's own addition, on the guided editor's very first open, so a
    //     freshly opened blueprint is validated without requiring an edit first (see this step's own
    //     "runs on initial open/load" contract). Skipped on the very first run when `initialPath` is set:
    //     that mount is about to be wholesale-replaced within a tick or two by handleLoad's own
    //     initialPath effect below, whose *own* revision bump reaches this same branch again (this time
    //     not the first run) and reschedules against the real, loaded content -- validating the
    //     throwaway starter blueprint first would only flash a misleading result and waste a request.
    //     Every run except the very first one also autosaves the current draft to this tab's own
    //     recovery slot first -- skipped on mount for the same reason persistedDraft itself is only ever
    //     read once, at mount (see persistedDraft's own doc comment): saving here, before the user has
    //     had any chance to act on a RecoveryNotice still offering an *earlier* draft, would silently
    //     clobber it with whatever this fresh mount starts showing (the blank starter, or -- a moment
    //     later -- initialPath's own load). The non-guided/raw editor keeps its previous manual-only
    //     contract throughout.
    // handleChooseBlank/handleUseRandomBlueprint set validationView explicitly too (see their own doc
    // comments) purely to avoid a one-frame stale-validation flash between their own replace and this
    // effect running; every other bump still relies on this alone.
    const hasRunRevisionEffectRef = useRef(false);
    // Kept separately from the validation debounce: this one only yields a primary action until React
    // has drained the input's preceding blur batch (see handleGuidedSave below).
    const guidedSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => {
        const isInitialMount = !hasRunRevisionEffectRef.current;
        hasRunRevisionEffectRef.current = true;
        setValidationView((prev) =>
            guided && (prev.status === "ok" || prev.status === "invalid" || prev.status === "stale") ? {status: "stale"} : {status: "idle"},
        );
        if (!guided || !isVisible) {
            autoValidateTimer.cancel();
            return undefined;
        }
        if (isInitialMount && initialPath) {
            return undefined;
        }
        if (!isInitialMount) {
            savePersistedBlueprintDraft(editor.state.blueprint, importedFromParSheetPath);
        }
        autoValidateTimer.schedule(handleValidate, AUTO_VALIDATE_DEBOUNCE_MS);
        return autoValidateTimer.cancel;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor.state.revision, isVisible]);

    // Cancels a pending debounced auto-validate on unmount -- a stray setTimeout firing after this page
    // is gone would call setValidationView on an unmounted component.
    useEffect(
        () => () => {
            if (guidedSaveTimerRef.current !== undefined) {
                clearTimeout(guidedSaveTimerRef.current);
            }
        },
        [],
    );

    // Detects the persisted Blueprint source (whatever sourceVersionRef above is currently watching)
    // changing *externally* -- a hand edit, another Studio tab, a CLI command, anything that isn't this
    // same editor's own Load/Save round trip -- so that a stale-on-disk baseline is never silently kept
    // authorizing Build. Runs continuously in the background for as long as this page (guided mode only,
    // matching every other freshness trigger here -- see handleBuilt's own `if (guided)`) is mounted,
    // recursively self-scheduling via setTimeout the same way useSimulationPoll/useReplayPoll's own
    // `poll()` does, rather than `setInterval` -- so a slow in-flight check request (or the app tab going
    // backgrounded/throttled) can never stack up overlapping requests.
    //
    // A "changed" result invalidates the prior validation result (bumped to "stale", the same truthful
    // "checked, then changed" state a revision-bump/Build already produce) and the materialized runtime
    // cache (`builtSnapshot` -- see its own doc comment for why any record of "this exact content was
    // successfully built" must not survive the baseline it was built against moving out from under it),
    // then kicks off a fresh handleValidate() of the *current* in-editor content, never the changed
    // file's own content: this deliberately does not reload/replace the editor's blueprint (an
    // in-progress, unsaved edit must never be silently clobbered by a background check), only
    // re-establishes whether that content is still known-valid on its own terms. It also sets
    // `sourceDrift` to a persistent "changed" diagnostic: the file this session believed it was watching
    // has moved on, and no amount of revalidating the (unchanged) in-memory draft can make that untrue --
    // Build and the "Ready to build"/"Validate" step presentation stay blocked/withheld regardless of
    // what that guarded revalidate finds, until an actual reload or save re-establishes a fresh baseline
    // (see sourceDrift's own doc comment).
    //
    // A "load-error" result -- the persisted source has gone missing, unparseable, or otherwise
    // unreadable, mirroring load()'s own outcome for the same path -- invalidates the same two things a
    // "changed" result does, but never re-arms `sourceVersionRef` (there's no fresh hash to watch) and
    // sets `sourceDrift`'s other kind ("unavailable"), the same persistent diagnostic that a guarded
    // content-only revalidate can never clear on its own (see sourceDrift's own doc comment for why
    // Build stays blocked even once that revalidate reports "ok" again).
    //
    // `watched` is captured once, at request-send time, and compared by identity (not by value) against
    // `sourceVersionRef.current` when the response arrives -- see that ref's own doc comment for why an
    // identity mismatch (a newer Load/Save, or a previous, faster-resolving check already having detected
    // and applied this same change) means this response no longer describes what's open and must be
    // discarded outright, the same "late response for the pre-change source" guard handleValidate's own
    // isStale() already gives every validate request.
    const sourceCheckCancelledRef = useRef(false);
    const sourceCheckTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => {
        if (!guided) {
            return undefined;
        }
        sourceCheckCancelledRef.current = false;

        function scheduleNextCheck(): void {
            if (sourceCheckCancelledRef.current) {
                return;
            }
            sourceCheckTimerRef.current = setTimeout(runCheck, SOURCE_CHECK_POLL_MS);
        }

        function runCheck(): void {
            if (sourceCheckCancelledRef.current) {
                return;
            }
            if (sourceCheckPausedRef.current) {
                scheduleNextCheck();
                return;
            }
            const watched = sourceVersionRef.current;
            if (watched === undefined) {
                scheduleNextCheck();
                return;
            }
            checkBlueprintSource(fetchImpl, watched.path, watched.hash)
                .then((result) => {
                    if (sourceCheckCancelledRef.current || sourceVersionRef.current !== watched) {
                        return;
                    }
                    if (result.status === "changed") {
                        sourceCheckPausedRef.current = true;
                        setBuiltSnapshot(undefined);
                        setValidationView((prev) =>
                            prev.status === "ok" || prev.status === "invalid" || prev.status === "stale" ? {status: "stale"} : prev,
                        );
                        handleValidateRef.current();
                        // The persisted source itself moved on -- see sourceDrift's own doc comment for
                        // why this persists regardless of what that guarded revalidate above finds for
                        // the (unchanged) in-memory draft.
                        setSourceDrift({kind: "changed"});
                    } else if (result.status === "load-error") {
                        // No fresh hash to re-arm with, and nothing left to watch until a real
                        // reload/save re-establishes a source -- see sourceDrift's own doc comment.
                        sourceVersionRef.current = undefined;
                        sourceCheckPausedRef.current = true;
                        setBuiltSnapshot(undefined);
                        setValidationView((prev) =>
                            prev.status === "ok" || prev.status === "invalid" || prev.status === "stale" ? {status: "stale"} : prev,
                        );
                        handleValidateRef.current();
                        setSourceDrift({kind: "unavailable", message: describePathActionError("The opened blueprint source", result.error)});
                    }
                })
                .catch(() => undefined)
                .finally(scheduleNextCheck);
        }

        scheduleNextCheck();
        return () => {
            sourceCheckCancelledRef.current = true;
            if (sourceCheckTimerRef.current !== undefined) {
                clearTimeout(sourceCheckTimerRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [guided]);

    // Captures whatever's in the editor right now, right before a New-flow replace (Blank or Generate
    // random) overwrites it -- what handleUndoReplace restores from. `wasClean` records whether *this*
    // draft itself was a safe checkpoint (freshly loaded/saved) so restoring it doesn't misreport
    // dirtiness in either direction; `builtSnapshot` is this same draft's own last-build record (see its
    // own doc comment), carried along so an Undo also brings back whichever build summary/Restore option
    // went with it, not whatever the replacement draft's own (cleared) build state was; `validAtRevision`
    // is filled in by the caller once loadFrom/newBlueprint has actually produced the replace's own new
    // revision (see undoSnapshot's own doc comment for why that's what gates the "Undo" banner's
    // visibility rather than a separate dismiss).
    const captureReplaceSnapshot = () => ({
        blueprint: editor.state.blueprint,
        path: blueprintPath,
        overwriteConfirmedForPath,
        wasClean: editor.state.revision === cleanRevisionRef.current,
        builtSnapshot,
        importedFromParSheetPath,
    });

    // New -> Blank: the New flow's minimal option (see NewBlueprintDialog's own doc comment) -- same
    // wholesale-replace bookkeeping New always did, now reached through the dialog's dirty-confirm gate
    // instead of directly from the "New Blueprint" button. `setValidationView` here is set explicitly
    // (rather than relying solely on the revision-bump effect below) so the Validation panel can never
    // paint even one frame of the *replaced* draft's own errors/warnings still describing the prior one.
    // `setBuiltSnapshot(undefined)` for the same reason -- the prior draft's own last build describes a
    // blueprint this one has nothing to do with (see builtSnapshot's own doc comment).
    const handleChooseBlank = (): void => {
        const snapshot = captureReplaceSnapshot();
        const revisionBeforeReplace = editor.state.revision;
        nextFormGenerationIsClean.current = true;
        editor.newBlueprint();
        setBlueprintPath(undefined);
        setOverwriteConfirmedForPath(undefined);
        sourceVersionRef.current = undefined;
        sourceCheckPausedRef.current = false;
        setSourceDrift(undefined);
        setLoadView({status: "idle"});
        setSaveView({status: "idle"});
        setValidationView({status: "idle"});
        setBuiltSnapshot(undefined);
        setImportedFromParSheetPath(undefined);
        setUndoSnapshot({...snapshot, validAtRevision: revisionBeforeReplace + 1});
        closeNewDialog();
    };

    const handleChooseRecommended = (): void => {
        handleUseRandomBlueprint(createRecommendedBlueprint());
    };

    // New -> Generate random -> Use this blueprint: same wholesale-replace bookkeeping as Blank/Load,
    // just sourced from NewBlueprintDialog's own POST /api/home/blueprints/random call instead of a
    // starter object or a loaded file -- see StudioBlueprintService.random()'s own doc comment for why
    // this is the exact same RandomGameBlueprintGenerator "pokie build random"/"pokie create --random"
    // use. Never saved to a path of its own (there isn't one yet), so `blueprintPath` clears exactly
    // like Blank. Explicit `setValidationView`/`setBuiltSnapshot` resets for the same reason as
    // handleChooseBlank's own.
    const handleUseRandomBlueprint = (blueprint: unknown): void => {
        const snapshot = captureReplaceSnapshot();
        const revisionBeforeReplace = editor.state.revision;
        nextFormGenerationIsClean.current = true;
        editor.loadFrom(blueprint);
        setBlueprintPath(undefined);
        setOverwriteConfirmedForPath(undefined);
        sourceVersionRef.current = undefined;
        sourceCheckPausedRef.current = false;
        setSourceDrift(undefined);
        setLoadView({status: "idle"});
        setSaveView({status: "idle"});
        setValidationView({status: "idle"});
        setBuiltSnapshot(undefined);
        setImportedFromParSheetPath(undefined);
        setUndoSnapshot({...snapshot, validAtRevision: revisionBeforeReplace + 1});
        closeNewDialog();
    };

    // Restores exactly what a New-flow replace overwrote -- see undoSnapshot's own doc comment for why
    // this is only ever offered for the revision the replace itself produced (any further edit hides it
    // instead of this needing its own dismiss). Only ever reachable while that condition holds, so
    // `undoSnapshot` is never read as possibly-undefined here beyond the type checker's own caution.
    const handleUndoReplace = (): void => {
        if (!undoSnapshot) {
            return;
        }
        nextFormGenerationIsClean.current = undoSnapshot.wasClean;
        editor.loadFrom(undoSnapshot.blueprint);
        setBlueprintPath(undoSnapshot.path);
        setOverwriteConfirmedForPath(undoSnapshot.overwriteConfirmedForPath);
        // The snapshot itself doesn't carry a content hash for `undoSnapshot.path` -- background source-
        // change detection (see sourceVersionRef's own doc comment) simply stays off for this path until
        // the next Load/Save re-establishes a known-good baseline for it.
        sourceVersionRef.current = undefined;
        sourceCheckPausedRef.current = false;
        setSourceDrift(undefined);
        setLoadView({status: "idle"});
        setSaveView({status: "idle"});
        setBuiltSnapshot(undoSnapshot.builtSnapshot);
        setImportedFromParSheetPath(undoSnapshot.importedFromParSheetPath);
        setUndoSnapshot(undefined);
    };

    const handleLoad = (path: string): void => {
        if (!loadGuard.begin()) {
            return;
        }
        setLoadView({status: "loading"});
        loadBlueprint(fetchImpl, path)
            .then((result) => {
                setLoadView(describeLoadResult(result));
                if (result.status === "ok") {
                    nextFormGenerationIsClean.current = true;
                    editor.loadFrom(result.blueprint);
                    setBlueprintPath(result.path);
                    setOverwriteConfirmedForPath(result.path);
                    // A freshly loaded blueprint has nothing to do with whatever the *previous* draft was
                    // last built into -- see builtSnapshot's own doc comment.
                    setBuiltSnapshot(undefined);
                    // A JSON Load opens a blueprint by its own already-established identity (this exact
                    // path's own registry entry, if any, already carries whatever provenance it has) --
                    // never inherits whatever the *previous* in-editor draft's own importedFromParSheetPath
                    // happened to be.
                    setImportedFromParSheetPath(undefined);
                    // This exact content is now known to match `result.path` on disk -- the background
                    // source-check poll starts watching it from here (see sourceVersionRef's own doc
                    // comment).
                    sourceVersionRef.current = {path: result.path, hash: result.blueprintHash};
                    sourceCheckPausedRef.current = false;
                    // A fresh Load is one of the two "reload/save" actions that re-establishes trust --
                    // see sourceDrift's own doc comment.
                    setSourceDrift(undefined);
                }
            })
            .catch((error: unknown) => setLoadView({status: "error", message: errorMessage(error)}))
            .finally(() => loadGuard.end());
    };

    // Draft recovery -- "Restore" replaces the current (still-blank, since `persistedDraft` only reads
    // non-undefined when nothing else has loaded first -- see its own doc comment) draft with whatever
    // this tab's own recovery slot held. A wholesale replace like Load, except deliberately NOT marked
    // clean the way a real Load is: a recovered draft was never confirmed saved anywhere, valid or not
    // (see this step's own "invalid drafts recover/autosave but cannot run required-valid operations"
    // contract -- Save/Build below already gate on validity, not on this). "Discard" clears the slot and
    // leaves the current (still-blank) draft alone.
    const handleRestoreDraft = (): void => {
        if (!persistedDraft) {
            return;
        }
        editor.loadFrom(persistedDraft.blueprint);
        setImportedFromParSheetPath(persistedDraft.importedFromParSheetPath);
        setDraftRecoveryDismissed(true);
    };

    const handleDiscardDraft = (): void => {
        clearPersistedBlueprintDraft();
        setDraftRecoveryDismissed(true);
    };

    // A successful PAR sheet Apply is a wholesale blueprint replace exactly like Load (see
    // ParSheetImportExportPanel's own doc comment) -- same "clean starting point" bookkeeping handleLoad's
    // own success branch does, reusing `sourcePath` (the .xlsx path) as this blueprint's own
    // BlueprintBuildPanel `sourcePath` going forward. `overwriteConfirmedForPath` resets since this isn't
    // a JSON path Save has ever confirmed overwriting.
    const handleApplyImportedBlueprint = (importedBlueprint: unknown, sourcePath: string): void => {
        nextFormGenerationIsClean.current = true;
        editor.loadFrom(importedBlueprint);
        setBlueprintPath(sourcePath);
        setOverwriteConfirmedForPath(undefined);
        // `sourcePath` is the .xlsx workbook, not a JSON blueprint file checkBlueprintSource can read --
        // background source-change detection stays off until a JSON Load/Save gives it a real path to
        // watch (see sourceVersionRef's own doc comment).
        sourceVersionRef.current = undefined;
        sourceCheckPausedRef.current = false;
        setSourceDrift(undefined);
        setLoadView({status: "idle"});
        setSaveView({status: "idle"});
        // Same reasoning as handleLoad's own success branch -- see builtSnapshot's own doc comment.
        setBuiltSnapshot(undefined);
        // This draft's own identity from here on -- see importedFromParSheetPath's own doc comment for how
        // it survives through to the guided flow's first Save (handleGuidedSave) and beyond.
        setImportedFromParSheetPath(sourcePath);
    };

    // "Restore built blueprint"/"Discard unbuilt changes" (BlueprintBuildPanel's own confirm already
    // gated this before calling it) -- a wholesale replace exactly like Load, except it deliberately does
    // NOT touch `builtSnapshot` itself: the whole point is landing back on the exact content that record
    // describes, so it must stay attached to this draft afterward rather than being cleared as if this
    // were some unrelated blueprint (contrast every other wholesale-replace handler above, which does
    // clear it). Also does not mark the draft clean -- the restored content may still differ from
    // whatever's saved to `blueprintPath` on disk (a build can run against never-saved content), and
    // reporting "no unsaved changes" without knowing that would repeat exactly the mistake `onBuilt` no
    // longer makes (see BlueprintBuildPanel's own `onBuilt` doc comment).
    const handleRestoreBuilt = (blueprintToRestore: unknown): void => {
        editor.loadFrom(blueprintToRestore);
    };

    // A successful Build materializes a real runtime package from exactly the blueprint content this
    // render's own `blueprint` closure describes (see BlueprintBuildPanel's own `onBuilt` doc comment) --
    // a distinct event from editing or loading, but one this step's own freshness contract still covers:
    // "invalidate/revalidate ... when runtime materialization occurs". Re-running guided validation here
    // (guarded by handleValidate's own revision/requestId staleness check -- same guard an auto-validate
    // from the revision-bump effect above relies on) keeps the displayed result provably current with
    // the exact revision that was just materialized, rather than silently continuing to trust whatever
    // "ok" result merely *authorized* the build to start. `builtSnapshot` itself is never invalidated
    // here -- it must keep describing exactly what was materialized regardless of what a later validate
    // finds, the same "never touched" contract handleRestoreBuilt's own doc comment already relies on.
    const handleBuilt = (snapshot: BuiltBlueprintSnapshot): void => {
        setBuiltSnapshot(snapshot);
        if (guided) {
            setValidationView((prev) => (prev.status === "ok" || prev.status === "invalid" || prev.status === "stale" ? {status: "stale"} : prev));
            handleValidate();
        }
    };

    useEffect(() => {
        if (initialPath) {
            handleLoad(initialPath);
        }
        // Only ever auto-loads the path this page mounted with -- a later prop change (there isn't one
        // in practice, since it only comes from a one-time navigation state) must not re-trigger a load.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const runSave = (path: string, overwrite: boolean): void => {
        if (!saveGuard.begin()) {
            return;
        }
        // Captured now, at request-send time -- so a further edit made while this save is in flight can
        // never get attributed as "saved" by markClean below once the response actually arrives.
        const savedRevision = editor.state.revision;
        setSaveView({status: "loading"});
        const expectedHash = sourceVersionRef.current?.path === path ? sourceVersionRef.current.hash : undefined;
        saveBlueprint(fetchImpl, path, editor.state.blueprint, overwrite, expectedHash)
            .then((result) => {
                setSaveView(describeSaveResult(result));
                if (result.status === "ok") {
                    setBlueprintPath(result.path);
                    setOverwriteConfirmedForPath(result.path);
                    markClean(savedRevision);
                    // This exact content is now known to match `result.path` on disk -- see
                    // sourceVersionRef's own doc comment.
                    sourceVersionRef.current = {path: result.path, hash: result.blueprintHash};
                    sourceCheckPausedRef.current = false;
                    // A fresh Save is the other of the two "reload/save" actions that re-establishes
                    // trust -- see sourceDrift's own doc comment.
                    setSourceDrift(undefined);
                }
            })
            .catch((error: unknown) => setSaveView({status: "error", message: errorMessage(error)}))
            .finally(() => saveGuard.end());
    };

    const handleSave = (path: string): void => {
        runSave(path, overwriteConfirmedForPath === path);
    };

    const handleOverwrite = (path: string): void => {
        confirm(`Overwrite the blueprint at "${path}"?`, () => runSave(path, true));
    };

    // The guided Design Game editor's own prominent "Save" action validates the current revision as part
    // of the same action when automatic validation has not reached it yet.  This matters for a freshly
    // chosen Recommended/Random model: Create Project is an action, not a hidden two-click prerequisite.
    // The *first* Save (no `blueprintPath`
    // owned yet) creates/chooses a managed Blueprint Project via saveManagedBlueprint -- the editor never
    // asks where; every Save after that (blueprintPath already owned, whether from a prior guided Save or
    // an explicit advanced Load/Save) reuses the ordinary saveBlueprint endpoint against that exact path
    // with overwrite:true, so it never re-asks either. A successful save also clears the draft-recovery
    // slot -- the content is now safely persisted, so there's nothing left to "recover".
    const saveGuidedProject = (savedRevision: number, savedBlueprint: Record<string, unknown>): void => {
        // A retry begins a new Workspace-open lifecycle too, so an older open request cannot reconcile
        // this attempt's UI after it settles.
        workspaceOpenRequestIdRef.current += 1;
        setWorkspaceOpenError(undefined);
        setManagedSaveView({status: "loading"});
        const alreadyOwnsPath = blueprintPath !== undefined && overwriteConfirmedForPath === blueprintPath;
        // Kept as `{raw, view}` pairs (rather than mapping straight to `describeSaveResult`/
        // `describeSaveManagedResult`, which drop `blueprintHash`) so the success branch below can still
        // read the just-written content's own hash off `raw` for sourceVersionRef.
        const request = alreadyOwnsPath
            ? saveBlueprint(
                fetchImpl,
                blueprintPath,
                savedBlueprint,
                true,
                sourceVersionRef.current?.path === blueprintPath ? sourceVersionRef.current.hash : undefined,
            ).then((raw) => ({raw, view: describeSaveResult(raw)}))
            : saveManagedBlueprint(fetchImpl, savedBlueprint, importedFromParSheetPath).then((raw) => ({
                raw,
                view: describeSaveManagedResult(raw),
            }));
        request
            .then(({raw, view}) => {
                setManagedSaveView(view);
                if (view.status === "ok" && raw.status === "ok") {
                    setBlueprintPath(view.path);
                    setOverwriteConfirmedForPath(view.path);
                    markClean(savedRevision);
                    clearPersistedBlueprintDraft();
                    sourceVersionRef.current = {path: view.path, hash: raw.blueprintHash};
                    sourceCheckPausedRef.current = false;
                    // Same as runSave's own success branch -- see sourceDrift's own doc comment.
                    setSourceDrift(undefined);
                    // Home keeps Projects mounted beside this editor, but Projects fetches only when
                    // visible. Give its owner the just-persisted row as well as asking it to reconcile
                    // its list, so the visible Projects update never waits on that request settling.
                    if (!alreadyOwnsPath) {
                        if ("registeredProject" in raw && raw.registeredProject !== undefined) {
                            onManagedProjectSaved?.(raw.registeredProject);
                        }
                        // Open the exact source that this Create Project request just persisted, rather
                        // than treating the registry projection as the creation result. Registration is
                        // durable Home-list metadata and may canonicalize a location independently;
                        // `view.path` is the concrete Blueprint file save-managed confirmed exists.
                        // This keeps a fresh registry from redirecting the first Workspace open to an
                        // unresolved registry location. The saved Blueprint is sufficient to open its
                        // Workspace; a missing optional registry projection must not strand Create
                        // Project on Design Your Game after a successful save.
                        const workspaceOpenRequestId = ++workspaceOpenRequestIdRef.current;
                        openProject(fetchImpl, view.path)
                            .then(({context}) => {
                                if (workspaceOpenRequestId !== workspaceOpenRequestIdRef.current) {
                                    return;
                                }
                                // The saved project is now visibly represented by its Workspace, not by
                                // the hidden creator. Clear the creator result before navigating so a
                                // late render cannot pair a successful Workspace with stale save error
                                // remediation from the previous editor state.
                                setManagedSaveView({status: "idle"});
                                setWorkspaceOpenError(undefined);
                                allowNextDesignNavigation();
                                navigate(`/project/${encodeURIComponent(context.projectRoot)}/overview`);
                            })
                            .catch((error: unknown) => {
                                if (workspaceOpenRequestId === workspaceOpenRequestIdRef.current) {
                                    setWorkspaceOpenError(errorMessage(error));
                                }
                            });
                    }
                }
            })
            .catch((error: unknown) => setManagedSaveView({status: "error", message: errorMessage(error)}))
            .finally(() => saveGuard.end());
    };

    // Function declaration intentionally precedes neither of its callers: handleValidate is created
    // before saveGuidedProject for the auto-validation effect, but it only executes after this render
    // has initialized both handlers. Keeping this completion path shared avoids a second validation
    // request when Create Project races the automatic check on initial open.
    function finishPendingGuidedSave(validation: BlueprintValidationView, validatedRevision: number): void {
        if (pendingGuidedSaveRevisionRef.current !== validatedRevision) {
            return;
        }
        pendingGuidedSaveRevisionRef.current = undefined;
        if (validatedRevision === editor.getCurrentState().revision && validation.status === "ok") {
            saveGuidedProject(validatedRevision, editor.getCurrentState().blueprint);
            return;
        }
        saveGuard.end();
    }

    const handleGuidedSave = (): void => {
        if (!saveGuard.begin()) {
            return;
        }
        // Let React drain the current discrete event before taking the snapshot. A form field commits
        // on blur, and clicking Create Project can be part of that same batch. A microtask can run
        // before React commits that batch, so yield one task to ensure this action validates the
        // just-committed revision rather than saving a previous valid one.
        guidedSaveTimerRef.current = setTimeout(() => {
            guidedSaveTimerRef.current = undefined;
            runGuidedSave();
        }, 0);
    };

    const runGuidedSave = (): void => {
        // A confirmed disk conflict still requires an explicit reload/save decision. Revalidating the
        // in-memory draft cannot make that source baseline current again.
        if (sourceDrift !== undefined) {
            handleValidate();
            saveGuard.end();
            return;
        }

        const savedState = editor.getCurrentState();
        const savedRevision = savedState.revision;
        const completedValidation = completedValidationRef.current;
        // A revision match normally identifies the exact model we checked. Keep the Blueprint object
        // identity alongside it as a second boundary: a completed result must never authorize a newer
        // form snapshot merely because React is still draining the preceding input event batch.
        if (completedValidation?.revision === savedRevision && completedValidation.blueprint === savedState.blueprint) {
            if (completedValidation.validation.status === "ok") {
                saveGuidedProject(savedRevision, savedState.blueprint);
            } else {
                saveGuard.end();
            }
            return;
        }
        // If the scheduled automatic validation has already started for this same revision, use its
        // result. This preserves the one-action Create flow and, crucially, gives one model revision
        // one validation request even under a slow render or a click arriving at the debounce boundary.
        if (activeValidationRevisionRef.current === savedRevision) {
            pendingGuidedSaveRevisionRef.current = savedRevision;
            return;
        }

        // Create Project is allowed before the scheduled automatic check gets its turn, but it must
        // still produce exactly one validation of this revision. Cancel that pending debounce before
        // running the action's check, rather than letting it issue a second, redundant request after
        // this save has already completed.
        autoValidateTimer.cancel();

        const requestId = ++validateRequestIdRef.current;
        setValidationView({status: "loading"});
        validateBlueprint(fetchImpl, savedState.blueprint)
            .then(describeValidation)
            .catch((error: unknown): BlueprintValidationView => ({status: "error", message: errorMessage(error)}))
            .then((validation) => {
                // A model edit (or a newer automatic check) while this action was in flight makes this
                // answer describe an older revision, so leave the current revision to its own automatic
                // validation instead of saving stale content.
                if (requestId !== validateRequestIdRef.current || savedRevision !== editor.getCurrentState().revision) {
                    saveGuard.end();
                    return;
                }
                setValidationView(validation);
                if (validation.status === "ok") {
                    saveGuidedProject(savedRevision, savedState.blueprint);
                } else {
                    saveGuard.end();
                }
            });
    };

    const {blueprint, revision} = editor.state;

    const formModeContent = guided ? (
        <SectionedFormEditor
            key={editor.formGeneration}
            blueprint={blueprint}
            mutate={mutateBlueprint}
            drafts={editor.drafts}
            modeDrafts={editor.modeDrafts}
            revision={revision}
            validationView={validationView}
        />
    ) : (
        <div key={editor.formGeneration}>
            <MetadataFieldset blueprint={blueprint} mutate={mutateBlueprint} />
            <LayoutFieldset blueprint={blueprint} mutate={mutateBlueprint} />
            <SymbolsTable blueprint={blueprint} mutate={mutateBlueprint} />
            <BetsList blueprint={blueprint} mutate={mutateBlueprint} />
            <PaylinesEditor blueprint={blueprint} mutate={mutateBlueprint} />
            <PaytableEditor blueprint={blueprint} mutate={mutateBlueprint} />
            <ReelGenerationModeSelector blueprint={blueprint} mutate={mutateBlueprint} drafts={editor.drafts} modeDrafts={editor.modeDrafts} revision={revision} />
        </div>
    );

    return (
        <div>
            {guided && (
                <div>
                    <Title id="design-game-heading" order={2}>Design Your Game</Title>
                    <Text c="dimmed" size="sm" mb="md">
                        Start with the ready-to-edit starter game, then make it your own. Edit its layout, symbols,
                        reels, prizes, and bets. Studio checks your design as you work; Create game saves it and opens
                        its workspace, where you can play, test, and export it.
                    </Text>
                </div>
            )}

            {persistedDraft && !draftRecoveryDismissed && (
                <RecoveryNotice
                    message="Recovered an unsaved draft from your last session in this tab."
                    actionLabel="Restore"
                    onAction={handleRestoreDraft}
                    secondaryActionLabel="Discard"
                    onSecondaryAction={handleDiscardDraft}
                />
            )}

            {guided && importedFromParSheetPath && (
                <Group gap="xs" mb="xs">
                    <Badge color="grape">Imported from PAR</Badge>
                    <Text size="sm" c="dimmed" style={{overflowWrap: "anywhere"}}>
                        Source: {importedFromParSheetPath}
                    </Text>
                </Group>
            )}

            {guided && (
                <div>
                    <QuickActions>
                        <Button onClick={handleGuidedSave} loading={managedSaveView.status === "loading"}>
                            {blueprintPath === undefined || overwriteConfirmedForPath !== blueprintPath ? "Create game" : "Save game"}
                        </Button>
                    </QuickActions>
                    {validationView.status !== "ok" && (
                        <Text c="dimmed" size="sm" mb="sm">
                            Studio is checking this game design automatically. Create game will show any fixes that are needed.
                        </Text>
                    )}
                    {managedSaveView.status === "ok" && <SuccessResult message="Your game was saved. Opening its workspace…" />}
                    {workspaceOpenError && (
                        <RecoveryNotice
                            title="Your game was saved, but Studio couldn't open its workspace"
                            message="Return to Your projects and open the game again. Your saved work is safe."
                            actionLabel="Go to Your projects"
                            onAction={() => navigate("/home/projects")}
                        />
                    )}
                    {managedSaveView.status === "conflict" && managedSaveView.reason === "stale" && (
                        <div>
                            <RecoveryNotice
                                title="This saved game design changed while you were editing"
                                message={managedSaveView.message}
                                actionLabel="Reload saved version"
                                onAction={() => handleLoad(managedSaveView.path)}
                                secondaryActionLabel="Compare"
                                onSecondaryAction={() => setShowManagedConflictComparison((shown) => !shown)}
                            />
                            {managedSaveView.canSaveAs && (
                                <Button variant="default" size="xs" mb="sm" onClick={openAdvanced}>
                                    Save a copy
                                </Button>
                            )}
                            {showManagedConflictComparison && (
                                <Text component="pre" size="xs" mb="sm" style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>
                                    {JSON.stringify(
                                        {
                                            currentHash: managedSaveView.currentHash,
                                            editedHash: managedSaveView.editedHash,
                                            currentBlueprint: managedSaveView.currentBlueprint,
                                            editedBlueprint: managedSaveView.editedBlueprint,
                                        },
                                        null,
                                        2,
                                    )}
                                </Text>
                            )}
                        </div>
                    )}
                    {(managedSaveView.status === "failed" || managedSaveView.status === "error") && (
                        <ErrorState message={describePathActionError("Your game", managedSaveView.message)} />
                    )}
                </div>
            )}

            {guided && (
                <Text size="sm" mb="sm">
                    <Anchor component="button" type="button" onClick={toggleAdvanced}>
                        {advancedOpened ? "Hide" : "Show"} advanced options (file and JSON tools)
                    </Anchor>
                </Text>
            )}

            <BlueprintLoadSaveControls
                onNew={openNewDialog}
                onLoad={handleLoad}
                onSave={handleSave}
                onOverwrite={handleOverwrite}
                onReloadConflict={handleLoad}
                // NewBlueprintDialog reuses these exact same handleLoad/handleSave/handleOverwrite calls
                // for its own Load existing/dirty-confirm Save steps (see its own doc comment), which
                // otherwise means an in-dialog load-error/save-conflict would render *twice* -- once
                // here, once inside the dialog itself, since both would be reading the same loadView/
                // saveView. Suppressed to "idle" here while the dialog is open (its own copy stays live)
                // -- the fields behind the modal overlay aren't reachable anyway while it's open.
                loadView={newDialogOpened ? {status: "idle"} : loadView}
                saveView={newDialogOpened ? {status: "idle"} : saveView}
                initialLoadPath=""
                initialSavePath=""
                advancedOptionsOpened={guided ? advancedOpened : undefined}
            />

            <NewBlueprintDialog
                opened={newDialogOpened}
                onClose={closeNewDialog}
                isDirty={isDirty}
                blueprintPath={blueprintPath}
                saveView={saveView}
                onSave={handleSave}
                onOverwrite={handleOverwrite}
                loadView={loadView}
                onLoad={handleLoad}
                onChooseRecommended={handleChooseRecommended}
                onChooseBlank={handleChooseBlank}
                onUseRandomBlueprint={handleUseRandomBlueprint}
            />

            {undoSnapshot && undoSnapshot.validAtRevision === revision && (
                <RecoveryNotice
                    message="Replaced the current game design."
                    actionLabel="Undo"
                    onAction={handleUndoReplace}
                />
            )}

            <Collapse expanded={!guided || advancedOpened}>
                <SegmentedControl
                    value={mode}
                    onChange={(value) => {
                        const nextMode = value as BlueprintMode;
                        // Same "confirm before discarding an unapplied edit" gate
                        // ReelStripGenerationEditor's own selectReel() uses for a dirty reel draft --
                        // switching away from JSON mode while jsonDraftDirty would otherwise unmount
                        // BlueprintJsonPanel (and its never-applied draft) with zero warning.
                        if (mode === "json" && jsonDraftDirty && nextMode !== mode) {
                            confirm("Switch away from JSON mode? The unapplied JSON edit will be discarded.", () => {
                                setJsonDraftDirty(false);
                                setMode(nextMode);
                            });
                            return;
                        }
                        setMode(nextMode);
                    }}
                    data={[
                        {label: "Form", value: "form"},
                        {label: "JSON", value: "json"},
                    ]}
                    mb="md"
                    aria-label="Blueprint editor mode"
                />
                <ParSheetImportExportPanel
                    // A wholesale blueprint replace (New/Load/a successful JSON apply) must reset this
                    // panel's own in-progress import/export state entirely -- same "remount via a
                    // formGeneration-keyed ancestor" technique ReelStripGenerationEditor relies on (see
                    // useBlueprintEditor's own doc comment), since this panel otherwise lives outside the
                    // Form/JSON content's own key={editor.formGeneration} boundary.
                    key={editor.formGeneration}
                    blueprint={blueprint}
                    blueprintPath={blueprintPath}
                    revision={revision}
                    onApplyImportedBlueprint={handleApplyImportedBlueprint}
                    initialImportPath={initialParSheetPath}
                />
            </Collapse>

            {mode === "form" ? (
                formModeContent
            ) : (
                // Keyed the same way ParSheetImportExportPanel above is -- an uncontrolled Textarea (see
                // BlueprintJsonPanel's own `defaultValue`) would otherwise keep showing the *previous*
                // blueprint's JSON after a wholesale replace (New/Random/Load), since React never
                // reapplies `defaultValue` on its own. Prefixed (not bare `editor.formGeneration`, unlike
                // ParSheetImportExportPanel's own key above): this element and BlueprintBuildPanel below
                // are direct siblings of `formModeContent` (whose own root already carries a bare
                // `key={editor.formGeneration}`, see its own definition above) *within the same parent's
                // children array*, so reusing that same bare value here would collide with it.
                <BlueprintJsonPanel
                    key={`json-${editor.formGeneration}`}
                    jsonText={editor.state.jsonText}
                    jsonError={editor.state.jsonError}
                    onApply={editor.applyJson}
                    onDraftDirtyChange={setJsonDraftDirty}
                />
            )}

            <BlueprintValidationPanel view={validationView} onValidate={handleValidate} automatic={guided} />
            <GameModelPreviewPanel key={`gamemodel-${editor.formGeneration}`} blueprint={blueprint} />
            {!guided && <BlueprintBuildPanel
                // Same reasoning as BlueprintJsonPanel above -- Output directory/Build Preview/current
                // build-attempt status are this panel's own local, transient state and would otherwise
                // survive a wholesale replace, showing a stale in-flight/error status for a blueprint
                // that's no longer current. `builtSnapshot` itself (the *persistent* last-successful-build
                // record) deliberately lives up here instead, precisely so it survives this remount --
                // see its own doc comment above.
                key={`build-${editor.formGeneration}`}
                blueprint={blueprint}
                sourcePath={blueprintPath}
                builtSnapshot={builtSnapshot}
                onBuilt={handleBuilt}
                onRestoreBuilt={handleRestoreBuilt}
                blocked={validationView.status === "invalid"}
            />}
        </div>
    );
}
