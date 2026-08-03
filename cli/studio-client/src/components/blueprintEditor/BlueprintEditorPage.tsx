import {Anchor, Collapse, SegmentedControl, Text, Title} from "@mantine/core";
import {useDisclosure} from "@mantine/hooks";
import {useEffect, useRef, useState} from "react";
import {loadBlueprint, saveBlueprint, validateBlueprint} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {
    describeLoadResult,
    describeSaveResult,
    describeValidation,
    type BlueprintLoadView,
    type BlueprintSaveView,
    type BlueprintValidationView,
} from "../../domain/interpret/BlueprintEditor";
import type {BuiltBlueprintSnapshot} from "../../domain/interpret/Home";
import {useBlueprintEditor} from "../../hooks/useBlueprintEditor";
import {useConfirm} from "../../hooks/useConfirm";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {NextStepCallout} from "../common/NextStepCallout";
import {RecoveryNotice} from "../common/RecoveryNotice";
import {StepProgressList, type StepProgressItem, type StepProgressStatus} from "../common/StepProgressList";
import {BetsList} from "./BetsList";
import {BlueprintBuildPanel} from "./BlueprintBuildPanel";
import {BlueprintJsonPanel} from "./BlueprintJsonPanel";
import {BlueprintLoadSaveControls} from "./BlueprintLoadSaveControls";
import {BlueprintValidationPanel} from "./BlueprintValidationPanel";
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

// The guided flow is a strict 3-stage pipeline with no way to jump ahead (there's nothing to click --
// see StepProgressList.tsx's own doc comment) -- "Build" is only ever reachable once "Validate" has
// actually produced an "ok" result for the *current* revision (validationView resets to "idle" on every
// edit, see the revision-bump effect above), so it's "blocked" rather than merely "available" until then.
const VALIDATE_STEP_STATUS: Record<BlueprintValidationView["status"], StepProgressStatus> = {
    idle: "available",
    loading: "current",
    invalid: "failed",
    error: "failed",
    ok: "completed",
};

function describeGuidedProgress(status: BlueprintValidationView["status"]): StepProgressItem[] {
    const configureStatus: StepProgressStatus = status === "idle" ? "current" : "completed";
    const validateStatus = VALIDATE_STEP_STATUS[status];
    const buildStatus: StepProgressStatus = status === "ok" ? "current" : "blocked";
    return [
        {id: "configure", label: "Configure", description: "Game model", status: configureStatus},
        {id: "validate", label: "Validate", description: "Check for issues", status: validateStatus},
        {id: "build", label: "Build", description: "Create your package", status: buildStatus},
    ];
}

type GuidedNextStep = {tone: "info" | "success" | "warning"; title: string; description: string};

function describeGuidedNextStep(status: BlueprintValidationView["status"]): GuidedNextStep {
    if (status === "ok") {
        return {
            tone: "success",
            title: "Ready to build",
            description: "Your blueprint is valid — build your package below to open it in the Project Dashboard.",
        };
    }
    if (status === "invalid") {
        return {tone: "warning", title: "Fix validation issues", description: "Resolve the errors below before building your package."};
    }
    if (status === "error") {
        return {tone: "warning", title: "Validation failed", description: "Something went wrong while validating — try again."};
    }
    return {
        tone: "info",
        title: "Configure your game model",
        description: "Add symbols, bets, paylines and a paytable below, then validate your configuration.",
    };
}

