import {Alert, Button, Stepper, Text} from "@mantine/core";
import {IconAlertTriangle} from "@tabler/icons-react";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {applyProjectBlueprint, inspectProject, loadBlueprint, loadGameModel, validateBlueprint} from "../../api/apiClient";
import type {GameModelProjection, ValidationIssue} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {asBetModesList, describeNewBetModeDraft, getWinModelType, type NewBetModeDraftStatus} from "../../domain/blueprintFormOps";
import {errorMessage} from "../../domain/errorMessage";
import type {BlueprintValidationView} from "../../domain/interpret/BlueprintEditor";
import {describeSectionStatusText} from "../../domain/interpret/BlueprintSections";
import {classifyIssuesByStep, describeStepStatus, MECHANICS_EDITOR_STEPS, type MechanicsEditorStepId} from "../../domain/interpret/mechanicsEditorSections";
import {describePathActionError} from "../../domain/pathActionError";
import {useBlueprintEditor} from "../../hooks/useBlueprintEditor";
import {useConfirm} from "../../hooks/useConfirm";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {BetModesEditor} from "../blueprintEditor/BetModesEditor";
import {BetsList} from "../blueprintEditor/BetsList";
import {BlueprintJsonPanel} from "../blueprintEditor/BlueprintJsonPanel";
import {FreeGamesFieldset} from "../blueprintEditor/FreeGamesFieldset";
import {LayoutFieldset} from "../blueprintEditor/LayoutFieldset";
import {PaylinesEditor} from "../blueprintEditor/PaylinesEditor";
import {PaytableEditor} from "../blueprintEditor/PaytableEditor";
import {ReelGenerationModeSelector} from "../blueprintEditor/ReelGenerationModeSelector";
import {SymbolsTable} from "../blueprintEditor/SymbolsTable";
import {WinModelSelector} from "../blueprintEditor/WinModelSelector";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {GameModelView} from "./GameModelView";

function describeStepStatusText(stepId: MechanicsEditorStepId, view: BlueprintValidationView): string {
    return describeSectionStatusText(describeStepStatus(stepId, view));
}

// The Bet modes step's own Draft/Saved/Invalid/Unsaved lifecycle line, distinct from the Stepper's
// per-step description above -- that one only ever reflects the last Validate result and stays blank
// until Validate has actually run, so on its own it can't tell the user an edit sits unapplied. A
// duplicate New bet mode id draft takes priority over everything else: BetModesEditor's own field
// already shows its inline error, but the field error alone left this line free to keep saying "Saved"
// for an id that is, in fact, not usable -- untruthful. Invalid (this step's own applied-blueprint
// validation errors) takes priority over Unsaved next: fixing the error is the more urgent fact. See
// BetModesEditor's own newBetModeIdDescription for the separate "Draft" state -- a typed, unique,
// not-yet-added bet mode id -- which this line does not duplicate; a ready draft alone still leaves this
// line as Saved/Unsaved exactly as if it weren't there, matching the fact that Add hasn't committed it
// to the blueprint yet.
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
    const status = describeStepStatus("betModes", view);
    if (status.tone === "error") {
        return {tone: "error", text: "Invalid -- fix the errors below before applying."};
    }
    if (isDirty) {
        return {tone: "warning", text: "Unsaved changes -- go to Apply to save them to the project."};
    }
    return {tone: "success", text: "Saved -- matches the project's applied blueprint."};
}

const BET_MODES_LIFECYCLE_TONE_COLOR: Record<"success" | "warning" | "error", string> = {
    success: "green",
    warning: "orange",
    error: "red",
};

type LoadView = {status: "loading"} | {status: "unsupported"; message: string} | {status: "error"; message: string} | {status: "ok"};

type ApplyView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "conflict"; message: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {status: "ok"};

