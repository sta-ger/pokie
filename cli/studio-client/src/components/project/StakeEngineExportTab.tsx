import {Alert, Button, NumberInput, Stepper, Table, Text, TextInput} from "@mantine/core";
import {IconAlertTriangle, IconCircleCheck, IconInfoCircle} from "@tabler/icons-react";
import {useRef, useState, type ReactNode} from "react";
import {exportStakeEngine, validateStakeEngineExport} from "../../api/apiClient";
import type {StudioStakeEngineExportModeInput} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {
    describeStakeEngineExportOutcome,
    describeStakeEngineExportResult,
    describeStakeEngineExportValidateResult,
    type StakeEngineExportOutcome,
    type StakeEngineExportRequestView,
    type StakeEngineExportValidateRequestView,
} from "../../domain/interpret/StakeEngineExport";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {FieldWarningText} from "../common/FieldWarningText";
import {OutcomeBanner} from "../common/OutcomeBanner";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RecoveryNotice} from "../common/RecoveryNotice";
import {RowActions} from "../common/RowActions";
import {WarningState} from "../common/WarningState";

const OUTCOME_BANNER: Record<StakeEngineExportOutcome, {color: string; icon: ReactNode; title: string}> = {
    success: {color: "green", icon: <IconCircleCheck size={16} />, title: "Clean"},
    partial: {color: "blue", icon: <IconAlertTriangle size={16} />, title: "Completed with warnings"},
    invalid: {color: "red", icon: <IconAlertTriangle size={16} />, title: "Failed"},
};

function downloadJsonBlob(filename: string, data: unknown): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

type ModeFields = {modeName: string; libraryPath: string; cost: number};

const EMPTY_MODE: ModeFields = {modeName: "", libraryPath: "", cost: 1};

type ModeRowStatus = "empty" | "incomplete" | "valid";

function isModeValid(mode: ModeFields): boolean {
    return mode.modeName.trim().length > 0 && mode.libraryPath.trim().length > 0 && Number.isFinite(mode.cost) && mode.cost > 0;
}

// "empty" (never touched -- still exactly what "Add mode" produced) is the only status silently excluded
// from the submitted mode list (see toModeInputs). "incomplete" (the user typed *something* into this row,
// but it still isn't valid) must never be silently dropped the same way -- see hasIncompleteModeRow, which
// blocks Preview/Validate/Export and surfaces a diagnostic instead of quietly submitting a request that's
// missing a mode the user thought they'd included.
function classifyModeRow(mode: ModeFields): ModeRowStatus {
    if (isModeValid(mode)) {
        return "valid";
    }
    const touched = mode.modeName.trim().length > 0 || mode.libraryPath.trim().length > 0 || mode.cost !== EMPTY_MODE.cost;
    return touched ? "incomplete" : "empty";
}

function toModeInputs(modes: readonly ModeFields[]): StudioStakeEngineExportModeInput[] {
    return modes
        .filter((mode) => classifyModeRow(mode) === "valid")
        .map((mode) => ({modeName: mode.modeName.trim(), libraryPath: mode.libraryPath.trim(), cost: mode.cost}));
}

function modeFieldWarnings(mode: ModeFields): {modeName?: string; libraryPath?: string; cost?: string} {
    if (classifyModeRow(mode) !== "incomplete") {
        return {};
    }
    return {
        modeName: mode.modeName.trim().length === 0 ? "Mode name is required." : undefined,
        libraryPath: mode.libraryPath.trim().length === 0 ? "Outcome library path is required." : undefined,
        cost: Number.isFinite(mode.cost) && mode.cost > 0 ? undefined : "Cost must be a positive number.",
    };
}