// `guided`/`initialPath`/`initialParSheetPath` are purely additive -- omitted (the removed "Advanced
// Tools" raw editor's own usage), this component renders exactly as it always has. `guided` adds a step
// indicator + next-step hint and tucks JSON mode/Load-by-path/Save/PAR Sheet Import-Export behind an
// "advanced options" disclosure, since Build works directly off the in-memory blueprint and doesn't
// strictly need any of them in the guided happy path. `initialPath` (set when arriving via Project
// Overview's "Configure Game Model" link) auto-loads that blueprint on mount, reusing the exact same
// handleLoad a manual Load click would use. `initialParSheetPath` (set when Home's own Projects "Import
// Project" action detects a PAR sheet -- see HomePage's own doc comment) opens the advanced disclosure
// and hands the path to ParSheetImportExportPanel, which auto-runs Import against it on mount.
export function BlueprintEditorPage({
    guided = false,
    initialPath,
    initialParSheetPath,
    onDirtyChange,
}: {guided?: boolean; initialPath?: string; initialParSheetPath?: string; onDirtyChange?: (dirty: boolean) => void} = {}) {
    const fetchImpl = useStudioApi();
    const confirm = useConfirm();
    const editor = useBlueprintEditor();
    const [mode, setMode] = useState<BlueprintMode>("form");
    const [blueprintPath, setBlueprintPath] = useState<string>();
    const overwriteConfirmedForPath = useRef<string | undefined>(undefined);
    const [loadView, setLoadView] = useState<BlueprintLoadView>({status: "idle"});
    const [saveView, setSaveView] = useState<BlueprintSaveView>({status: "idle"});
    const [validationView, setValidationView] = useState<BlueprintValidationView>({status: "idle"});
    // The persistent "last successful build" record BlueprintBuildPanel renders -- kept here, not inside
    // that panel's own local state, so it survives that panel's own key={`build-${formGeneration}`}
    // remount on a "Restore built blueprint" (itself a wholesale replace, see handleRestoreBuilt below).
    // Cleared on every wholesale replace *except* a restore -- New/Load/Random/a PAR import all make the
    // draft describe a different blueprint than whatever was last built, so showing that old build's
    // summary (and offering to "restore" back to it) would be actively misleading.
    const [builtSnapshot, setBuiltSnapshot] = useState<BuiltBlueprintSnapshot | undefined>(undefined);
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
        const dirty = editor.state.revision !== cleanRevisionRef.current;
        setIsDirty(dirty);
        onDirtyChange?.(dirty);
    });

    // A form edit, New, Load, and a successful JSON Apply all bump `revision` (see
    // blueprintEditorState.ts's own doc comment) -- resetting validationView to idle on every bump, in
    // one place, uniformly makes *any* of those stale a previous validation result: section statuses
    // (describeSectionStatus already returns "neutral" for "idle"), the guided progress list/NextStepCallout
    // ("Ready to build" only shows for "ok"), and guided Build-gating (below, keyed off "ok") all revert for
    // free, with no separate reset needed at each call site. handleChooseBlank/handleUseRandomBlueprint
    // set this explicitly too (see their own doc comments) purely to avoid a one-frame stale-validation
    // flash between their own replace and this effect running; every other bump still relies on this
    // alone.
    useEffect(() => {
        setValidationView({status: "idle"});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor.state.revision]);

    // Kept in sync with the latest revision on every render so handleValidate's async resolve handler
    // can read the *current* value at response time, not the one closed over at request-send time --
    // same pattern ReelStripGenerationEditor.tsx's own "Resolve reels" preview already uses for its own
    // staleness guard.
    const revisionRef = useRef(editor.state.revision);
    useEffect(() => {
        revisionRef.current = editor.state.revision;
    }, [editor.state.revision]);
    // A second, independent staleness signal alongside revision: incremented once per validate request
    // that actually starts, so a request whose *response* arrives after a *newer* validate request began
    // is recognized as stale even in the (currently impossible, since validateGuard already serializes
    // validate calls) case that guarantee ever changes.
    const validateRequestIdRef = useRef(0);

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
        overwriteConfirmedForPath: overwriteConfirmedForPath.current,
        wasClean: editor.state.revision === cleanRevisionRef.current,
        builtSnapshot,
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
        overwriteConfirmedForPath.current = undefined;
        setLoadView({status: "idle"});
        setSaveView({status: "idle"});
        setValidationView({status: "idle"});
        setBuiltSnapshot(undefined);
        setUndoSnapshot({...snapshot, validAtRevision: revisionBeforeReplace + 1});
        closeNewDialog();
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
        overwriteConfirmedForPath.current = undefined;
        setLoadView({status: "idle"});
        setSaveView({status: "idle"});
        setValidationView({status: "idle"});
        setBuiltSnapshot(undefined);
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
        overwriteConfirmedForPath.current = undoSnapshot.overwriteConfirmedForPath;
        setLoadView({status: "idle"});
        setSaveView({status: "idle"});
        setBuiltSnapshot(undoSnapshot.builtSnapshot);
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
                    overwriteConfirmedForPath.current = result.path;
                    // A freshly loaded blueprint has nothing to do with whatever the *previous* draft was
                    // last built into -- see builtSnapshot's own doc comment.
                    setBuiltSnapshot(undefined);
                }
            })
            .catch((error: unknown) => setLoadView({status: "error", message: errorMessage(error)}))
            .finally(() => loadGuard.end());
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
        overwriteConfirmedForPath.current = undefined;
        setLoadView({status: "idle"});
        setSaveView({status: "idle"});
        // Same reasoning as handleLoad's own success branch -- see builtSnapshot's own doc comment.
        setBuiltSnapshot(undefined);
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
        saveBlueprint(fetchImpl, path, editor.state.blueprint, overwrite)
            .then((result) => {
                setSaveView(describeSaveResult(result));
                if (result.status === "ok") {
                    setBlueprintPath(result.path);
                    overwriteConfirmedForPath.current = result.path;
                    markClean(savedRevision);
                }
            })
            .catch((error: unknown) => setSaveView({status: "error", message: errorMessage(error)}))
            .finally(() => saveGuard.end());
    };

    const handleSave = (path: string): void => {
        runSave(path, overwriteConfirmedForPath.current === path);
    };

    const handleOverwrite = (path: string): void => {
        confirm(`Overwrite the blueprint at "${path}"?`, () => runSave(path, true));
    };

    const handleValidate = (): void => {
        if (!validateGuard.begin()) {
            return;
        }
        // Captured now, at request-send time -- compared against the *current* refs at response time, so
        // a response for a blueprint that's since changed (an edit, New, Load, JSON Apply -- anything
        // that bumped revision) or been superseded by a newer validate request is discarded rather than
        // clobbering whatever the current, already-reset-to-idle state should be.
        const requestedRevision = editor.state.revision;
        const requestId = ++validateRequestIdRef.current;
        const isStale = (): boolean => requestId !== validateRequestIdRef.current || requestedRevision !== revisionRef.current;
        setValidationView({status: "loading"});
        validateBlueprint(fetchImpl, editor.state.blueprint)
            .then((result) => {
                if (isStale()) {
                    return;
                }
                setValidationView(describeValidation(result));
            })
            .catch((error: unknown) => {
                if (isStale()) {
                    return;
                }
                setValidationView({status: "error", message: errorMessage(error)});
            })
            .finally(() => validateGuard.end());
    };

    const {blueprint, revision} = editor.state;

    const guidedProgress = describeGuidedProgress(validationView.status);
    const nextStep = describeGuidedNextStep(validationView.status);

    // Guided flow requires an actual successful validation *of the current revision* before allowing a
    // build -- not just "not known-invalid" (the raw editor's own, looser rule below, unchanged). Since
    // validationView is reset to "idle" on every revision bump (see the effect above), "ok" here can
    // only ever mean "the current revision validated cleanly" -- warnings don't prevent it, matching
    // BlueprintBuildPanel's own existing "warnings-only never blocks" contract.
    const guidedBuildBlocked = validationView.status !== "ok";
    const guidedBuildBlockedMessage =
        validationView.status === "invalid" ? "Fix the validation errors above before building." : "Validate your configuration successfully before building.";

    const formModeContent = guided ? (
        <SectionedFormEditor
            key={editor.formGeneration}
            blueprint={blueprint}
            mutate={editor.mutate}
            drafts={editor.drafts}
            revision={revision}
            validationView={validationView}
        />
    ) : (
        <div key={editor.formGeneration}>
            <MetadataFieldset blueprint={blueprint} mutate={editor.mutate} />
            <LayoutFieldset blueprint={blueprint} mutate={editor.mutate} />
            <SymbolsTable blueprint={blueprint} mutate={editor.mutate} />
            <BetsList blueprint={blueprint} mutate={editor.mutate} />
            <PaylinesEditor blueprint={blueprint} mutate={editor.mutate} />
            <PaytableEditor blueprint={blueprint} mutate={editor.mutate} />
            <ReelGenerationModeSelector blueprint={blueprint} mutate={editor.mutate} drafts={editor.drafts} revision={revision} />
        </div>
    );

    return (
        <div>
            {guided && (
                <div>
                    <Title order={2}>Design Your Game</Title>
                    <Text c="dimmed" size="sm" mb="md">
                        Start from a blank blueprint or load an existing one, configure your game model, validate it, then build your
                        game package.
                    </Text>
                    <StepProgressList steps={guidedProgress} />
                    <NextStepCallout {...nextStep} />
                </div>
            )}

            {guided && (
                <Text size="sm" mb="sm">
                    <Anchor component="button" type="button" onClick={toggleAdvanced}>
                        {advancedOpened ? "Hide" : "Show"} advanced options (JSON mode, load/save by path)
                    </Anchor>
                </Text>
            )}

            <BlueprintLoadSaveControls
                onNew={openNewDialog}
                onLoad={handleLoad}
                onSave={handleSave}
                onOverwrite={handleOverwrite}
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
                onChooseBlank={handleChooseBlank}
                onUseRandomBlueprint={handleUseRandomBlueprint}
            />

            {undoSnapshot && undoSnapshot.validAtRevision === revision && (
                <RecoveryNotice
                    message="Replaced the current blueprint."
                    actionLabel="Undo"
                    onAction={handleUndoReplace}
                />
            )}

            <Collapse expanded={!guided || advancedOpened}>
                <SegmentedControl
                    value={mode}
                    onChange={(value) => setMode(value as BlueprintMode)}
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
                <BlueprintJsonPanel key={`json-${editor.formGeneration}`} jsonText={editor.state.jsonText} jsonError={editor.state.jsonError} onApply={editor.applyJson} />
            )}

            <BlueprintValidationPanel view={validationView} onValidate={handleValidate} />
            <BlueprintBuildPanel
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
                onBuilt={setBuiltSnapshot}
                onRestoreBuilt={handleRestoreBuilt}
                blocked={guided ? guidedBuildBlocked : validationView.status === "invalid"}
                blockedMessage={guided ? guidedBuildBlockedMessage : undefined}
            />
        </div>
    );
}