// Guided Layout & symbols -> Win model/paytable -> Mechanics/features -> Bet modes -> Validate -> Apply
// editor for the *current project's* own source blueprint -- unchanged from before P3-POLISH-16 (Blueprint
// editing is out of scope there, see MechanicsEditorTab's own doc comment). Reuses the Home "Design Game"
// editor's own field components/useBlueprintEditor draft-state hook and the existing blueprint validate/
// load/save/build services as-is -- no new backend routes, no re-implemented domain math (see
// GameBlueprintValidator/GamePackageGenerator for the real rules). Draft/apply/discard, stale-response
// guards, and progressive JSON disclosure follow OutcomeLibrariesTab's own established lifecycle
// discipline; project-switch cleanup is a full remount, not page-level state -- see
// ProjectDashboardPage's `key={projectKey ?? "no-project"}` on MechanicsEditorTab.
function EditableMechanicsEditor({onDirtyChange}: {onDirtyChange?: (dirty: boolean) => void}) {
    const fetchImpl = useStudioApi();
    const confirm = useConfirm();
    const editor = useBlueprintEditor();
    const [activeStep, setActiveStep] = useState(0);
    // Lifted out of BetModesEditor itself: the Bet modes step's own content div only renders while
    // `activeStep === 3` (see below), so a useState local to BetModesEditor would be silently discarded
    // -- losing whatever id the user had typed but not yet clicked "Add bet mode" for -- every time they
    // switched to another step and back. Held here instead, where it survives every step switch, and
    // reset on every wholesale blueprint replace (New/Load/Discard) via the formGeneration effect below,
    // the same "stale scratch state from the previous blueprint must not survive" rule
    // nextFormGenerationIsClean already applies to the dirty-tracking ref.
    const [newBetModeId, setNewBetModeId] = useState("");
    useEffect(() => {
        setNewBetModeId("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor.formGeneration]);
    // Shared by the dirty-tracking effect below (a non-"empty" draft counts as pending, unsaved-loss-risk
    // state even though it isn't in the blueprint yet) and the Bet modes lifecycle status computed later
    // in render (a "duplicate" draft must report Invalid). Recomputed every render from plain state/props
    // -- not a ref -- so it's safe to read here, unlike cleanRevisionRef below.
    const newBetModeDraftStatus = describeNewBetModeDraft(asBetModesList(editor.state.blueprint.betModes), newBetModeId);

    const [loadView, setLoadView] = useState<LoadView>({status: "loading"});
    const loadRequestIdRef = useRef(0);
    const lastLoadedBlueprintRef = useRef<unknown>(undefined);
    // The exact-content hash of `lastLoadedBlueprintRef`'s own content -- the "expectedHash" Apply
    // sends, so the server can do its own conditional commit (see applyProjectBlueprint) instead of
    // this tab trying to detect a conflict itself via a separate load-then-compare round trip.
    const lastLoadedBlueprintHashRef = useRef<string | undefined>(undefined);

    const [validateView, setValidateView] = useState<BlueprintValidationView>({status: "idle"});
    const validateRequestIdRef = useRef(0);
    const validateGuard = useDoubleSubmitGuard();
    const revisionRef = useRef(editor.state.revision);
    useEffect(() => {
        revisionRef.current = editor.state.revision;
    }, [editor.state.revision]);
    // Any edit invalidates a previous (or in-flight) validation result -- bumping the request id and
    // releasing the guard here (not just resetting the view) means an edit made while a validate
    // request is still pending frees up a fresh "Run validation" click immediately, instead of that
    // click being silently swallowed until the stale request eventually settles. Same
    // invalidateXxx() reasoning as OutcomeLibrariesTab's own guard-releasing invalidation helpers.
    useEffect(() => {
        validateRequestIdRef.current++;
        setValidateView({status: "idle"});
        validateGuard.end();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor.state.revision]);

    const [applyView, setApplyView] = useState<ApplyView>({status: "idle"});
    const applyRequestIdRef = useRef(0);
    const applyGuard = useDoubleSubmitGuard();
    // True once a *completed* Apply result (its own success message included) has been silently
    // invalidated by a later edit -- same distinction CertificationTab's own validateOutdated/
    // buildOutdated draw between "outdated" and "never run". Without this, "Applied -- ... up to date."
    // stayed on screen after a subsequent edit, since applyView is otherwise only ever set from
    // runApply()/handleDiscard(), never from the same revision-tracking effect that resets Validate.
    // Cleared the instant a fresh Apply attempt starts, or Discard reverts to the last-applied blueprint.
    const [applyOutdated, setApplyOutdated] = useState(false);
    // Mirrors the validateView-reset effect below, one render tick later so it can see whether the
    // *previous* applyView was worth flagging as outdated (an idle one never was). Kept as its own
    // effect, rather than folded into that one, so each stays focused on the single result it owns.
    useEffect(() => {
        applyRequestIdRef.current++;
        if (applyView.status !== "idle" && applyView.status !== "loading") {
            setApplyOutdated(true);
        }
        setApplyView({status: "idle"});
        applyGuard.end();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor.state.revision]);

    // Dirty-tracking: same cleanRevisionRef/nextFormGenerationIsClean/markClean scheme as
    // BlueprintEditorPage's own (see its doc comment) -- kept local to this tab rather than shared,
    // matching the rest of this codebase's convention of not abstracting this small a pattern across
    // unrelated tabs.
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
    // dependency array instead, which runs after every render (a mutate/markClean/formGeneration
    // change always re-renders anyway) -- same pattern BlueprintEditorPage's own onDirtyChange uses.
    // `isDirty` itself stays scoped to the blueprint's own revision (it drives the Bet modes step's
    // Saved/Unsaved lifecycle line and the Apply step's Discard button, both of which must stay truthful
    // about whether there's an actual blueprint change to save/discard) -- but the onDirtyChange report
    // ProjectDashboardPage gates navigation away from this tab (or closing the project) on also folds in
    // a pending "New bet mode id" draft: a typed-but-not-yet-added id is real, uncommitted user input
    // that a bare tab switch or Back/Forward would otherwise silently throw away with zero warning, same
    // as any other unsaved field edit. formGeneration resets `newBetModeId` on every wholesale replace
    // (New/Load/Discard), so a confirmed Leave -- which remounts this whole tab -- and a Discard both
    // still clear it exactly as before.
    useEffect(() => {
        const dirty = editor.state.revision !== cleanRevisionRef.current;
        setIsDirty(dirty);
        onDirtyChange?.(dirty || newBetModeDraftStatus.status !== "empty");
    });

    // Runs once per mount -- this component is remounted wholesale (key={projectKey}) on a genuine
    // project switch, so there is no separate "project changed" case to handle here.
    useEffect(() => {
        const requestId = ++loadRequestIdRef.current;
        setLoadView({status: "loading"});
        inspectProject(fetchImpl)
            .then((report) => {
                if (requestId !== loadRequestIdRef.current) {
                    return undefined;
                }
                if (!report.generated || report.buildInfo?.source === undefined) {
                    setLoadView({
                        status: "unsupported",
                        message: "This project wasn't built from a tracked source blueprint (no \"source\" recorded in build-info.json), so it can't be edited here.",
                    });
                    return undefined;
                }
                return loadBlueprint(fetchImpl, report.buildInfo.source).then((result) => {
                    if (requestId !== loadRequestIdRef.current) {
                        return;
                    }
                    if (result.status === "load-error") {
                        setLoadView({status: "error", message: result.error});
                        return;
                    }
                    lastLoadedBlueprintRef.current = result.blueprint;
                    lastLoadedBlueprintHashRef.current = result.blueprintHash;
                    nextFormGenerationIsClean.current = true;
                    editor.loadFrom(result.blueprint);
                    setLoadView({status: "ok"});
                });
            })
            .catch((error: unknown) => {
                if (requestId !== loadRequestIdRef.current) {
                    return;
                }
                setLoadView({status: "error", message: errorMessage(error)});
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleValidate(): void {
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
                setValidateView(result);
            })
            .catch((error: unknown) => {
                if (isStale()) {
                    return;
                }
                setValidateView({status: "error", message: errorMessage(error)});
            })
            .finally(() => validateGuard.end());
    }

    // Apply is a single request to the server's own conditional-commit endpoint (see
    // applyGameBlueprintToProject.ts) -- this tab no longer does its own load-then-compare-then-write:
    // the server re-checks the source blueprint's hash itself, immediately before staging its own
    // build+save, and stages both before committing either, so a failed/conflicting Apply always
    // leaves the project's source and generated output exactly as they were before the attempt (see
    // that function's own doc comment for the full conditional-commit sequence). `lastLoadedBlueprintRef`/
    // `lastLoadedBlueprintHashRef`/markClean only advance once the server reports "ok", so Discard
    // after any failure or conflict reverts to what's genuinely still on disk.
    function runApply(): void {
        const expectedHash = lastLoadedBlueprintHashRef.current;
        if (expectedHash === undefined || !applyGuard.begin()) {
            return;
        }
        const appliedRevision = editor.state.revision;
        const requestId = ++applyRequestIdRef.current;
        const isStale = (): boolean => requestId !== applyRequestIdRef.current;
        const blueprint = editor.state.blueprint;
        setApplyOutdated(false);
        setApplyView({status: "loading"});
        applyProjectBlueprint(fetchImpl, blueprint, expectedHash)
            .then((result) => {
                if (isStale()) {
                    return;
                }
                if (result.status === "conflict") {
                    setApplyView({
                        status: "conflict",
                        message:
                            "The project's blueprint file changed on disk since it was loaded here, so applying would silently overwrite those changes. Switch away from this tab and back to reload the latest version before applying.",
                    });
                    return;
                }
                if (result.status === "invalid") {
                    setApplyView({status: "invalid", errors: result.errors, warnings: result.warnings});
                    return;
                }
                if (result.status !== "ok") {
                    setApplyView({status: "error", message: result.error});
                    return;
                }
                lastLoadedBlueprintRef.current = blueprint;
                lastLoadedBlueprintHashRef.current = result.blueprintHash;
                markClean(appliedRevision);
                setApplyView({status: "ok"});
            })
            .catch((error: unknown) => {
                if (isStale()) {
                    return;
                }
                setApplyView({status: "error", message: errorMessage(error)});
            })
            .finally(() => applyGuard.end());
    }

    function handleApply(): void {
        confirm("Save this draft to the project's blueprint and rebuild the generated game module?", runApply);
    }

    function handleDiscard(): void {
        if (lastLoadedBlueprintRef.current === undefined) {
            return;
        }
        nextFormGenerationIsClean.current = true;
        editor.loadFrom(lastLoadedBlueprintRef.current);
        setValidateView({status: "idle"});
        setApplyView({status: "idle"});
        setApplyOutdated(false);
    }

    if (loadView.status === "loading") {
        return (
            <PageSection legend="Mechanics Editor">
                <LoadingState label="Loading the project's blueprint…" />
            </PageSection>
        );
    }
    if (loadView.status === "unsupported") {
        return (
            <PageSection legend="Mechanics Editor">
                <EmptyState message={loadView.message} />
            </PageSection>
        );
    }
    if (loadView.status === "error") {
        return (
            <PageSection legend="Mechanics Editor">
                <ErrorState message={describePathActionError("The project's source blueprint", loadView.message)} />
            </PageSection>
        );
    }

    const {blueprint, revision} = editor.state;
    let allIssues: ValidationIssue[] = [];
    if (validateView.status === "invalid") {
        allIssues = [...validateView.errors, ...validateView.warnings];
    } else if (validateView.status === "ok") {
        allIssues = validateView.warnings;
    }
    const {byStep, unclassified} = classifyIssuesByStep(allIssues);
    const applyBlocked = validateView.status !== "ok";
    const betModesLifecycleStatus = describeBetModesLifecycleStatus(isDirty, validateView, newBetModeDraftStatus);

    function renderStepIssues(stepId: MechanicsEditorStepId): ReactNode {
        const issues = byStep[stepId];
        if (issues.length === 0) {
            return null;
        }
        return (
            <PageSection legend="Diagnostics">
                <IssueList title="Errors" issues={issues.filter((issue) => issue.severity === "error")} />
                <IssueList title="Warnings" issues={issues.filter((issue) => issue.severity === "warning")} />
            </PageSection>
        );
    }

    return (
        <PageSection legend="Mechanics Editor">
            <Text size="sm" c="dimmed" mb="sm">
                Configure this project&apos;s layout, symbols, win model, paytable, mechanics/features, and bet
                modes, backed by the same GameBlueprint validators and build service the CLI uses — nothing
                here re-implements or duplicates that logic.
            </Text>

            <Stepper active={activeStep} onStepClick={setActiveStep} mb="md" size="sm">
                {MECHANICS_EDITOR_STEPS.map((step, index) => (
                    <Stepper.Step
                        key={step.id}
                        label={step.label}
                        description={describeStepStatusText(step.id, validateView)}
                        aria-current={activeStep === index ? "step" : undefined}
                    />
                ))}
                <Stepper.Step
                    label="Validate"
                    description="Errors & warnings"
                    aria-current={activeStep === MECHANICS_EDITOR_STEPS.length ? "step" : undefined}
                />
                <Stepper.Step label="Apply" description="Save & rebuild" aria-current={activeStep === MECHANICS_EDITOR_STEPS.length + 1 ? "step" : undefined} />
            </Stepper>

            {activeStep === 0 && (
                <div key={editor.formGeneration}>
                    <LayoutFieldset blueprint={blueprint} mutate={editor.mutate} />
                    <SymbolsTable blueprint={blueprint} mutate={editor.mutate} />
                    <ReelGenerationModeSelector blueprint={blueprint} mutate={editor.mutate} drafts={editor.drafts} revision={revision} />
                    {renderStepIssues("layoutSymbols")}
                </div>
            )}

            {activeStep === 1 && (
                <div key={editor.formGeneration}>
                    <WinModelSelector blueprint={blueprint} mutate={editor.mutate} />
                    {getWinModelType(blueprint) === "lines" && <PaylinesEditor blueprint={blueprint} mutate={editor.mutate} />}
                    <PaytableEditor blueprint={blueprint} mutate={editor.mutate} />
                    {renderStepIssues("winModelPaytable")}
                </div>
            )}

            {activeStep === 2 && (
                <div key={editor.formGeneration}>
                    <FreeGamesFieldset blueprint={blueprint} mutate={editor.mutate} />
                    {renderStepIssues("mechanicsFeatures")}
                </div>
            )}

            {activeStep === 3 && (
                <div key={editor.formGeneration}>
                    <Text size="sm" c={BET_MODES_LIFECYCLE_TONE_COLOR[betModesLifecycleStatus.tone]} mb="sm">
                        {betModesLifecycleStatus.text}
                    </Text>
                    <BetsList blueprint={blueprint} mutate={editor.mutate} />
                    <BetModesEditor blueprint={blueprint} mutate={editor.mutate} newBetModeId={newBetModeId} onNewBetModeIdChange={setNewBetModeId} />
                    {renderStepIssues("betModes")}
                </div>
            )}

            {activeStep === 4 && (
                <div>
                    <QuickActions>
                        <Button onClick={handleValidate} loading={validateView.status === "loading"}>
                            Run validation
                        </Button>
                    </QuickActions>
                    {validateView.status === "error" && <ErrorState message={describePathActionError("This validation request", validateView.message)} />}
                    {validateView.status === "idle" && (
                        <Text size="sm" c="dimmed">
                            No validation result yet — run validation to see errors and warnings.
                        </Text>
                    )}
                    {(validateView.status === "ok" || validateView.status === "invalid") && (
                        <div>
                            <IssueList title="Errors" issues={validateView.status === "invalid" ? validateView.errors : []} />
                            <IssueList title="Warnings" issues={validateView.warnings} />
                            <IssueList title="Other" issues={unclassified} />
                            {validateView.status === "ok" && validateView.warnings.length === 0 && (
                                <Text size="sm" c="dimmed">
                                    No issues found.
                                </Text>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeStep === 5 && (
                <div>
                    <PageSection legend="Apply">
                        <Text size="sm" c="dimmed" mb="sm">
                            Saves this draft back to the project&apos;s blueprint file, then rebuilds the
                            generated game module in place.
                        </Text>
                        {applyOutdated && (
                            <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} mb="sm">
                                Outdated — this project has been edited since the last Apply attempt. That
                                result no longer reflects what&apos;s configured here; validate and apply
                                again to bring the project up to date.
                            </Alert>
                        )}
                        <QuickActions>
                            <Button onClick={handleApply} loading={applyView.status === "loading"} disabled={applyBlocked}>
                                Apply
                            </Button>
                            <Button variant="default" color="red" onClick={handleDiscard} disabled={!isDirty}>
                                Discard draft
                            </Button>
                        </QuickActions>
                        {applyBlocked && (
                            <Text size="sm" c="dimmed">
                                Validate your configuration successfully before applying.
                            </Text>
                        )}
                        {applyView.status === "error" && <ErrorState message={describePathActionError("The project's blueprint file", applyView.message)} />}
                        {applyView.status === "conflict" && <ErrorState message={applyView.message} />}
                        {applyView.status === "invalid" && (
                            <div>
                                <IssueList title="Errors" issues={applyView.errors} />
                                <IssueList title="Warnings" issues={applyView.warnings} />
                            </div>
                        )}
                        {applyView.status === "ok" && (
                            <Text size="sm" c="green">
                                Applied — the project&apos;s blueprint and generated game module are up to date.
                            </Text>
                        )}
                    </PageSection>
                </div>
            )}

            <AdvancedDisclosure detail="raw blueprint JSON">
                {/* BlueprintJsonPanel's Textarea is uncontrolled (defaultValue, read via a ref on Apply)
                    -- correct as long as it remounts fresh whenever the underlying blueprint changes.
                    AdvancedDisclosure keeps its children mounted at all times now (see its own doc
                    comment on why), so without this key the panel would capture the blueprint's JSON
                    once at initial load and silently go stale on every subsequent field edit -- and
                    clicking "Apply JSON" against that stale text would revert those edits. Keyed on
                    `revision` (bumped by every mutate(), not just New/Load/a JSON apply) so it always
                    remounts with the current jsonText, same convention ReelStripGenerationEditor/
                    ParSheetImportExportPanel already use for "must never show stale content" panels. */}
                <BlueprintJsonPanel
                    key={editor.state.revision}
                    jsonText={editor.state.jsonText}
                    jsonError={editor.state.jsonError}
                    onApply={editor.applyJson}
                />
            </AdvancedDisclosure>
        </PageSection>
    );
}

type ReadOnlyLoadView = {status: "loading"} | {status: "error"; message: string} | {status: "ok"; projection: GameModelProjection};

// The read-only Game Model view for an introspectable-but-not-editable package/WASM project (`canEdit`
// false, resolved by ProjectDashboardPage from BLUEPRINT_BUILD_CAPABILITY) -- a Blueprint project's own
// editable source goes through EditableMechanicsEditor above instead, unchanged from before P3-POLISH-16.
// Backed by the server/core-owned canonical projection GET /api/project/gameModel returns (see
// buildGameModelProjection in "pokie" core / buildProjectGameModel.ts in cli/studio) -- this component
// never parses a raw blueprint or inspect report itself. Every section that isn't actually available (no
// tracked source recorded, a load failure, ...) renders its own explicit diagnostic instead of being
// silently omitted (see GameModelView.tsx). Editing is out of scope here by design (P3-POLISH-16's own
// non-goal) -- a future step is expected to decide whether/how a read-only project like this ever becomes
// editable, which is a materially different question than EditableMechanicsEditor's own "apply a draft
// back to a tracked source blueprint this project already has".
function ReadOnlyGameModel() {
    const fetchImpl = useStudioApi();
    const [loadView, setLoadView] = useState<ReadOnlyLoadView>({status: "loading"});
    const loadRequestIdRef = useRef(0);

    useEffect(() => {
        const requestId = ++loadRequestIdRef.current;
        setLoadView({status: "loading"});
        loadGameModel(fetchImpl)
            .then((projection) => {
                if (requestId !== loadRequestIdRef.current) {
                    return;
                }
                setLoadView({status: "ok", projection});
            })
            .catch((error: unknown) => {
                if (requestId !== loadRequestIdRef.current) {
                    return;
                }
                setLoadView({status: "error", message: errorMessage(error)});
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loadView.status === "loading") {
        return (
            <PageSection legend="Game Model">
                <LoadingState label="Loading the project's game model…" />
            </PageSection>
        );
    }
    if (loadView.status === "error") {
        return (
            <PageSection legend="Game Model">
                <ErrorState message={describePathActionError("The project's game model", loadView.message)} />
            </PageSection>
        );
    }

    return (
        <PageSection legend="Game Model">
            <QuickActions>
                <Text size="sm" c="dimmed">
                    Read-only — this project doesn&apos;t support editing its game model directly.
                </Text>
            </QuickActions>
            <GameModelView projection={loadView.projection} />
        </PageSection>
    );
}

// The Game Model tab -- `canEdit` (BLUEPRINT_BUILD_CAPABILITY, resolved by ProjectDashboardPage) is what
// decides which of the two, materially different, sub-components above actually mounts: a Blueprint
// project's own guided editor (EditableMechanicsEditor, unchanged from before P3-POLISH-16), or an
// introspectable-but-not-editable package/WASM project's read-only projection (ReadOnlyGameModel, new in
// P3-POLISH-16 -- see its own doc comment). Neither ever offers a way into the other: P3-POLISH-16 adds no
// Edit action, and an editable project's own tab never shows the read-only projection instead.
export function MechanicsEditorTab({canEdit, onDirtyChange}: {canEdit: boolean; onDirtyChange?: (dirty: boolean) => void}) {
    if (canEdit) {
        return <EditableMechanicsEditor onDirtyChange={onDirtyChange} />;
    }
    return <ReadOnlyGameModel />;
}
