import {Alert, Anchor, Badge, Button, Card, Group, NumberInput, Stepper, Table, Text, TextInput} from "@mantine/core";
import {IconAlertTriangle, IconCircleCheck, IconInfoCircle} from "@tabler/icons-react";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {exportStakeEngine, getOutcomeLibraryRegistry, validateStakeEngineExport} from "../../api/apiClient";
import type {OutcomeLibrarySelector, StudioOutcomeLibraryRegistryView, StudioStakeEngineExportModeInput} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {
    classifyStakeEngineExportModeSourceStatus,
    describeStakeEngineExportDestinationNote,
    describeStakeEngineExportModeSourceStatus,
    describeStakeEngineExportOutcome,
    describeStakeEngineExportResult,
    describeStakeEngineExportValidateResult,
    discoverStakeEngineExportModeLibrarySelector,
    isAutoDiscoverableStakeEngineExportLibrarySelector,
    isBlankStakeEngineExportLibrarySelector,
    type StakeEngineExportOutcome,
    type StakeEngineExportRequestView,
    type StakeEngineExportValidateRequestView,
} from "../../domain/interpret/StakeEngineExport";
import {describePathActionError} from "../../domain/pathActionError";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {FieldWarningText} from "../common/FieldWarningText";
import {OutcomeBanner} from "../common/OutcomeBanner";
import {PageSection} from "../common/PageSection";
import {PathInput} from "../common/PathInput";
import {QuickActions} from "../common/QuickActions";
import {RecoveryNotice} from "../common/RecoveryNotice";
import {RowActions} from "../common/RowActions";
import {WarningState} from "../common/WarningState";

// Fallback for onOpenOutcomeLibraries when this tab is rendered without it -- ProjectDashboardPage always
// supplies a real handler; this only keeps the prop optional for any other caller.
const noop = (): void => undefined;

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

type ModeFields = {modeName: string; librarySelector: OutcomeLibrarySelector; cost: number};

const BLANK_JSON_SELECTOR: OutcomeLibrarySelector = {kind: "json", path: ""};
const EMPTY_MODE: ModeFields = {modeName: "", librarySelector: BLANK_JSON_SELECTOR, cost: 1};

type ModeRowStatus = "empty" | "incomplete" | "valid";

function isModeValid(mode: ModeFields): boolean {
    return mode.modeName.trim().length > 0 && !isBlankStakeEngineExportLibrarySelector(mode.librarySelector) && Number.isFinite(mode.cost) && mode.cost > 0;
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
    const touched = mode.modeName.trim().length > 0 || !isBlankStakeEngineExportLibrarySelector(mode.librarySelector) || mode.cost !== EMPTY_MODE.cost;
    return touched ? "incomplete" : "empty";
}

function toModeInputs(modes: readonly ModeFields[]): StudioStakeEngineExportModeInput[] {
    return modes
        .filter((mode) => classifyModeRow(mode) === "valid")
        .map((mode) => ({modeName: mode.modeName.trim(), librarySelector: mode.librarySelector, cost: mode.cost}));
}

// Preview step's own plain-text summary of a mode's source -- never re-derives provenance, only restates
// which selector kind/location this row will read from.
function describeStakeEngineExportSourceSummary(selector: OutcomeLibrarySelector): string {
    if (selector.kind === "json") {
        return selector.path;
    }
    if (selector.kind === "bundle") {
        return `${selector.bundleDir} (mode "${selector.modeName}")`;
    }
    return `${selector.stakeDir} (mode "${selector.modeName}")`;
}

function modeFieldWarnings(mode: ModeFields): {modeName?: string; libraryPath?: string; cost?: string} {
    if (classifyModeRow(mode) !== "incomplete") {
        return {};
    }
    return {
        modeName: mode.modeName.trim().length === 0 ? "Mode name is required." : undefined,
        libraryPath: isBlankStakeEngineExportLibrarySelector(mode.librarySelector) ? "Source canonical outcome library is required." : undefined,
        cost: Number.isFinite(mode.cost) && mode.cost > 0 ? undefined : "Cost must be a positive number.",
    };
}

