import {Button, Stepper, Text} from "@mantine/core";
import {IconAlertTriangle, IconCircleCheck} from "@tabler/icons-react";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {exportParSheet, importParSheet, previewBlueprintBuild} from "../../api/apiClient";
import {errorMessage} from "../../domain/errorMessage";
import {describeBuildPreview, type BuildPreviewView} from "../../domain/interpret/Home";
import {describePathActionError} from "../../domain/pathActionError";
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
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {BuildPreviewDisplay} from "../common/BuildPreviewDisplay";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {OutcomeBanner} from "../common/OutcomeBanner";
import {PageSection} from "../common/PageSection";
import {PathInput} from "../common/PathInput";
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

// Mirrors ParCommand.ts's own defaultParSheetPath -- `pokie par export`'s real default output location
// for a given blueprint source: same directory, same basename with any known blueprint/PAR-sheet suffix
// stripped, ".par.xlsx" appended (the extra ".par.xlsx" strip, absent from the CLI's own version, covers
// this panel's own round-trip case: `blueprintPath` here can itself already be a PAR sheet, when the
// current blueprint was reached via a prior Import + Apply). Undefined when there's no known source path
// to derive from (a brand-new blueprint, or one only ever edited via New/JSON) -- Export to path stays
// genuinely unresolvable then, not a fabricated guess.
function parSheetExportDefaultPath(blueprintPath: string | undefined): string | undefined {
    if (blueprintPath === undefined || blueprintPath.trim().length === 0) {
        return undefined;
    }
    const lastSlash = Math.max(blueprintPath.lastIndexOf("/"), blueprintPath.lastIndexOf("\\"));
    const dir = lastSlash >= 0 ? blueprintPath.slice(0, lastSlash + 1) : "";
    const filename = lastSlash >= 0 ? blueprintPath.slice(lastSlash + 1) : blueprintPath;
    const base = filename.replace(/\.blueprint\.json$/i, "").replace(/\.par\.xlsx$/i, "").replace(/\.json$/i, "");
    return `${dir}${base}.par.xlsx`;
}

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
    blueprintPath,
    revision,
    onApplyImportedBlueprint,
    initialImportPath,
}: {
    blueprint: Record<string, unknown>;
    // The path the current blueprint was last loaded/imported from (BlueprintEditorPage's own
    // `blueprintPath`), if any -- used only to derive Export to path's own real initial value, below.
    blueprintPath?: string;
    revision: number;
    onApplyImportedBlueprint: (blueprint: unknown, sourcePath: string, conversionEvidence: import("../../api/types").ParSheetConversionEvidence) => void;
    // Set when Home's own Projects "Import Project" action detected a PAR sheet and routed here (see
    // HomePage's own `initialParSheetPath` doc comment) -- auto-runs Import against this path on mount,
    // the same "arrive already on the right step" treatment BlueprintEditorPage's own `initialPath`
    // gives a regular blueprint file, so the user lands straight on Diagnose & map instead of having to
    // re-paste the path they already gave Import Project.
    initialImportPath?: string;
}) {
    const fetchImpl = useStudioApi();
    const confirm = useConfirm();
    const [activeStep, setActiveStep] = useState(0);

    // ---- Preview canonical model state (declared ahead of Import below since invalidateImport/
    // runImportFor both need to invalidate a stale preview the moment the import it was built from
    // changes) ----
    const [buildPreview, setBuildPreview] = useState<BuildPreviewView>({status: "idle"});
    const previewRequestIdRef = useRef(0);
    const previewGuard = useDoubleSubmitGuard();

    // Bumping the ref both marks any in-flight preview request stale (so its late response is ignored,
    // see runCanonicalPreview's own check) and frees the guard immediately, so a fresh preview can start
    // right away instead of waiting for that now-superseded request to settle.
    function invalidatePreview(): void {
        previewRequestIdRef.current++;
        setBuildPreview({status: "idle"});
        previewGuard.end();
    }

    // ---- Import ----
    const [importPath, setImportPath] = useState("");
    const [importView, setImportView] = useState<ParSheetImportView>({status: "idle"});
    const importRequestIdRef = useRef(0);
    const importGuard = useDoubleSubmitGuard();

    // Any change to which file is being imported invalidates whatever was previously shown/pending for
    // the *old* path -- same "an input that changes what a shown result even means" reasoning every other
    // tab in this app already follows (e.g. the Deployment tab's own invalidate() on a mode edit). The
    // canonical preview describes *this* import's blueprint, so it goes stale right along with it.
    function invalidateImport(): void {
        importRequestIdRef.current++;
        setImportView({status: "idle"});
        importGuard.end();
        invalidatePreview();
    }

    function handleImportPathChange(value: string): void {
        setImportPath(value);
        if (importView.status !== "idle") {
            invalidateImport();
        }
    }

    function runImportFor(path: string): void {
        if (path.trim().length === 0 || !importGuard.begin()) {
            return;
        }
        const requestId = ++importRequestIdRef.current;
        invalidatePreview();
        setImportView({status: "loading"});
        importParSheet(fetchImpl, path.trim())
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

    function runImport(): void {
        runImportFor(importPath);
    }

    // Auto-runs Import against whatever path Home's own Import Project routed here with. Unlike
    // BlueprintEditorPage's own initialPath (which only ever arrives via a fresh mount, since Project
    // Dashboard -> Home crosses a real route boundary), this panel's initialImportPath can change without
    // a remount: Projects -> Design is a same-route (`/home/:tab`) tab switch, and HomePage keeps both tab
    // bodies -- this panel included -- permanently mounted (see HomePage's own doc comment), so a second
    // "Import Project" -> "Open in Design Game" click while already on the Design tab only changes this
    // prop, not the component instance. `appliedImportPathRef` makes the auto-run idempotent per distinct
    // path instead of per mount.
    const appliedImportPathRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (initialImportPath && initialImportPath !== appliedImportPathRef.current) {
            appliedImportPathRef.current = initialImportPath;
            setImportPath(initialImportPath);
            runImportFor(initialImportPath);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialImportPath]);

    const importResult = importView.status === "ok" ? importView : undefined;
    const importOutcome = importResult ? describeParSheetImportOutcome(importResult) : undefined;
    const diagnoseReachable = importView.status !== "idle" && importView.status !== "loading";

    // ---- Preview canonical model (reuses the exact same previewBlueprintBuild/BuildPreviewDisplay the
    // Home nav's own Build-from-Blueprint flow already shows; state/invalidatePreview declared above,
    // ahead of Import) ----
    function runCanonicalPreview(): void {
        if (importResult === undefined || !previewGuard.begin()) {
            return;
        }
        const requestId = ++previewRequestIdRef.current;
        setBuildPreview({status: "loading"});
        previewBlueprintBuild(fetchImpl, importResult.blueprint, undefined, importResult.path)
            .then((result) => {
                if (requestId !== previewRequestIdRef.current) {
                    return;
                }
                previewGuard.end();
                setBuildPreview(describeBuildPreview(result));
            })
            .catch((error: unknown) => {
                if (requestId !== previewRequestIdRef.current) {
                    return;
                }
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
            onApplyImportedBlueprint(importResult.blueprint, importResult.path, importResult.conversionEvidence);
        });
    }

    // ---- Export ----
    // Initialized once from `blueprintPath` (not re-derived on every prop change): this panel remounts
    // wholesale via the parent's own `key={formGeneration}` on every wholesale blueprint replace (New/
    // Load/a successful Import Apply -- see this file's own doc comment above), which is exactly when
    // `blueprintPath` itself can change, so a fresh mount always sees the current value.
    const [exportPath, setExportPath] = useState(() => parSheetExportDefaultPath(blueprintPath) ?? "");
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

    function runExport(): void {
        if (exportPath.trim().length === 0 || !exportGuard.begin()) {
            return;
        }
        const requestId = ++exportRequestIdRef.current;
        const requestedRevision = revision;
        const isStale = (): boolean => requestId !== exportRequestIdRef.current || isStaleParSheetExportRequest(requestedRevision, revisionRef.current);
        setExportView({status: "loading"});
        setExportOutcome(undefined);
        exportParSheet(fetchImpl, blueprint, exportPath.trim(), false, blueprintPath)
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

    return (
        <PageSection legend="PAR Sheet Import / Export">
            <Text size="sm" c="dimmed" mb="sm">
                Import an existing PAR sheet (.xlsx) into a canonical POKIE blueprint, or export the blueprint
                currently open in this editor back out to one — both always run through the pokie package&apos;s
                own PAR sheet import/export services, purely in memory until you explicitly Apply or Export.
            </Text>

            <Stepper active={activeStep} onStepClick={setActiveStep} mb="md" size="sm">
                <Stepper.Step label="Import" description="Read a PAR sheet" aria-current={activeStep === 0 ? "step" : undefined} />
                <Stepper.Step
                    label="Diagnose & map"
                    description="Issues & provenance"
                    disabled={!diagnoseReachable}
                    aria-current={activeStep === 1 ? "step" : undefined}
                />
                <Stepper.Step
                    label="Preview canonical model"
                    description="What it becomes"
                    disabled={!previewReachable}
                    aria-current={activeStep === 2 ? "step" : undefined}
                />
                <Stepper.Step label="Apply / Export" description="Commit or write out" aria-current={activeStep === 3 ? "step" : undefined} />
            </Stepper>

            {activeStep === 0 && (
                <div>
                    <QuickActions>
                        <PathInput
                            label="PAR sheet path"
                            placeholder="./game.par.xlsx"
                            kind="file"
                            browseTitle="Browse for a PAR sheet"
                            browseId="par-sheet-import-path"
                            fileFilters={[{name: "PAR sheets", extensions: ["xlsx"]}]}
                            value={importPath}
                            onChange={(event) => handleImportPathChange(event.currentTarget.value)}
                            onPathSelected={handleImportPathChange}
                        />
                        <Button onClick={runImport} loading={importView.status === "loading"}>
                            Import
                        </Button>
                    </QuickActions>
                    {importView.status === "loading" && <LoadingState label="Reading…" />}
                    {importView.status === "error" && <ErrorState message={describePathActionError("The PAR sheet file", importView.message)} />}
                    {importView.status === "load-error" && <ErrorState message={describePathActionError("The PAR sheet file", importView.error)} />}
                </div>
            )}

            {activeStep === 1 &&
                (importResult === undefined || importOutcome === undefined ? (
                    <EmptyState message="Import a PAR sheet first." />
                ) : (
                    <div>
                        <OutcomeBanner
                            color={IMPORT_OUTCOME_BANNER[importOutcome].color}
                            icon={IMPORT_OUTCOME_BANNER[importOutcome].icon}
                            title={IMPORT_OUTCOME_BANNER[importOutcome].title}
                            errors={importResult.errors}
                            warnings={importResult.warnings}
                        />

                        <PageSection legend="Provenance / source">
                            <Text size="sm">{describeParSheetProvenanceSummary(importResult.provenance)}</Text>
                        </PageSection>

                        {previewReachable && (
                            <QuickActions>
                                <Button onClick={() => setActiveStep(2)}>Continue to Preview canonical model</Button>
                            </QuickActions>
                        )}

                        <AdvancedDisclosure detail="raw blueprint, raw import response">
                            <Text size="sm" fw={600} mb={4}>
                                Raw imported blueprint
                            </Text>
                            <CodeBlock>{JSON.stringify(importResult.blueprint, null, 2)}</CodeBlock>
                            <Text size="sm" fw={600} mt="sm" mb={4}>
                                Raw import response
                            </Text>
                            <CodeBlock>{JSON.stringify(importResult, null, 2)}</CodeBlock>
                        </AdvancedDisclosure>
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
                        {buildPreview.status === "ok" && (
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
                            <PathInput
                                label="Export to path"
                                placeholder="./game.par.xlsx"
                                kind="file"
                                browseTitle="Browse for a PAR sheet destination"
                                browseId="par-sheet-export-path"
                                fileFilters={[{name: "PAR sheets", extensions: ["xlsx"]}]}
                                filePickerMode="save"
                                value={exportPath}
                                onChange={(event) => handleExportPathChange(event.currentTarget.value)}
                                onPathSelected={handleExportPathChange}
                            />
                            <Button onClick={runExport} loading={exportView.status === "loading"}>
                                Export
                            </Button>
                        </QuickActions>
                        {exportView.status === "loading" && <LoadingState label="Writing…" />}
                        {exportView.status === "error" && (
                            <ErrorState message={describePathActionError("The PAR sheet export destination", exportView.message)} />
                        )}
                        {exportView.status === "failed" && (
                            <ErrorState message={describePathActionError("The PAR sheet export destination", exportView.message)} />
                        )}
                        {exportView.status === "conflict" && (
                            <ErrorState message={`${exportView.error} Choose a different export path; existing artifacts are never overwritten.`} />
                        )}
                        {exportOutcome !== undefined && (exportView.status === "ok" || exportView.status === "invalid") && (
                            <OutcomeBanner
                                color={EXPORT_OUTCOME_BANNER[exportOutcome].color}
                                icon={EXPORT_OUTCOME_BANNER[exportOutcome].icon}
                                title={EXPORT_OUTCOME_BANNER[exportOutcome].title}
                                errors={exportView.status === "invalid" ? exportView.errors : []}
                                warnings={exportView.warnings}
                            />
                        )}
                    </PageSection>
                </div>
            )}
        </PageSection>
    );
}
