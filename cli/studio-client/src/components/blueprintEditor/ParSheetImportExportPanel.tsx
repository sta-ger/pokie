import {Alert, Anchor, Button, Stepper, Text, TextInput} from "@mantine/core";
import {useDisclosure} from "@mantine/hooks";
import {IconAlertTriangle, IconCircleCheck} from "@tabler/icons-react";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {exportParSheet, importParSheet, previewBlueprintBuild} from "../../api/apiClient";
import {errorMessage} from "../../domain/errorMessage";
import {describeBuildPreview, type BuildPreviewView} from "../../domain/interpret/Home";
import {
    describeParSheetExportOutcome,
    describeParSheetExportResult,
    describeParSheetImportOutcome,
    describeParSheetImportResult,
    describeParSheetProvenanceSummary,
    isStaleParSheetExportRequest,
    type ParSheetExportOutcome,
    type ParSheetExportView,
    type ParSheetImportOutcome,
    type ParSheetImportView,
} from "../../domain/interpret/ParSheetImportExport";
import {useStudioApi} from "../../context/StudioApiProvider";
import {useConfirm} from "../../hooks/useConfirm";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {BuildPreviewDisplay} from "../common/BuildPreviewDisplay";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";

const IMPORT_OUTCOME_BANNER: Record<ParSheetImportOutcome, {color: string; icon: ReactNode; title: string}> = {
    success: {color: "green", icon: <IconCircleCheck size={16} />, title: "Imported successfully"},
    partial: {color: "blue", icon: <IconAlertTriangle size={16} />, title: "Imported with warnings"},
    invalid: {color: "red", icon: <IconAlertTriangle size={16} />, title: "This sheet has unsupported/invalid data"},
};

const EXPORT_OUTCOME_BANNER: Record<ParSheetExportOutcome, {color: string; icon: ReactNode; title: string}> = {
    success: {color: "green", icon: <IconCircleCheck size={16} />, title: "Exported successfully"},
    partial: {color: "blue", icon: <IconCircleCheck size={16} />, title: "Exported with warnings"},
    unsupported: {color: "red", icon: <IconAlertTriangle size={16} />, title: "This blueprint has unsupported data"},
    invalid: {color: "red", icon: <IconAlertTriangle size={16} />, title: "This blueprint is invalid"},
};