// A Configure row's own source field -- a registry-discovered bundle is shown read-only ("Discovered:
// <bundleDir>", with an escape hatch to hand-pick a different file instead), otherwise a plain Browse-able
// file path. Mirrors DeploymentTab's own DeploymentModeLibraryField exactly, kept as this tab's own copy
// for the same "independent, free to diverge" reason as the rest of this tab's registry helpers (see
// StakeEngineExport.ts's own doc comment).
function StakeEngineExportModeSourceField({
    selector,
    projectRoot,
    onChange,
}: {
    selector: OutcomeLibrarySelector;
    projectRoot: string | undefined;
    onChange: (selector: OutcomeLibrarySelector) => void;
}) {
    if (selector.kind === "bundle") {
        return (
            <div>
                <Text size="sm" fw={600}>
                    Source: canonical outcome library
                </Text>
                <Text size="xs" c="dimmed" mb={4}>
                    Read input only -- this export never modifies the library it reads from.
                </Text>
                <Text size="sm" style={{overflowWrap: "anywhere"}}>
                    Discovered: <code>{selector.bundleDir}</code> (mode &quot;{selector.modeName}&quot;)
                </Text>
                <Anchor component="button" type="button" size="xs" onClick={() => onChange({kind: "json", path: ""})}>
                    Choose a different file instead
                </Anchor>
            </div>
        );
    }
    return (
        <PathInput
            label="Source: canonical outcome library"
            description="Read input only -- this export never modifies the library it reads from."
            kind="file"
            browseTitle="Browse for an outcome library"
            browseId="stakeengine-export-mode-library-path"
            fileFilters={[{name: "JSON files", extensions: ["json"]}]}
            relevantDirectory={projectRoot}
            placeholder="./outcomes/base.json"
            value={selector.kind === "json" ? selector.path : ""}
            onChange={(event) => onChange({kind: "json", path: event.currentTarget.value})}
            onPathSelected={(path) => onChange({kind: "json", path})}
        />
    );
}

// One Configure-step mode row -- the status badge is the exact same classifyStakeEngineExportModeSourceStatus
// the Configure step's own gating is built from, never a second, diverging notion of "is this row's source
// OK". "Generate or pick from the Outcome Libraries hub" is only offered once there's actually a problem
// this tab can't fix on its own (no compatible library discovered yet, the discovered one has fallen
// behind the current build, or the chosen selector doesn't resolve to a readable library at all) --
// otherwise it would just be noise on every row.
function StakeEngineExportModeRow({
    mode,
    index,
    registryView,
    lastLoadError,
    projectRoot,
    canRemove,
    onModeNameChange,
    onLibrarySelectorChange,
    onCostChange,
    onRemove,
    onOpenOutcomeLibraries,
}: {
    mode: ModeFields;
    index: number;
    registryView: StudioOutcomeLibraryRegistryView | undefined;
    lastLoadError: string | undefined;
    projectRoot: string | undefined;
    canRemove: boolean;
    onModeNameChange: (modeName: string) => void;
    onLibrarySelectorChange: (selector: OutcomeLibrarySelector) => void;
    onCostChange: (cost: number) => void;
    onRemove: () => void;
    onOpenOutcomeLibraries: () => void;
}) {
    const warnings = modeFieldWarnings(mode);
    const status = classifyStakeEngineExportModeSourceStatus(mode.modeName, mode.librarySelector, registryView, lastLoadError);
    const statusInfo = describeStakeEngineExportModeSourceStatus(status);

    return (
        <Card withBorder padding="sm" mb="sm">
            <Group justify="space-between" mb="xs">
                <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
                {canRemove && <RowActions itemLabel={`mode ${index + 1}`} onRemove={onRemove} />}
            </Group>
            <Group gap="sm" wrap="wrap" align="flex-start">
                <div>
                    <TextInput label="Mode name" placeholder="base" value={mode.modeName} onChange={(event) => onModeNameChange(event.currentTarget.value)} />
                    <FieldWarningText message={warnings.modeName} />
                </div>
                <div style={{flex: 1, minWidth: 260}}>
                    <StakeEngineExportModeSourceField selector={mode.librarySelector} projectRoot={projectRoot} onChange={onLibrarySelectorChange} />
                    <FieldWarningText message={warnings.libraryPath} />
                </div>
                <div>
                    <NumberInput label="Cost" min={0} value={mode.cost} onChange={(value) => onCostChange(Number(value) || 0)} />
                    <FieldWarningText message={warnings.cost} />
                </div>
            </Group>
            {(status === "missing" || status === "wrong" || status === "invalid") && (
                <QuickActions>
                    <Button variant="default" size="xs" onClick={onOpenOutcomeLibraries}>
                        Generate or pick from the Outcome Libraries hub
                    </Button>
                </QuickActions>
            )}
        </Card>
    );
}