// Guided Configure -> Preview -> Validate diagnostics -> Export -> Review result workflow, built entirely
// on pokie's own StakeEngineExporter/StakeEngineExportValidator (see StudioStakeEngineExportService) --
// every hash/count/manifest field shown here is computed server-side, never re-derived in this UI (no
// payoutMultiplier-to-Stake-unit conversion, lookup CSV rendering, or manifest field ever happens in the
// browser). Mirrors CertificationTab's own lifecycle discipline: a monotonic requestId ref per async
// action, a double-submit guard, and an invalidate*() helper that resets state and cascades to downstream
// steps whenever an upstream input changes.
export function StakeEngineExportTab() {
    const fetchImpl = useStudioApi();
    const [activeStep, setActiveStep] = useState(0);

    // ---- Configure ----
    const [modes, setModes] = useState<ModeFields[]>([EMPTY_MODE]);
    const [outDir, setOutDir] = useState("stakeengine");

    // ---- Validate diagnostics ----
    const [validateView, setValidateView] = useState<StakeEngineExportValidateRequestView>({status: "idle"});
    const validateRequestIdRef = useRef(0);
    const validateGuard = useDoubleSubmitGuard();

    // ---- Export ----
    const [exportView, setExportView] = useState<StakeEngineExportRequestView>({status: "idle"});
    const exportRequestIdRef = useRef(0);
    const exportGuard = useDoubleSubmitGuard();

    function invalidateExport(): void {
        exportRequestIdRef.current++;
        setExportView({status: "idle"});
        exportGuard.end();
    }

    function invalidateValidate(): void {
        validateRequestIdRef.current++;
        setValidateView({status: "idle"});
        validateGuard.end();
        invalidateExport();
    }

    function handleModesChange(next: ModeFields[]): void {
        setModes(next);
        if (validateView.status !== "idle") {
            invalidateValidate();
        }
    }

    function handleOutDirChange(value: string): void {
        setOutDir(value);
        if (exportView.status !== "idle") {
            invalidateExport();
        }
    }

    function runValidate(): void {
        const modeInputs = toModeInputs(modes);
        if (modeInputs.length === 0 || !validateGuard.begin()) {
            return;
        }
        const requestId = ++validateRequestIdRef.current;
        invalidateExport();
        setValidateView({status: "loading"});
        validateStakeEngineExport(fetchImpl, modeInputs)
            .then((result) => {
                if (requestId !== validateRequestIdRef.current) {
                    return;
                }
                validateGuard.end();
                setValidateView(describeStakeEngineExportValidateResult(result));
            })
            .catch((error: unknown) => {
                if (requestId !== validateRequestIdRef.current) {
                    return;
                }
                validateGuard.end();
                setValidateView({status: "network-error", message: errorMessage(error)});
            });
    }

    function runExport(overwrite: boolean): void {
        const modeInputs = toModeInputs(modes);
        if (modeInputs.length === 0 || outDir.trim().length === 0 || !exportGuard.begin()) {
            return;
        }
        const requestId = ++exportRequestIdRef.current;
        setExportView({status: "loading"});
        exportStakeEngine(fetchImpl, modeInputs, outDir.trim(), overwrite)
            .then((result) => {
                if (requestId !== exportRequestIdRef.current) {
                    return;
                }
                exportGuard.end();
                setExportView(describeStakeEngineExportResult(result));
            })
            .catch((error: unknown) => {
                if (requestId !== exportRequestIdRef.current) {
                    return;
                }
                exportGuard.end();
                setExportView({status: "network-error", message: errorMessage(error)});
            });
    }

    const hasIncompleteModeRow = modes.some((mode) => classifyModeRow(mode) === "incomplete");
    const configureValid = toModeInputs(modes).length > 0 && !hasIncompleteModeRow && outDir.trim().length > 0;
    const previewReachable = configureValid;
    const validateReachable = configureValid;
    const validateOutcome = validateView.status === "ok" ? describeStakeEngineExportOutcome(validateView) : undefined;
    const exportReachable = validateOutcome !== undefined && validateOutcome !== "invalid";
    const exportResult = exportView.status === "ok" ? exportView : undefined;
    let exportOutcome: StakeEngineExportOutcome | undefined;
    if (exportView.status === "ok") {
        exportOutcome = describeStakeEngineExportOutcome({errors: [], warnings: exportView.warnings});
    } else if (exportView.status === "invalid") {
        exportOutcome = describeStakeEngineExportOutcome(exportView);
    }
    const reviewReachable = exportResult !== undefined;

    function renderValidateStep(): ReactNode {
        if (!validateReachable) {
            return <EmptyState message="Configure at least one mode and an output directory first." />;
        }
        return (
            <div>
                <Text size="sm" c="dimmed" mb="sm">
                    Runs the same structural/representability validation the Export step itself performs before
                    writing a single file -- a preflight check, plus a per-mode summary of each library&apos;s own
                    provenance, you can run before committing to Export.
                </Text>
                <QuickActions>
                    <Button onClick={runValidate} loading={validateView.status === "loading"}>
                        Run diagnostics
                    </Button>
                </QuickActions>
                {validateView.status === "network-error" && <ErrorState message={validateView.message} />}
                {validateView.status === "load-error" && <ErrorState message={validateView.error} />}
                {validateOutcome !== undefined && (
                    <OutcomeBanner
                        color={OUTCOME_BANNER[validateOutcome].color}
                        icon={OUTCOME_BANNER[validateOutcome].icon}
                        title={OUTCOME_BANNER[validateOutcome].title}
                        errors={validateView.status === "ok" ? validateView.errors : []}
                        warnings={validateView.status === "ok" ? validateView.warnings : []}
                    />
                )}
                {validateView.status === "ok" && (
                    <PageSection legend="Mode provenance">
                        <Table.ScrollContainer minWidth={560}>
                            <Table withRowBorders={false}>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Mode</Table.Th>
                                        <Table.Th>Cost</Table.Th>
                                        <Table.Th>Outcomes</Table.Th>
                                        <Table.Th>Library id</Table.Th>
                                        <Table.Th>Library hash</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {validateView.modes.map((mode) => (
                                        <Table.Tr key={mode.modeName}>
                                            <Table.Td>{mode.modeName}</Table.Td>
                                            <Table.Td>{mode.cost}</Table.Td>
                                            <Table.Td>{mode.outcomeCount.toLocaleString()}</Table.Td>
                                            <Table.Td style={{overflowWrap: "anywhere"}}>{mode.libraryId}</Table.Td>
                                            <Table.Td style={{overflowWrap: "anywhere"}}>{mode.libraryHash}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    </PageSection>
                )}
                {exportReachable && (
                    <QuickActions>
                        <Button onClick={() => setActiveStep(3)}>Continue to Export</Button>
                    </QuickActions>
                )}
            </div>
        );
    }

    function renderExportStep(): ReactNode {
        if (!exportReachable) {
            return <EmptyState message="Validate the export first." />;
        }
        return (
            <div>
                {hasIncompleteModeRow && (
                    <WarningState message="One or more mode rows on Configure are incomplete. Fill in mode name, library path, and a positive cost, or remove the row, before exporting." />
                )}
                <QuickActions>
                    <Button
                        onClick={() => runExport(false)}
                        loading={exportView.status === "loading"}
                        disabled={toModeInputs(modes).length === 0 || hasIncompleteModeRow}
                    >
                        Export to Stake Engine
                    </Button>
                </QuickActions>
                {exportView.status === "network-error" && <ErrorState message={exportView.message} />}
                {exportView.status === "load-error" && <ErrorState message={exportView.error} />}
                {exportView.status === "conflict" && (
                    <RecoveryNotice
                        title={exportView.error}
                        message="Exporting will replace the existing directory's contents."
                        actionLabel="Overwrite"
                        actionColor="red"
                        onAction={() => runExport(true)}
                    />
                )}
                {exportOutcome !== undefined && (
                    <OutcomeBanner
                        color={OUTCOME_BANNER[exportOutcome].color}
                        icon={OUTCOME_BANNER[exportOutcome].icon}
                        title={OUTCOME_BANNER[exportOutcome].title}
                        errors={exportView.status === "invalid" ? exportView.errors : []}
                        warnings={exportView.status === "ok" || exportView.status === "invalid" ? exportView.warnings : []}
                    />
                )}
                {reviewReachable && (
                    <QuickActions>
                        <Button onClick={() => setActiveStep(4)}>Continue to Review result</Button>
                    </QuickActions>
                )}
            </div>
        );
    }

    return (
        <PageSection legend="Stake Engine Export">
            <Text size="sm" c="dimmed" mb="sm">
                Exports one or more bet modes&apos; canonical outcome libraries to the real Stake Engine math-sdk
                static file format -- everything shown here is computed by pokie&apos;s own
                StakeEngineExporter/StakeEngineExportValidator, never re-derived in this UI.
            </Text>

            <Stepper active={activeStep} onStepClick={setActiveStep} mb="md" size="sm">
                <Stepper.Step label="Configure" description="Source, modes & output" />
                <Stepper.Step label="Preview" description="What will be exported" disabled={!previewReachable} />
                <Stepper.Step label="Validate diagnostics" description="Preflight & provenance" disabled={!validateReachable} />
                <Stepper.Step label="Export" description="Write to disk" disabled={!exportReachable} />
                <Stepper.Step label="Review result" description="Manifest & files" disabled={!reviewReachable} />
            </Stepper>

            {activeStep === 0 && (
                <div>
                    <TextInput
                        label="Output directory"
                        placeholder="./stakeengine"
                        value={outDir}
                        onChange={(event) => handleOutDirChange(event.currentTarget.value)}
                        mb="sm"
                    />
                    <Text size="sm" fw={600} mb={4}>
                        Modes to export
                    </Text>
                    {modes.map((mode, index) => {
                        const warnings = modeFieldWarnings(mode);
                        return (
                            <QuickActions key={index}>
                                <div>
                                    <TextInput
                                        label="Mode name"
                                        placeholder="base"
                                        value={mode.modeName}
                                        onChange={(event) => handleModesChange(modes.map((m, i) => (i === index ? {...m, modeName: event.currentTarget.value} : m)))}
                                    />
                                    <FieldWarningText message={warnings.modeName} />
                                </div>
                                <div>
                                    <TextInput
                                        label="Outcome library path"
                                        placeholder="./outcomes/base.json"
                                        value={mode.libraryPath}
                                        onChange={(event) =>
                                            handleModesChange(modes.map((m, i) => (i === index ? {...m, libraryPath: event.currentTarget.value} : m)))
                                        }
                                    />
                                    <FieldWarningText message={warnings.libraryPath} />
                                </div>
                                <div>
                                    <NumberInput
                                        label="Cost"
                                        min={0}
                                        value={mode.cost}
                                        onChange={(value) => handleModesChange(modes.map((m, i) => (i === index ? {...m, cost: Number(value) || 0} : m)))}
                                    />
                                    <FieldWarningText message={warnings.cost} />
                                </div>
                                {modes.length > 1 && <RowActions itemLabel={`mode ${index + 1}`} onRemove={() => handleModesChange(modes.filter((_, i) => i !== index))} />}
                            </QuickActions>
                        );
                    })}
                    <QuickActions>
                        <Button variant="default" onClick={() => handleModesChange([...modes, {...EMPTY_MODE}])}>
                            Add mode
                        </Button>
                        <Button onClick={() => setActiveStep(1)} disabled={!previewReachable}>
                            Continue to Preview
                        </Button>
                    </QuickActions>
                </div>
            )}

            {activeStep === 1 &&
                (!previewReachable ? (
                    <EmptyState message="Configure at least one mode and an output directory first." />
                ) : (
                    <div>
                        <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />} mb="sm">
                            <Text size="sm">
                                A Stake Engine export produces one <code>index.json</code>, one lookup CSV and one
                                zstd-compressed books file per mode below, and a sibling{" "}
                                <code>pokie-manifest.json</code> carrying pokie&apos;s own provenance -- nothing is
                                written yet.
                            </Text>
                        </Alert>
                        <PageSection legend="Output directory">
                            <Text size="sm" style={{overflowWrap: "anywhere"}}>
                                {outDir}
                            </Text>
                        </PageSection>
                        <PageSection legend="Modes">
                            <Table.ScrollContainer minWidth={480}>
                                <Table withRowBorders={false}>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Mode</Table.Th>
                                            <Table.Th>Outcome library path</Table.Th>
                                            <Table.Th>Cost</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {toModeInputs(modes).map((mode) => (
                                            <Table.Tr key={mode.modeName}>
                                                <Table.Td>{mode.modeName}</Table.Td>
                                                <Table.Td style={{overflowWrap: "anywhere"}}>{mode.libraryPath}</Table.Td>
                                                <Table.Td>{mode.cost}</Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        </PageSection>
                        <QuickActions>
                            <Button onClick={() => setActiveStep(2)}>Continue to Validate diagnostics</Button>
                        </QuickActions>
                    </div>
                ))}

            {activeStep === 2 && renderValidateStep()}
            {activeStep === 3 && renderExportStep()}

            {activeStep === 4 &&
                (exportResult === undefined ? (
                    <EmptyState message="Export to Stake Engine first." />
                ) : (
                    <div>
                        <Alert color="blue" variant="light" mb="sm">
                            <Text size="sm">
                                Every file already lives on disk under the output directory below -- Studio never
                                copies it into the browser. Download the manifest for a quick reference, and point
                                the Stake Engine RGS at the directory itself for the full export.
                            </Text>
                        </Alert>
                        <PageSection legend="Output directory">
                            <Text size="sm" style={{overflowWrap: "anywhere"}}>
                                {exportResult.outDir}
                            </Text>
                        </PageSection>

                        <PageSection legend="Per-mode manifest">
                            <Table.ScrollContainer minWidth={640}>
                                <Table withRowBorders={false}>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Mode</Table.Th>
                                            <Table.Th>Bet mode</Table.Th>
                                            <Table.Th>Stake</Table.Th>
                                            <Table.Th>Cost</Table.Th>
                                            <Table.Th>Outcomes</Table.Th>
                                            <Table.Th>Library hash</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {exportResult.manifest.modes.map((mode) => (
                                            <Table.Tr key={mode.name}>
                                                <Table.Td>{mode.name}</Table.Td>
                                                <Table.Td>{mode.betMode}</Table.Td>
                                                <Table.Td>{mode.stake}</Table.Td>
                                                <Table.Td>{mode.cost}</Table.Td>
                                                <Table.Td>{mode.outcomeCount.toLocaleString()}</Table.Td>
                                                <Table.Td style={{overflowWrap: "anywhere"}}>{mode.libraryHash}</Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        </PageSection>

                        <PageSection legend="Files">
                            {exportResult.files.map((file) => (
                                <Text key={file} size="sm" style={{overflowWrap: "anywhere"}}>
                                    {file}
                                </Text>
                            ))}
                        </PageSection>

                        <AdvancedDisclosure detail="raw manifest">
                            <CodeBlock>{JSON.stringify(exportResult.manifest, null, 2)}</CodeBlock>
                        </AdvancedDisclosure>

                        <QuickActions>
                            <Button
                                onClick={() =>
                                    downloadJsonBlob(`stakeengine-${exportResult.manifest.game.id}-${exportResult.manifest.game.version}-manifest.json`, exportResult.manifest)
                                }
                            >
                                Download manifest.json
                            </Button>
                        </QuickActions>
                    </div>
                ))}
        </PageSection>
    );
}
