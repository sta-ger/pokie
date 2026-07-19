import {Button, Stepper, Text} from "@mantine/core";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {applyProjectBlueprint, inspectProject, loadBlueprint, validateBlueprint} from "../../api/apiClient";
import type {ValidationIssue} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {getWinModelType} from "../../domain/blueprintFormOps";
import {errorMessage} from "../../domain/errorMessage";
import type {BlueprintValidationView} from "../../domain/interpret/BlueprintEditor";
import {describeSectionStatusText} from "../../domain/interpret/BlueprintSections";
import {classifyIssuesByStep, describeStepStatus, MECHANICS_EDITOR_STEPS, type MechanicsEditorStepId} from "../../domain/interpret/mechanicsEditorSections";
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

function describeStepStatusText(stepId: MechanicsEditorStepId, view: BlueprintValidationView): string {
    return describeSectionStatusText(describeStepStatus(stepId, view));
}

type LoadView = {status: "loading"} | {status: "unsupported"; message: string} | {status: "error"; message: string} | {status: "ok"};

type ApplyView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "conflict"; message: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {status: "ok"};

// Guided Layout & symbols -> Win model/paytable -> Mechanics/features -> Bet modes -> Validate -> Apply
// editor for the *current project's* own source blueprint. Reuses the Home "Design & Build" editor's
// own field components/useBlueprintEditor draft-state hook and the existing blueprint validate/load/
// save/build services as-is -- no new backend routes, no re-implemented domain math (see
// GameBlueprintValidator/GamePackageGenerator for the real rules). Draft/apply/discard, stale-response
// guards, and progressive JSON disclosure follow OutcomeLibrariesTab's own established lifecycle
// discipline; project-switch cleanup is a full remount, not page-level state -- see
// ProjectDashboardPage's `key={projectKey ?? "no-project"}` on this component.
export function MechanicsEditorTab() {
    const fetchImpl = useStudioApi();
    const confirm = useConfirm();
    const editor = useBlueprintEditor();
    const [activeStep, setActiveStep] = useState(0);

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
    useEffect(() => {
        setIsDirty(editor.state.revision !== cleanRevisionRef.current);
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
                <ErrorState message={loadView.message} />
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
                {MECHANICS_EDITOR_STEPS.map((step) => (
                    <Stepper.Step key={step.id} label={step.label} description={describeStepStatusText(step.id, validateView)} />
                ))}
                <Stepper.Step label="Validate" description="Errors & warnings" />
                <Stepper.Step label="Apply" description="Save & rebuild" />
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
                    <BetsList blueprint={blueprint} mutate={editor.mutate} />
                    <BetModesEditor blueprint={blueprint} mutate={editor.mutate} />
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
                    {validateView.status === "error" && <ErrorState message={validateView.message} />}
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
                        {(applyView.status === "error" || applyView.status === "conflict") && <ErrorState message={applyView.message} />}
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
                <BlueprintJsonPanel jsonText={editor.state.jsonText} jsonError={editor.state.jsonError} onApply={editor.applyJson} />
            </AdvancedDisclosure>
        </PageSection>
    );
}