// Guided Configure -> Preview -> Validate diagnostics -> Export -> Review result workflow, built entirely
// on pokie's own StakeEngineExporter/StakeEngineExportValidator (see StudioStakeEngineExportService) --
// every hash/count/manifest field shown here is computed server-side, never re-derived in this UI (no
// payoutMultiplier-to-Stake-unit conversion, lookup CSV rendering, or manifest field ever happens in the
// browser). Mirrors CertificationTab's own lifecycle discipline: a monotonic requestId ref per async
// action, a double-submit guard, and an invalidate*() helper that resets state and cascades to downstream
// steps whenever an upstream input changes.
export function StakeEngineExportTab({projectRoot, onOpenOutcomeLibraries}: {projectRoot?: string; onOpenOutcomeLibraries?: () => void} = {}) {
    const fetchImpl = useStudioApi();
    const [activeStep, setActiveStep] = useState(0);

    // ---- Configure ----
    const [modes, setModes] = useState<ModeFields[]>([EMPTY_MODE]);
    const [outDir, setOutDir] = useState("stakeengine");
    const [registryView, setRegistryView] = useState<StudioOutcomeLibraryRegistryView>();

    // Fetched once per mount (see the key={projectKey} remount on project switch) -- the same Outcome
    // Libraries registry DeploymentTab already discovers a compatible library from (see
    // discoverStakeEngineExportModeLibrarySelector). A load-error here never blocks this tab -- it only
    // means a row's own source status falls back to "found"/"missing" without a "wrong build" distinction
    // and mode-name-driven auto-discovery has nothing to offer, exactly like an unregistered/never-built
    // project.
    useEffect(() => {
        let cancelled = false;
        getOutcomeLibraryRegistry(fetchImpl)
            .then((view) => {
                if (!cancelled) {
                    setRegistryView(view);
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setRegistryView({status: "load-error", error: errorMessage(error)});
                }
            });
        return () => {
            cancelled = true;
        };
    }, [fetchImpl]);

    // ---- Validate diagnostics ----
    const [validateView, setValidateView] = useState<StakeEngineExportValidateRequestView>({status: "idle"});
    const validateRequestIdRef = useRef(0);
    const validateGuard = useDoubleSubmitGuard();
    // True once a *completed* Validate response has been silently invalidated by a later Configure edit --
    // same distinction DeploymentTab's own preflightOutdated draws between "outdated" and "never run".
    // Cleared the instant a fresh Validate run starts.
    const [validateOutdated, setValidateOutdated] = useState(false);

    // ---- Export ----
    const [exportView, setExportView] = useState<StakeEngineExportRequestView>({status: "idle"});
    const exportRequestIdRef = useRef(0);
    const exportGuard = useDoubleSubmitGuard();

    // Bumps the request id and resets the *displayed* result to idle -- but deliberately never touches
    // exportGuard here. Response freshness (which result, if any, is worth showing) and write-operation
    // ownership (whether a new export is allowed to start) are two different questions: a previous Export
    // request may still be running server-side (a real, side-effecting write) at the moment the user edits
    // Configure, and ending the guard here would let a second Export fire while the first is still in
    // flight, racing two writes against each other. The guard is only ever released once the in-flight
    // request actually settles -- see runExport()'s own .then()/.catch(), which call exportGuard.end()
    // unconditionally (whether or not that settled response turns out to still be the current one).
    function invalidateExport(): void {
        exportRequestIdRef.current++;
        setExportView({status: "idle"});
    }

    function invalidateValidate(): void {
        validateRequestIdRef.current++;
        setValidateView({status: "idle"});
        setValidateOutdated(true);
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

    function handleModeFieldChange(index: number, patch: Partial<ModeFields>): void {
        handleModesChange(modes.map((mode, i) => (i === index ? {...mode, ...patch} : mode)));
    }

    // Re-discovers the latest compatible library the instant a mode name resolves to one the registry
    // already knows about -- but only for a row whose own selector is still auto-discoverable (see
    // isAutoDiscoverableStakeEngineExportLibrarySelector's own doc comment); a selector the user chose by
    // hand (Browse, or typed a path) is never silently replaced just because the mode name changed too.
    function handleModeNameChange(index: number, modeName: string): void {
        const current = modes[index];
        if (current === undefined || !isAutoDiscoverableStakeEngineExportLibrarySelector(current.librarySelector)) {
            handleModeFieldChange(index, {modeName});
            return;
        }
        const discovered = registryView !== undefined ? discoverStakeEngineExportModeLibrarySelector(modeName.trim(), registryView) : undefined;
        handleModeFieldChange(index, {modeName, librarySelector: discovered ?? BLANK_JSON_SELECTOR});
    }

    function runValidate(): void {
        const modeInputs = toModeInputs(modes);
        if (modeInputs.length === 0 || !validateGuard.begin()) {
            return;
        }
        const requestId = ++validateRequestIdRef.current;
        invalidateExport();
        setValidateOutdated(false);
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
                // The write this request represents has genuinely finished on the server either way --
                // the guard is released unconditionally, so a new Export can be started the instant this
                // settles, even if its own result is about to be discarded as stale below.
                exportGuard.end();
                if (requestId !== exportRequestIdRef.current) {
                    // Stale -- never show this result, but still re-render (a fresh object, not a no-op)
                    // so the now-freed guard is reflected immediately (e.g. the Export button's own loading
                    // state, which reads exportGuard.isBlocked() rather than exportView.status alone).
                    setExportView({status: "idle"});
                    return;
                }
                setExportView(describeStakeEngineExportResult(result));
            })
            .catch((error: unknown) => {
                exportGuard.end();
                if (requestId !== exportRequestIdRef.current) {
                    setExportView({status: "idle"});
                    return;
                }
                setExportView({status: "network-error", message: errorMessage(error)});
            });
    }

    // Whichever load-error (Validate diagnostics or Export) most recently named a specific mode -- feeds
    // classifyStakeEngineExportModeSourceStatus's own "invalid" status, the same way DeploymentModeRow's
    // own lastRunError does. Export is checked first: it's the more authoritative, later-in-the-workflow
    // run, and a fresh Validate re-run clears its own load-error (via invalidateExport()) the moment
    // Configure changes again, so the two can never disagree about a row that's since been fixed.
    let lastLoadError: string | undefined;
    if (exportView.status === "load-error") {
        lastLoadError = exportView.error;
    } else if (validateView.status === "load-error") {
        lastLoadError = validateView.error;
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
                <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />} mb="sm">
                    <Text size="sm" style={{whiteSpace: "pre-line"}}>
                        {describeStakeEngineExportDestinationNote(toModeInputs(modes).map((mode) => mode.modeName))}
                    </Text>
                </Alert>
                <QuickActions>
                    <Button onClick={runValidate} loading={validateView.status === "loading"}>
                        Run diagnostics
                    </Button>
                </QuickActions>
                {validateView.status === "network-error" && (
                    <ErrorState message={describePathActionError("The Stake Engine export's outcome library", validateView.message)} />
                )}
                {validateView.status === "load-error" && (
                    <ErrorState message={describePathActionError("The Stake Engine export's outcome library", validateView.error)} />
                )}
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
                        // Reflects exportGuard, not just exportView.status -- a Configure edit resets the
                        // *displayed* result to idle (see invalidateExport()'s own doc comment) while the
                        // previous export may still genuinely be writing on the server; the button must stay
                        // disabled/spinning through that whole window, not just while its own now-discarded
                        // result was still going to be shown.
                        loading={exportGuard.isBlocked()}
                        disabled={toModeInputs(modes).length === 0 || hasIncompleteModeRow}
                    >
                        Export to Stake Engine
                    </Button>
                </QuickActions>
                {exportView.status === "network-error" && (
                    <ErrorState message={describePathActionError("The Stake Engine export's outcome library", exportView.message)} />
                )}
                {exportView.status === "load-error" && (
                    <ErrorState message={describePathActionError("The Stake Engine export's outcome library", exportView.error)} />
                )}
                {exportView.status === "conflict" &&
                    (exportView.overwritable ? (
                        <RecoveryNotice
                            title={exportView.error}
                            message="Exporting will replace the existing directory's contents."
                            actionLabel="Overwrite"
                            actionColor="red"
                            onAction={() => runExport(true)}
                        />
                    ) : (
                        <ErrorState message={exportView.error} />
                    ))}
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
                <Stepper.Step label="Configure" description="Source, modes & output" aria-current={activeStep === 0 ? "step" : undefined} />
                <Stepper.Step
                    label="Preview"
                    description="What will be exported"
                    disabled={!previewReachable}
                    aria-current={activeStep === 1 ? "step" : undefined}
                />
                <Stepper.Step
                    label="Validate diagnostics"
                    description="Preflight & provenance"
                    disabled={!validateReachable}
                    aria-current={activeStep === 2 ? "step" : undefined}
                />
                <Stepper.Step
                    label="Export"
                    description="Write to disk"
                    disabled={!exportReachable}
                    aria-current={activeStep === 3 ? "step" : undefined}
                />
                <Stepper.Step
                    label="Review result"
                    description="Manifest & files"
                    disabled={!reviewReachable}
                    aria-current={activeStep === 4 ? "step" : undefined}
                />
            </Stepper>

            {activeStep === 0 && (
                <div>
                    <Text size="sm" fw={600} mb={4}>
                        Stake Engine export destination
                    </Text>
                    <PathInput
                        label="Output directory"
                        description="Replaced atomically as a whole on Export -- see Preview for exactly what gets written, and how overwriting an existing directory works."
                        kind="directory"
                        browseTitle="Browse for a Stake Engine export output directory"
                        browseId="stakeengine-export-out-dir"
                        relevantDirectory={projectRoot}
                        value={outDir}
                        onChange={(event) => handleOutDirChange(event.currentTarget.value)}
                        onPathSelected={handleOutDirChange}
                        mb="sm"
                    />
                    {validateOutdated && (
                        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} mb="sm">
                            Outdated -- the modes changed since the last Validate run. Its result no longer
                            reflects what&apos;s configured here; rerun Validate before Export is offered again.
                        </Alert>
                    )}
                    <Text size="sm" fw={600} mb={4}>
                        Modes to export
                    </Text>
                    {modes.map((mode, index) => (
                        <StakeEngineExportModeRow
                            key={index}
                            mode={mode}
                            index={index}
                            registryView={registryView}
                            lastLoadError={lastLoadError}
                            projectRoot={projectRoot}
                            canRemove={modes.length > 1}
                            onModeNameChange={(modeName) => handleModeNameChange(index, modeName)}
                            onLibrarySelectorChange={(selector) => handleModeFieldChange(index, {librarySelector: selector})}
                            onCostChange={(cost) => handleModeFieldChange(index, {cost})}
                            onRemove={() => handleModesChange(modes.filter((_, i) => i !== index))}
                            onOpenOutcomeLibraries={onOpenOutcomeLibraries ?? noop}
                        />
                    ))}
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
                            <Text size="sm" style={{whiteSpace: "pre-line"}}>
                                {describeStakeEngineExportDestinationNote(toModeInputs(modes).map((mode) => mode.modeName))}
                                {"\n\nNothing here is written yet -- Preview never touches disk."}
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
                                            <Table.Th>Source canonical outcome library</Table.Th>
                                            <Table.Th>Cost</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {toModeInputs(modes).map((mode) => (
                                            <Table.Tr key={mode.modeName}>
                                                <Table.Td>{mode.modeName}</Table.Td>
                                                <Table.Td style={{overflowWrap: "anywhere"}}>{describeStakeEngineExportSourceSummary(mode.librarySelector)}</Table.Td>
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