// Guided Import -> Diagnose & map -> Preview canonical model -> Apply/Export workflow, built entirely on
// the same Studio API/pokie services "pokie par import"/"pokie par export" themselves use (see
// StudioBlueprintService.importParSheet()/exportParSheet()) -- no spreadsheet parsing, column mapping, or
// blueprint-shape math is reimplemented here; every diagnostic/summary shown is exactly what those
// services already computed. "Preview canonical model" specifically reuses previewBlueprintBuild/
// BuildPreviewDisplay (the same summary the Home nav's own Build-from-Blueprint flow shows) rather than
// inventing a second "what does this blueprint contain" computation.
//
// Import and Export are two genuinely independent concerns sharing one guided flow: an import result
// describes a freshly read file and has nothing to do with the editor's current blueprint (bumping the
// path/re-importing invalidates its own stale response, but never depends on `revision`); an export result
// is entirely about the *current* blueprint and must be invalidated the moment that blueprint changes
// elsewhere (an edit, New/Load, a JSON apply) while the request is in flight -- see the revision-effect
// below, mirroring ReelStripGenerationEditor's own stale-response contract exactly. A wholesale blueprint
// replace instead remounts this whole component via the parent's own `key={formGeneration}` (see
// useBlueprintEditor's own doc comment), which is what resets every piece of state here back to nothing.
export function ParSheetImportExportPanel({
    blueprint,
    revision,
    onApplyImportedBlueprint,
}: {
    blueprint: Record<string, unknown>;
    revision: number;
    onApplyImportedBlueprint: (blueprint: unknown, sourcePath: string) => void;
}) {
    const fetchImpl = useStudioApi();
    const confirm = useConfirm();
    const [activeStep, setActiveStep] = useState(0);

    // ---- Import ----
    const [importPath, setImportPath] = useState("");
    const [importView, setImportView] = useState<ParSheetImportView>({status: "idle"});
    const importRequestIdRef = useRef(0);
    const importGuard = useDoubleSubmitGuard();

    // Any change to which file is being imported invalidates whatever was previously shown/pending for
    // the *old* path -- same "an input that changes what a shown result even means" reasoning every other
    // tab in this app already follows (e.g. the Deployment tab's own invalidate() on a mode edit).
    function invalidateImport(): void {
        importRequestIdRef.current++;
        setImportView({status: "idle"});
        importGuard.end();
    }

    function handleImportPathChange(value: string): void {
        setImportPath(value);
        if (importView.status !== "idle") {
            invalidateImport();
        }
    }

    function runImport(): void {
        if (importPath.trim().length === 0 || !importGuard.begin()) {
            return;
        }
        const requestId = ++importRequestIdRef.current;
        setImportView({status: "loading"});
        importParSheet(fetchImpl, importPath.trim())
            .then((result) => {
                if (requestId !== importRequestIdRef.current) {
                    return;
                }
                importGuard.end();
                setImportView(describeParSheetImportResult(result));
                if (result.status === "ok") {
                    setActiveStep(1);
                }
            })
            .catch((error: unknown) => {
                if (requestId !== importRequestIdRef.current) {
                    return;
                }
                importGuard.end();
                setImportView({status: "error", message: errorMessage(error)});
            });
    }

    const importResult = importView.status === "ok" ? importView : undefined;
    const importOutcome = importResult ? describeParSheetImportOutcome(importResult) : undefined;
    const diagnoseReachable = importView.status !== "idle" && importView.status !== "loading";

    // ---- Preview canonical model (reuses the exact same previewBlueprintBuild/BuildPreviewDisplay the
    // Home nav's own Build-from-Blueprint flow already shows) ----
    const [buildPreview, setBuildPreview] = useState<BuildPreviewView>({status: "idle"});
    const previewGuard = useDoubleSubmitGuard();

    function runCanonicalPreview(): void {
        if (importResult === undefined || !previewGuard.begin()) {
            return;
        }
        setBuildPreview({status: "loading"});
        previewBlueprintBuild(fetchImpl, importResult.blueprint, undefined, importResult.path)
            .then((result) => {
                previewGuard.end();
                setBuildPreview(describeBuildPreview(result));
            })
            .catch((error: unknown) => {
                previewGuard.end();
                setBuildPreview({status: "error", message: errorMessage(error)});
            });
    }

    const previewReachable = importOutcome !== undefined && importOutcome !== "invalid";

    // ---- Apply ----
    function handleApply(): void {
        if (importResult === undefined) {
            return;
        }
        confirm("Replace the current blueprint with the imported one? Unsaved changes in the editor will be lost.", () => {
            onApplyImportedBlueprint(importResult.blueprint, importResult.path);
        });
    }

    // ---- Export ----
    const [exportPath, setExportPath] = useState("");
    const [exportView, setExportView] = useState<ParSheetExportView>({status: "idle"});
    const exportRequestIdRef = useRef(0);
    const exportGuard = useDoubleSubmitGuard();
    const revisionRef = useRef(revision);
    useEffect(() => {
        revisionRef.current = revision;
    }, [revision]);

    const [exportOutcome, setExportOutcome] = useState<ParSheetExportOutcome | undefined>(undefined);

    function invalidateExport(): void {
        exportRequestIdRef.current++;
        setExportView({status: "idle"});
        setExportOutcome(undefined);
        exportGuard.end();
    }

    // The current blueprint changed elsewhere in the form (an edit, New/Load, a JSON apply) -- any
    // previously shown/pending export result described the blueprint as it was *before* this change.
    useEffect(() => {
        invalidateExport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [revision]);

    function handleExportPathChange(value: string): void {
        setExportPath(value);
        if (exportView.status !== "idle") {
            invalidateExport();
        }
    }

    function runExport(overwrite: boolean): void {
        if (exportPath.trim().length === 0 || !exportGuard.begin()) {
            return;
        }
        const requestId = ++exportRequestIdRef.current;
        const requestedRevision = revision;
        const isStale = (): boolean => requestId !== exportRequestIdRef.current || isStaleParSheetExportRequest(requestedRevision, revisionRef.current);
        setExportView({status: "loading"});
        setExportOutcome(undefined);
        exportParSheet(fetchImpl, blueprint, exportPath.trim(), overwrite)
            .then((result) => {
                if (isStale()) {
                    return;
                }
                exportGuard.end();
                setExportView(describeParSheetExportResult(result));
                setExportOutcome(describeParSheetExportOutcome(result));
            })
            .catch((error: unknown) => {
                if (isStale()) {
                    return;
                }
                exportGuard.end();
                setExportView({status: "error", message: errorMessage(error)});
            });
    }

    const [advancedOpened, {toggle: toggleAdvanced}] = useDisclosure(false);

    return (
        <PageSection legend="PAR Sheet Import / Export">
            <Text size="sm" c="dimmed" mb="sm">
                Import an existing PAR sheet (.xlsx) into a canonical POKIE blueprint, or export the blueprint
                currently open in this editor back out to one — both always run through the pokie package&apos;s
                own PAR sheet import/export services, purely in memory until you explicitly Apply or Export.
            </Text>

            <Stepper active={activeStep} onStepClick={setActiveStep} mb="md" size="sm">
                <Stepper.Step label="Import" description="Read a PAR sheet" />
                <Stepper.Step label="Diagnose & map" description="Issues & provenance" disabled={!diagnoseReachable} />
                <Stepper.Step label="Preview canonical model" description="What it becomes" disabled={!previewReachable} />
                <Stepper.Step label="Apply / Export" description="Commit or write out" />
            </Stepper>

            {activeStep === 0 && (
                <div>
                    <QuickActions>
                        <TextInput
                            label="PAR sheet path"
                            placeholder="./game.par.xlsx"
                            value={importPath}
                            onChange={(event) => handleImportPathChange(event.currentTarget.value)}
                        />
                        <Button onClick={runImport} loading={importView.status === "loading"}>
                            Import
                        </Button>
                    </QuickActions>
                    {importView.status === "loading" && <LoadingState label="Reading…" />}
                    {importView.status === "error" && <ErrorState message={importView.message} />}
                    {importView.status === "load-error" && <ErrorState message={importView.error} />}
                </div>
            )}

            {activeStep === 1 &&
                (importResult === undefined || importOutcome === undefined ? (
                    <EmptyState message="Import a PAR sheet first." />
                ) : (
                    <div>
                        <Alert
                            color={IMPORT_OUTCOME_BANNER[importOutcome].color}
                            variant="light"
                            icon={IMPORT_OUTCOME_BANNER[importOutcome].icon}
                            title={IMPORT_OUTCOME_BANNER[importOutcome].title}
                            mb="sm"
                        >
                            <IssueList title="Errors" issues={importResult.errors} />
                            <IssueList title="Warnings" issues={importResult.warnings} />
                            {importResult.errors.length === 0 && importResult.warnings.length === 0 && (
                                <Text size="sm" c="dimmed">
                                    No issues reported.
                                </Text>
                            )}
                        </Alert>

                        <PageSection legend="Provenance / source">
                            <Text size="sm">{describeParSheetProvenanceSummary(importResult.provenance)}</Text>
                        </PageSection>

                        {previewReachable && (
                            <QuickActions>
                                <Button onClick={() => setActiveStep(2)}>Continue to preview canonical model</Button>
                            </QuickActions>
                        )}

                        <Text size="sm" mt="sm">
                            <Anchor component="button" type="button" onClick={toggleAdvanced}>
                                {advancedOpened ? "Hide" : "Show"} advanced details (raw blueprint, raw import response)
                            </Anchor>
                        </Text>
                        {advancedOpened && (
                            <PageSection legend="Advanced details">
                                <Text size="sm" fw={600} mb={4}>
                                    Raw imported blueprint
                                </Text>
                                <CodeBlock>{JSON.stringify(importResult.blueprint, null, 2)}</CodeBlock>
                                <Text size="sm" fw={600} mt="sm" mb={4}>
                                    Raw import response
                                </Text>
                                <CodeBlock>{JSON.stringify(importResult, null, 2)}</CodeBlock>
                            </PageSection>
                        )}
                    </div>
                ))}

            {activeStep === 2 &&
                (!previewReachable || importResult === undefined ? (
                    <EmptyState message="Import a valid PAR sheet first." />
                ) : (
                    <div>
                        <QuickActions>
                            <Button onClick={runCanonicalPreview} loading={buildPreview.status === "loading"}>
                                Preview canonical model
                            </Button>
                        </QuickActions>
                        <BuildPreviewDisplay view={buildPreview} />
                        {buildPreview.status !== "idle" && buildPreview.status !== "loading" && (
                            <QuickActions>
                                <Button onClick={() => setActiveStep(3)}>Continue to Apply / Export</Button>
                            </QuickActions>
                        )}
                    </div>
                ))}

            {activeStep === 3 && (
                <div>
                    <PageSection legend="Apply imported blueprint">
                        {importResult === undefined ? (
                            <EmptyState message="Nothing imported yet -- go back to Import first." />
                        ) : (
                            <div>
                                <Text size="sm" mb="sm">
                                    Replaces the blueprint currently open in this editor with the one imported from{" "}
                                    <strong style={{overflowWrap: "anywhere"}}>{importResult.path}</strong>.
                                </Text>
                                <QuickActions>
                                    <Button onClick={handleApply} disabled={importOutcome === "invalid"}>
                                        Apply
                                    </Button>
                                </QuickActions>
                                {importOutcome === "invalid" && (
                                    <Text size="sm" c="dimmed">
                                        Fix the errors on Diagnose &amp; map before applying this import.
                                    </Text>
                                )}
                            </div>
                        )}
                    </PageSection>

                    <PageSection legend="Export current blueprint">
                        <QuickActions>
                            <TextInput
                                label="Export to path"
                                placeholder="./game.par.xlsx"
                                value={exportPath}
                                onChange={(event) => handleExportPathChange(event.currentTarget.value)}
                            />
                            <Button onClick={() => runExport(false)} loading={exportView.status === "loading"}>
                                Export
                            </Button>
                        </QuickActions>
                        {exportView.status === "loading" && <LoadingState label="Writing…" />}
                        {exportView.status === "error" && <ErrorState message={exportView.message} />}
                        {exportView.status === "failed" && <ErrorState message={exportView.message} />}
                        {exportView.status === "conflict" && (
                            <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} title={exportView.error} style={{overflowWrap: "anywhere"}}>
                                <Button color="red" onClick={() => runExport(true)}>
                                    Overwrite
                                </Button>
                            </Alert>
                        )}
                        {exportOutcome !== undefined && (exportView.status === "ok" || exportView.status === "invalid") && (
                            <Alert
                                color={EXPORT_OUTCOME_BANNER[exportOutcome].color}
                                variant="light"
                                icon={EXPORT_OUTCOME_BANNER[exportOutcome].icon}
                                title={EXPORT_OUTCOME_BANNER[exportOutcome].title}
                                mb="sm"
                            >
                                {exportView.status === "ok" && <IssueList title="Warnings" issues={exportView.warnings} />}
                                {exportView.status === "invalid" && (
                                    <>
                                        <IssueList title="Errors" issues={exportView.errors} />
                                        <IssueList title="Warnings" issues={exportView.warnings} />
                                    </>
                                )}
                            </Alert>
                        )}
                    </PageSection>
                </div>
            )}
        </PageSection>
    );
}
