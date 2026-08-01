import {Alert, Badge, Button, Checkbox, Group, NumberInput, SegmentedControl, Stepper, Table, Text, TextInput} from "@mantine/core";
import {IconAlertTriangle, IconCircleCheck} from "@tabler/icons-react";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {
    compareOutcomeLibraries,
    estimateOutcomeLibraryGeneration,
    generateOutcomeLibrary,
    getOutcomeLibraryRegistry,
    selectOutcomeLibrary,
    validateOutcomeLibraryDeep,
    type OutcomeLibraryGenerateRequestOptions,
} from "../../api/apiClient";
import type {OutcomeLibrarySelector} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {
    describeOutcomeLibraryCompareResult,
    describeOutcomeLibraryDeepValidateResult,
    describeOutcomeLibraryEstimateSummary,
    describeOutcomeLibraryGenerateEstimateResult,
    describeOutcomeLibraryGenerateResult,
    describeOutcomeLibraryGenerateSummary,
    describeOutcomeLibraryOutcome,
    describeOutcomeLibraryProvenanceSummary,
    describeOutcomeLibraryRegistryBuildStatus,
    describeOutcomeLibraryRegistryResult,
    describeOutcomeLibrarySelectResult,
    type OutcomeLibraryCompareRequestView,
    type OutcomeLibraryDeepValidateRequestView,
    type OutcomeLibraryGenerateEstimateRequestView,
    type OutcomeLibraryGenerateRequestView,
    type OutcomeLibraryOutcome,
    type OutcomeLibraryRegistryRequestView,
    type OutcomeLibrarySelectRequestView,
} from "../../domain/interpret/OutcomeLibraries";
import {describeOutcomeLibraryGenerationErrorExplanation, OUTCOME_LIBRARY_UNSUPPORTED_EXPLANATION} from "../../domain/outcomeLibraryGenerateError";
import {describePathActionError} from "../../domain/pathActionError";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {OutcomeBanner} from "../common/OutcomeBanner";
import {PageSection} from "../common/PageSection";
import {PathInput} from "../common/PathInput";
import {QuickActions} from "../common/QuickActions";
import {RecoveryNotice} from "../common/RecoveryNotice";

// Mirrors StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR -- the conventional bundle directory
// Generate itself writes to (and the Registry panel reads from) when no output directory is given.
const StudioOutcomeLibraryDefaultBundleDir = "outcomelibrary";

const OUTCOME_BANNER: Record<OutcomeLibraryOutcome, {color: string; icon: ReactNode; title: string}> = {
    success: {color: "green", icon: <IconCircleCheck size={16} />, title: "Loaded successfully"},
    partial: {color: "blue", icon: <IconAlertTriangle size={16} />, title: "Loaded with warnings"},
    invalid: {color: "red", icon: <IconAlertTriangle size={16} />, title: "This library is invalid"},
};

type SelectorFields = {kind: OutcomeLibrarySelector["kind"]; path: string; bundleDir: string; modeName: string; stakeDir: string};

const EMPTY_SELECTOR_FIELDS: SelectorFields = {kind: "json", path: "", bundleDir: "", modeName: "", stakeDir: ""};

function buildSelector(fields: SelectorFields): OutcomeLibrarySelector | undefined {
    if (fields.kind === "json") {
        return fields.path.trim().length > 0 ? {kind: "json", path: fields.path.trim()} : undefined;
    }
    if (fields.kind === "bundle") {
        return fields.bundleDir.trim().length > 0 && fields.modeName.trim().length > 0
            ? {kind: "bundle", bundleDir: fields.bundleDir.trim(), modeName: fields.modeName.trim()}
            : undefined;
    }
    return fields.stakeDir.trim().length > 0 && fields.modeName.trim().length > 0
        ? {kind: "stakeengine", stakeDir: fields.stakeDir.trim(), modeName: fields.modeName.trim()}
        : undefined;
}

function SelectorFieldsInput({
    fields,
    onChange,
    idPrefix,
    relevantDirectory,
}: {
    fields: SelectorFields;
    onChange: (fields: SelectorFields) => void;
    idPrefix: string;
    relevantDirectory?: string;
}) {
    const browseIdSuffix = idPrefix.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return (
        <div>
            <SegmentedControl
                value={fields.kind}
                onChange={(value) => onChange({...fields, kind: value as SelectorFields["kind"]})}
                data={[
                    {label: "JSON file", value: "json"},
                    {label: "Bundle", value: "bundle"},
                    {label: "Stake Engine export", value: "stakeengine"},
                ]}
                mb="sm"
                aria-label={`${idPrefix} library source`}
            />
            {fields.kind === "json" && (
                <PathInput
                    label="Library JSON path"
                    placeholder="./outcomes/base.json"
                    kind="file"
                    browseTitle="Browse for a library JSON file"
                    browseId={`outcome-library-${browseIdSuffix}-json-path`}
                    fileFilters={[{name: "JSON files", extensions: ["json"]}]}
                    relevantDirectory={relevantDirectory}
                    value={fields.path}
                    onChange={(event) => onChange({...fields, path: event.currentTarget.value})}
                    onPathSelected={(path) => onChange({...fields, path})}
                />
            )}
            {fields.kind === "bundle" && (
                <Group gap="sm" wrap="wrap">
                    <PathInput
                        label="Bundle directory"
                        placeholder="./outcomes/bundle"
                        kind="directory"
                        browseTitle="Browse for a bundle directory"
                        browseId={`outcome-library-${browseIdSuffix}-bundle-dir`}
                        relevantDirectory={relevantDirectory}
                        value={fields.bundleDir}
                        onChange={(event) => onChange({...fields, bundleDir: event.currentTarget.value})}
                        onPathSelected={(bundleDir) => onChange({...fields, bundleDir})}
                    />
                    <TextInput
                        label="Mode name"
                        placeholder="base"
                        value={fields.modeName}
                        onChange={(event) => onChange({...fields, modeName: event.currentTarget.value})}
                    />
                </Group>
            )}
            {fields.kind === "stakeengine" && (
                <Group gap="sm" wrap="wrap">
                    <PathInput
                        label="Stake Engine export directory"
                        placeholder="./stake-export"
                        kind="directory"
                        browseTitle="Browse for a Stake Engine export directory"
                        browseId={`outcome-library-${browseIdSuffix}-stake-dir`}
                        relevantDirectory={relevantDirectory}
                        value={fields.stakeDir}
                        onChange={(event) => onChange({...fields, stakeDir: event.currentTarget.value})}
                        onPathSelected={(stakeDir) => onChange({...fields, stakeDir})}
                    />
                    <TextInput
                        label="Mode name"
                        placeholder="base"
                        value={fields.modeName}
                        onChange={(event) => onChange({...fields, modeName: event.currentTarget.value})}
                    />
                </Group>
            )}
        </div>
    );
}

// Guided Select/import -> Validate & analyze -> Inspect distribution/features -> Compare or use workflow,
// built entirely on pokie's own WeightedOutcomeLibrary/OutcomeLibraryBundle/StakeEngine services (see
// StudioOutcomeLibraryService) -- RTP/hit rate/volatility/payout distribution/max win/feature breakdown/
// diff are all computed server-side by WeightedOutcomeLibraryAnalyzer/
// computeWeightedOutcomeLibraryFeatureBreakdown/WeightedOutcomeLibraryAnalysisDiffer, never re-derived
// here. Mirrors ParSheetImportExportPanel's own lifecycle discipline: a monotonic requestId ref per async
// action, an invalidate*() helper that bumps the ref/resets state/releases its own double-submit guard
// immediately (so a superseded request never blocks a fresh one nor applies its late response), and
// "Continue" only ever shown after a genuinely successful step.
export function OutcomeLibrariesTab({
    onUseInRuntime,
    onNavigateToTab,
    projectRoot,
}: {
    onUseInRuntime: (selector: OutcomeLibrarySelector, expectedHash: string) => void;
    // Deploy/Stake export actions on a freshly generated library hand off to those tabs' own workflows
    // rather than duplicating them here -- same "one real workflow, not a second" discipline as
    // onUseInRuntime handing off to the Runtime tab.
    onNavigateToTab?: (tab: "deployment" | "stakeEngineExport") => void;
    projectRoot?: string;
}) {
    const fetchImpl = useStudioApi();
    const [activeStep, setActiveStep] = useState(0);

    // ---- Registry ----
    const [registryView, setRegistryView] = useState<OutcomeLibraryRegistryRequestView>({status: "idle"});
    const registryRequestIdRef = useRef(0);

    function fetchRegistry(): void {
        const requestId = ++registryRequestIdRef.current;
        setRegistryView({status: "loading"});
        getOutcomeLibraryRegistry(fetchImpl)
            .then((result) => {
                if (requestId !== registryRequestIdRef.current) {
                    return;
                }
                setRegistryView(describeOutcomeLibraryRegistryResult(result));
            })
            .catch((error: unknown) => {
                if (requestId !== registryRequestIdRef.current) {
                    return;
                }
                setRegistryView({status: "error", message: errorMessage(error)});
            });
    }

    // Fetched once per mount (the same "forces a full remount on a genuine project switch" key the
    // parent already gives this component -- see ProjectDashboardPage's own doc comment on this tab's
    // `key`), not re-polled -- a fresh answer is always one click of "Refresh" away, and a completed
    // Generate run already refreshes it itself (see runGenerate).
    useEffect(() => {
        fetchRegistry();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---- Generate ----
    const [generateMode, setGenerateMode] = useState("");
    const [generateStake, setGenerateStake] = useState<number | "">("");
    const [generateConfigHash, setGenerateConfigHash] = useState("");
    const [generateLibraryId, setGenerateLibraryId] = useState("");
    const [generateOutDir, setGenerateOutDir] = useState("");
    const [generateMaxOutcomeSpaceSize, setGenerateMaxOutcomeSpaceSize] = useState("");
    const [generateBounded, setGenerateBounded] = useState(false);
    const [generateSampleSize, setGenerateSampleSize] = useState("");
    const [generateSeed, setGenerateSeed] = useState("");
    const [estimateView, setEstimateView] = useState<OutcomeLibraryGenerateEstimateRequestView>({status: "idle"});
    const estimateRequestIdRef = useRef(0);
    const estimateGuard = useDoubleSubmitGuard();
    const [generateView, setGenerateView] = useState<OutcomeLibraryGenerateRequestView>({status: "idle"});
    const generateRequestIdRef = useRef(0);
    const generateGuard = useDoubleSubmitGuard();

    function buildGenerateOptions(): OutcomeLibraryGenerateRequestOptions {
        return {
            ...(generateMode.trim().length > 0 ? {mode: generateMode.trim()} : {}),
            ...(generateStake !== "" ? {stake: generateStake} : {}),
            ...(generateConfigHash.trim().length > 0 ? {configHash: generateConfigHash.trim()} : {}),
            ...(generateLibraryId.trim().length > 0 ? {libraryId: generateLibraryId.trim()} : {}),
            ...(generateMaxOutcomeSpaceSize.trim().length > 0 ? {maxOutcomeSpaceSize: generateMaxOutcomeSpaceSize.trim()} : {}),
            ...(generateBounded ? {bounded: {sampleSize: generateSampleSize.trim(), seed: generateSeed.trim()}} : {}),
            ...(generateOutDir.trim().length > 0 ? {outDir: generateOutDir.trim()} : {}),
        };
    }

    function runEstimate(): void {
        if (!estimateGuard.begin()) {
            return;
        }
        const requestId = ++estimateRequestIdRef.current;
        setEstimateView({status: "loading"});
        estimateOutcomeLibraryGeneration(fetchImpl, generateMode.trim().length > 0 ? generateMode.trim() : undefined, generateMaxOutcomeSpaceSize.trim().length > 0 ? generateMaxOutcomeSpaceSize.trim() : undefined)
            .then((result) => {
                if (requestId !== estimateRequestIdRef.current) {
                    return;
                }
                estimateGuard.end();
                setEstimateView(describeOutcomeLibraryGenerateEstimateResult(result));
            })
            .catch((error: unknown) => {
                if (requestId !== estimateRequestIdRef.current) {
                    return;
                }
                estimateGuard.end();
                setEstimateView({status: "error", message: errorMessage(error)});
            });
    }

    // A successful generate() both invalidates the Registry's own stale answer (this build now has a
    // fresher library than what fetchRegistry last reported) and, since the writer already validated the
    // bundle it just wrote, immediately loads it through the exact same select() path Select/import uses
    // -- so the result step's own "Inspect"/"Validate & analyze" actions land on already-populated,
    // already-analyzed state instead of asking the user to re-enter the selector they just generated.
    function runGenerate(): void {
        if (!generateGuard.begin()) {
            return;
        }
        const requestId = ++generateRequestIdRef.current;
        setGenerateView({status: "loading"});
        generateOutcomeLibrary(fetchImpl, buildGenerateOptions())
            .then((result) => {
                if (requestId !== generateRequestIdRef.current) {
                    return;
                }
                generateGuard.end();
                setGenerateView(describeOutcomeLibraryGenerateResult(result));
                if (result.status === "ok") {
                    fetchRegistry();
                    setFields({kind: "bundle", bundleDir: result.bundleDir, modeName: result.mode.modeName, path: "", stakeDir: ""});
                }
            })
            .catch((error: unknown) => {
                if (requestId !== generateRequestIdRef.current) {
                    return;
                }
                generateGuard.end();
                setGenerateView({status: "error", message: errorMessage(error)});
            });
    }

    // ---- Select/import ----
    const [fields, setFields] = useState<SelectorFields>(EMPTY_SELECTOR_FIELDS);
    const [selectView, setSelectView] = useState<OutcomeLibrarySelectRequestView>({status: "idle"});
    const selectRequestIdRef = useRef(0);
    const selectGuard = useDoubleSubmitGuard();
    // True once a *completed* Select/import response has been silently invalidated by a later field edit
    // -- same distinction DeploymentTab's own preflightOutdated draws between "outdated" and "never
    // selected". Cleared the instant a fresh Load-library run starts.
    const [selectOutdated, setSelectOutdated] = useState(false);

    // ---- Validate & analyze (deep, bundle-only) ----
    const [deepValidateView, setDeepValidateView] = useState<OutcomeLibraryDeepValidateRequestView>({status: "idle"});
    const deepValidateRequestIdRef = useRef(0);
    const deepValidateGuard = useDoubleSubmitGuard();

    // ---- Compare ----
    const [rightFields, setRightFields] = useState<SelectorFields>(EMPTY_SELECTOR_FIELDS);
    const [compareView, setCompareView] = useState<OutcomeLibraryCompareRequestView>({status: "idle"});
    const compareRequestIdRef = useRef(0);
    const compareGuard = useDoubleSubmitGuard();
    // Same "outdated" distinction as selectOutdated above, for a completed Compare silently invalidated by
    // a later right-side (comparison) selector edit -- selectOutdated alone can't cover this, since editing
    // rightFields never touches Select/import at all, only Compare. Cleared the instant a fresh Compare run
    // starts.
    const [compareOutdated, setCompareOutdated] = useState(false);

    function invalidateDeepValidate(): void {
        deepValidateRequestIdRef.current++;
        setDeepValidateView({status: "idle"});
        deepValidateGuard.end();
    }

    function invalidateCompare(): void {
        compareRequestIdRef.current++;
        const wasSettled = !("status" in compareView) || (compareView.status !== "idle" && compareView.status !== "loading");
        if (wasSettled) {
            setCompareOutdated(true);
        }
        setCompareView({status: "idle"});
        compareGuard.end();
    }

    // Any change to the selected library invalidates the old/pending select response, and everything
    // downstream that described *that* library (a deep-validate run, a comparison).
    function invalidateSelect(): void {
        selectRequestIdRef.current++;
        if (selectView.status !== "idle" && selectView.status !== "loading") {
            setSelectOutdated(true);
        }
        setSelectView({status: "idle"});
        selectGuard.end();
        invalidateDeepValidate();
        invalidateCompare();
    }

    function handleFieldsChange(next: SelectorFields): void {
        setFields(next);
        if (selectView.status !== "idle") {
            invalidateSelect();
        }
    }

    function handleRightFieldsChange(next: SelectorFields): void {
        setRightFields(next);
        const isIdle = "status" in compareView && compareView.status === "idle";
        if (!isIdle) {
            invalidateCompare();
        }
    }

    // `targetStep` lets a caller that already knows the selector is good (Generate's own "Inspect"/
    // "Validate & analyze" result actions -- see runGenerate) jump straight past Select/import to
    // wherever it actually wants to land, rather than always landing on Validate & analyze (step 2).
    function runSelect(targetStep = 2): void {
        const selector = buildSelector(fields);
        if (selector === undefined || !selectGuard.begin()) {
            return;
        }
        const requestId = ++selectRequestIdRef.current;
        invalidateDeepValidate();
        invalidateCompare();
        setSelectOutdated(false);
        setSelectView({status: "loading"});
        selectOutcomeLibrary(fetchImpl, selector)
            .then((result) => {
                if (requestId !== selectRequestIdRef.current) {
                    return;
                }
                selectGuard.end();
                setSelectView(describeOutcomeLibrarySelectResult(result));
                // Advance whenever the request reached a diagnosable result -- an "invalid" library still
                // has errors/warnings worth showing on Validate & analyze, only "error"/"load-error"
                // (a request-level failure) should keep the user on Select/import to retry.
                if (result.status === "ok" || result.status === "invalid") {
                    setActiveStep(result.status === "ok" ? targetStep : 2);
                }
            })
            .catch((error: unknown) => {
                if (requestId !== selectRequestIdRef.current) {
                    return;
                }
                selectGuard.end();
                setSelectView({status: "error", message: errorMessage(error)});
            });
    }

    function runDeepValidate(): void {
        if (fields.kind !== "bundle" || !deepValidateGuard.begin()) {
            return;
        }
        const requestId = ++deepValidateRequestIdRef.current;
        setDeepValidateView({status: "loading"});
        validateOutcomeLibraryDeep(fetchImpl, fields.bundleDir.trim(), fields.modeName.trim())
            .then((result) => {
                if (requestId !== deepValidateRequestIdRef.current) {
                    return;
                }
                deepValidateGuard.end();
                setDeepValidateView(describeOutcomeLibraryDeepValidateResult(result));
            })
            .catch((error: unknown) => {
                if (requestId !== deepValidateRequestIdRef.current) {
                    return;
                }
                deepValidateGuard.end();
                setDeepValidateView({status: "error", message: errorMessage(error)});
            });
    }

    function runCompare(): void {
        const leftSelector = buildSelector(fields);
        const rightSelector = buildSelector(rightFields);
        if (leftSelector === undefined || rightSelector === undefined || !compareGuard.begin()) {
            return;
        }
        const requestId = ++compareRequestIdRef.current;
        setCompareOutdated(false);
        setCompareView({status: "loading"});
        // Ties the comparison to the exact left library the Inspect step already showed the user --
        // see StudioOutcomeLibraryCompareView.leftSnapshotStale's own doc comment.
        compareOutcomeLibraries(fetchImpl, leftSelector, rightSelector, selectResult?.provenance.hash)
            .then((result) => {
                if (requestId !== compareRequestIdRef.current) {
                    return;
                }
                compareGuard.end();
                setCompareView(describeOutcomeLibraryCompareResult(result));
            })
            .catch((error: unknown) => {
                if (requestId !== compareRequestIdRef.current) {
                    return;
                }
                compareGuard.end();
                setCompareView({status: "error", message: errorMessage(error)});
            });
    }

    const selectResult = selectView.status === "ok" ? selectView : undefined;
    // "invalid" also carries errors/warnings (just no analysis/breakdown/sample) -- the outcome
    // classification must cover it too, not just the "ok" case, or an invalid library would render
    // nothing at all on this step.
    const selectOutcome = selectView.status === "ok" || selectView.status === "invalid" ? describeOutcomeLibraryOutcome(selectView) : undefined;
    const analyzeReachable = selectView.status !== "idle" && selectView.status !== "loading";
    const inspectReachable = selectResult !== undefined;
    const compareResult = "left" in compareView ? compareView : undefined;

    function renderAnalyzeStep(): ReactNode {
        if (!analyzeReachable) {
            return <EmptyState message="Select/import a library first." />;
        }
        if (selectView.status === "load-error") {
            return <ErrorState message={describePathActionError("The outcome library", selectView.error)} />;
        }
        if (selectView.status === "error") {
            return <ErrorState message={describePathActionError("The outcome library", selectView.message)} />;
        }
        if (selectOutcome === undefined) {
            return null;
        }

        return (
            <div>
                <OutcomeBanner
                    color={OUTCOME_BANNER[selectOutcome].color}
                    icon={OUTCOME_BANNER[selectOutcome].icon}
                    title={OUTCOME_BANNER[selectOutcome].title}
                    errors={selectView.errors}
                    warnings={selectView.warnings}
                />

                {selectResult && (
                    <PageSection legend="Provenance">
                        <Text size="sm">{describeOutcomeLibraryProvenanceSummary(selectResult.provenance)}</Text>
                    </PageSection>
                )}

                {fields.kind === "bundle" && selectOutcome !== "invalid" && (
                    <PageSection legend="Deep validation (bundle)">
                        <Text size="sm" c="dimmed" mb="sm">
                            Streams every outcome, re-verifies per-record hashes, and recomputes this mode&apos;s
                            hash/analysis against the manifest — opt-in since it can be slow on a large bundle.
                        </Text>
                        <QuickActions>
                            <Button onClick={runDeepValidate} loading={deepValidateView.status === "loading"} variant="default">
                                Run deep validation
                            </Button>
                        </QuickActions>
                        {deepValidateView.status === "error" && (
                            <ErrorState message={describePathActionError("The outcome library bundle", deepValidateView.message)} />
                        )}
                        {deepValidateView.status === "load-error" && (
                            <ErrorState message={describePathActionError("The outcome library bundle", deepValidateView.error)} />
                        )}
                        {deepValidateView.status === "ok" && (
                            <div>
                                <IssueList title="Errors" issues={deepValidateView.errors} />
                                <IssueList title="Warnings" issues={deepValidateView.warnings} />
                                {deepValidateView.errors.length === 0 && deepValidateView.warnings.length === 0 && (
                                    <Text size="sm" c="dimmed">
                                        Deep validation found no issues.
                                    </Text>
                                )}
                            </div>
                        )}
                    </PageSection>
                )}

                {selectOutcome !== "invalid" && (
                    <QuickActions>
                        <Button onClick={() => setActiveStep(3)}>Continue to Inspect</Button>
                    </QuickActions>
                )}
            </div>
        );
    }

    const registryResult = registryView.status === "ok" ? registryView : undefined;

    function renderRegistryPanel(): ReactNode {
        return (
            <PageSection legend="Registry">
                <Text size="sm" c="dimmed" mb="sm">
                    Whether a compatible outcome library already exists for this project&apos;s own current
                    build (the currently open, loadable package) — discovered from the conventional{" "}
                    <code>{StudioOutcomeLibraryDefaultBundleDir}</code> bundle Generate writes to by default,
                    or any other output directory a Generate run in this session was pointed at, never a
                    static blueprint JSON.
                </Text>
                <QuickActions>
                    <Button onClick={fetchRegistry} loading={registryView.status === "loading"} variant="default">
                        Refresh
                    </Button>
                </QuickActions>
                {registryView.status === "error" && <ErrorState message={describePathActionError("The outcome library registry", registryView.message)} />}
                {registryView.status === "load-error" && <ErrorState message={describePathActionError("The outcome library registry", registryView.error)} />}
                {registryResult && (
                    <div>
                        <Group gap="xs" mb="sm">
                            <Badge color={describeOutcomeLibraryRegistryBuildStatus(registryResult.buildStatus).color}>
                                {describeOutcomeLibraryRegistryBuildStatus(registryResult.buildStatus).label}
                            </Badge>
                            {describeOutcomeLibraryRegistryBuildStatus(registryResult.buildStatus).action !== "none" && (
                                <Button size="xs" variant="light" onClick={() => setActiveStep(0)}>
                                    {describeOutcomeLibraryRegistryBuildStatus(registryResult.buildStatus).action === "build" ? "Build" : "Rebuild"}
                                </Button>
                            )}
                        </Group>
                        {registryResult.buildStatus !== "missing" && (
                            <Table withRowBorders={false}>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Mode</Table.Th>
                                        <Table.Th>Location</Table.Th>
                                        <Table.Th>Outcomes</Table.Th>
                                        <Table.Th>RTP</Table.Th>
                                        <Table.Th>Generated</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {registryResult.modes.map((mode) => (
                                        <Table.Tr key={mode.modeName}>
                                            <Table.Th style={{overflowWrap: "anywhere"}}>{mode.modeName}</Table.Th>
                                            <Table.Td style={{overflowWrap: "anywhere"}}>{mode.bundleDir}</Table.Td>
                                            <Table.Td>{mode.outcomeCount.toLocaleString()}</Table.Td>
                                            <Table.Td>{(mode.rtp * 100).toFixed(2)}%</Table.Td>
                                            <Table.Td>{mode.generatedAt ?? "—"}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        )}
                    </div>
                )}
            </PageSection>
        );
    }

    function renderGenerateStep(): ReactNode {
        const estimateResult = estimateView.status === "ok" ? estimateView : undefined;
        const generateResult = generateView.status === "ok" ? generateView : undefined;

        return (
            <div>
                <Text size="sm" c="dimmed" mb="sm">
                    Generates a real WeightedOutcomeLibrary by actually running this project&apos;s own
                    currently built package (drives the same session/win-calculation runtime a live round
                    uses) — it is never a static blueprint JSON, and never a second, independently-derived
                    calculation.
                </Text>

                <PageSection legend="Mode/settings/seed">
                    <Group gap="sm" wrap="wrap" mb="sm">
                        <TextInput label="Mode" placeholder="base" value={generateMode} onChange={(event) => setGenerateMode(event.currentTarget.value)} />
                        <NumberInput label="Stake" placeholder="1" value={generateStake} onChange={(value) => setGenerateStake(typeof value === "number" ? value : "")} />
                        <TextInput label="Library id" placeholder="(derived from the game id and mode)" value={generateLibraryId} onChange={(event) => setGenerateLibraryId(event.currentTarget.value)} />
                        <TextInput label="Config hash" placeholder="(optional)" value={generateConfigHash} onChange={(event) => setGenerateConfigHash(event.currentTarget.value)} />
                    </Group>
                    <Group gap="sm" wrap="wrap" mb="sm">
                        <TextInput
                            label="Max outcome space size"
                            placeholder="(defaults to the generator's own exact-sweep limit)"
                            value={generateMaxOutcomeSpaceSize}
                            onChange={(event) => setGenerateMaxOutcomeSpaceSize(event.currentTarget.value.replace(/[^0-9]/g, ""))}
                        />
                        <Checkbox
                            label="Bounded coverage (required once the space exceeds the max above)"
                            checked={generateBounded}
                            onChange={(event) => setGenerateBounded(event.currentTarget.checked)}
                            mt={24}
                        />
                    </Group>
                    {generateBounded && (
                        <Group gap="sm" wrap="wrap" mb="sm">
                            <TextInput label="Sample size" placeholder="1000000" value={generateSampleSize} onChange={(event) => setGenerateSampleSize(event.currentTarget.value.replace(/[^0-9]/g, ""))} />
                            <TextInput label="Seed" placeholder="a deterministic seed string" value={generateSeed} onChange={(event) => setGenerateSeed(event.currentTarget.value)} />
                        </Group>
                    )}
                    <PathInput
                        label="Output bundle directory"
                        placeholder={StudioOutcomeLibraryDefaultBundleDir}
                        kind="directory"
                        browseTitle="Browse for an output bundle directory"
                        browseId="outcome-library-generate-out-dir"
                        relevantDirectory={projectRoot}
                        autoDestinationPath={StudioOutcomeLibraryDefaultBundleDir}
                        value={generateOutDir}
                        onChange={(event) => setGenerateOutDir(event.currentTarget.value)}
                        onPathSelected={setGenerateOutDir}
                    />
                </PageSection>

                <PageSection legend="Estimate/cost">
                    <QuickActions>
                        <Button onClick={runEstimate} loading={estimateView.status === "loading"} variant="default">
                            Estimate
                        </Button>
                    </QuickActions>
                    {estimateView.status === "error" && <ErrorState message={describePathActionError("The outcome space estimate", estimateView.message)} />}
                    {estimateView.status === "load-error" && <ErrorState message={describePathActionError("The outcome space estimate", estimateView.error)} />}
                    {estimateView.status === "unsupported" && (
                        <Alert color="red" variant="light" role="alert" title="Can't estimate this game's outcome space" mb="sm" style={{overflowWrap: "anywhere"}}>
                            <Text size="sm" mb="xs">
                                {OUTCOME_LIBRARY_UNSUPPORTED_EXPLANATION}
                            </Text>
                            <AdvancedDisclosure detail="server message">
                                <Text size="sm">{estimateView.error}</Text>
                            </AdvancedDisclosure>
                        </Alert>
                    )}
                    {estimateResult && (
                        <Alert color={estimateResult.requiresBounded ? "yellow" : "blue"} icon={<IconAlertTriangle size={16} />} mt="sm">
                            {describeOutcomeLibraryEstimateSummary(estimateResult)}
                        </Alert>
                    )}
                </PageSection>

                <QuickActions>
                    <Button onClick={runGenerate} loading={generateView.status === "loading"}>
                        Generate
                    </Button>
                </QuickActions>
                {generateView.status === "error" && <ErrorState message={describePathActionError("The outcome library generation", generateView.message)} />}
                {generateView.status === "load-error" && <ErrorState message={describePathActionError("The outcome library generation", generateView.error)} />}
                {generateView.status === "unsupported" && (
                    <Alert color="red" variant="light" role="alert" title="Can't generate this outcome library" mb="sm" style={{overflowWrap: "anywhere"}}>
                        <Text size="sm" mb="xs">
                            {OUTCOME_LIBRARY_UNSUPPORTED_EXPLANATION}
                        </Text>
                        <AdvancedDisclosure detail="server message">
                            <Text size="sm">{generateView.error}</Text>
                        </AdvancedDisclosure>
                    </Alert>
                )}
                {generateView.status === "generation-error" && (
                    <Alert color="red" variant="light" role="alert" title="Outcome library generation failed" mb="sm" style={{overflowWrap: "anywhere"}}>
                        <Text size="sm" mb="xs">
                            {describeOutcomeLibraryGenerationErrorExplanation(generateView.code)}
                        </Text>
                        <AdvancedDisclosure detail="server message">
                            <Text size="sm">
                                {generateView.code}: {generateView.error}
                            </Text>
                        </AdvancedDisclosure>
                    </Alert>
                )}
                {generateView.status === "invalid" && (
                    <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} title="The generated library failed to write" mt="sm">
                        <IssueList title="Errors" issues={generateView.errors} />
                        <IssueList title="Warnings" issues={generateView.warnings} />
                    </Alert>
                )}

                {generateResult && (
                    <PageSection legend="Result">
                        <Alert color="green" icon={<IconCircleCheck size={16} />} mb="sm">
                            {describeOutcomeLibraryGenerateSummary(generateResult)}
                        </Alert>
                        <Table withRowBorders={false} mb="sm">
                            <Table.Tbody>
                                <Table.Tr>
                                    <Table.Th>Path</Table.Th>
                                    <Table.Td style={{overflowWrap: "anywhere"}}>{generateResult.bundleDir}</Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Files</Table.Th>
                                    <Table.Td style={{overflowWrap: "anywhere"}}>{generateResult.files.join(", ")}</Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Hash</Table.Th>
                                    <Table.Td style={{overflowWrap: "anywhere"}}>{generateResult.mode.hash}</Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Generator</Table.Th>
                                    <Table.Td>
                                        {generateResult.generator.algorithm} ({generateResult.generator.strategy}), pokie v{generateResult.generator.pokieVersion}
                                    </Table.Td>
                                </Table.Tr>
                                {generateResult.generator.seed !== undefined && (
                                    <Table.Tr>
                                        <Table.Th>Seed</Table.Th>
                                        <Table.Td style={{overflowWrap: "anywhere"}}>{generateResult.generator.seed}</Table.Td>
                                    </Table.Tr>
                                )}
                                <Table.Tr>
                                    <Table.Th>Count</Table.Th>
                                    <Table.Td>{generateResult.mode.outcomeCount.toLocaleString()}</Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Total weight</Table.Th>
                                    <Table.Td>{generateResult.mode.totalWeight.toLocaleString()}</Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>RTP</Table.Th>
                                    <Table.Td>{(generateResult.mode.rtp * 100).toFixed(2)}%</Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Coverage</Table.Th>
                                    <Table.Td>{(generateResult.coverage * 100).toFixed(4)}%</Table.Td>
                                </Table.Tr>
                            </Table.Tbody>
                        </Table>
                        {generateResult.warnings.length > 0 && <IssueList title="Warnings" issues={generateResult.warnings} />}
                        <QuickActions>
                            <Button variant="default" onClick={() => runSelect(3)}>
                                Inspect
                            </Button>
                            <Button variant="default" onClick={() => runSelect(2)}>
                                Validate/analyze
                            </Button>
                            <Button variant="default" onClick={() => onNavigateToTab?.("deployment")} disabled={onNavigateToTab === undefined}>
                                Deploy
                            </Button>
                            <Button variant="default" onClick={() => onNavigateToTab?.("stakeEngineExport")} disabled={onNavigateToTab === undefined}>
                                Stake export
                            </Button>
                            <Button onClick={() => onUseInRuntime(generateResult.selector, generateResult.mode.hash)}>Serve pre-generated outcomes</Button>
                        </QuickActions>
                    </PageSection>
                )}
            </div>
        );
    }

    return (
        <PageSection legend="Outcome Libraries">
            <Text size="sm" c="dimmed" mb="sm">
                POKIE&apos;s canonical outcome-library hub: generate a library straight from this project&apos;s
                own current build, or load a POKIE outcome library (or a supported external export) purely
                in memory, validate and analyze it, inspect its distribution and feature breakdown, and
                compare it against another library — everything shown here is computed by pokie&apos;s own
                WeightedOutcomeLibrary services, never re-derived in this UI.
            </Text>

            {renderRegistryPanel()}

            <Stepper active={activeStep} onStepClick={setActiveStep} mb="md" size="sm">
                <Stepper.Step label="Generate" description="From the current build" aria-current={activeStep === 0 ? "step" : undefined} />
                <Stepper.Step label="Select/import" description="Choose a library" aria-current={activeStep === 1 ? "step" : undefined} />
                <Stepper.Step
                    label="Validate & analyze"
                    description="Diagnostics"
                    disabled={!analyzeReachable}
                    aria-current={activeStep === 2 ? "step" : undefined}
                />
                <Stepper.Step
                    label="Inspect"
                    description="Distribution & features"
                    disabled={!inspectReachable}
                    aria-current={activeStep === 3 ? "step" : undefined}
                />
                <Stepper.Step
                    label="Compare or use"
                    description="Diff & hand-off"
                    disabled={!inspectReachable}
                    aria-current={activeStep === 4 ? "step" : undefined}
                />
            </Stepper>

            {activeStep === 0 && renderGenerateStep()}

            {activeStep === 1 && (
                <div>
                    {selectOutdated && (
                        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} mb="sm">
                            Outdated -- the selector changed since the last Load library run. Its result (and
                            any Validate & analyze/Compare built from it) no longer reflects what&apos;s
                            configured here; reload the library before continuing.
                        </Alert>
                    )}
                    <SelectorFieldsInput fields={fields} onChange={handleFieldsChange} idPrefix="Library" relevantDirectory={projectRoot} />
                    <QuickActions>
                        <Button onClick={() => runSelect()} loading={selectView.status === "loading"} disabled={buildSelector(fields) === undefined}>
                            Load library
                        </Button>
                    </QuickActions>
                    {selectView.status === "error" && <ErrorState message={describePathActionError("The outcome library", selectView.message)} />}
                    {selectView.status === "load-error" && (
                        <ErrorState message={describePathActionError("The outcome library", selectView.error)} />
                    )}
                </div>
            )}

            {activeStep === 2 && renderAnalyzeStep()}

            {activeStep === 3 &&
                (selectResult === undefined ? (
                    <EmptyState message="Select/import a valid library first." />
                ) : (
                    <div>
                        <PageSection legend="Summary">
                            <Table withRowBorders={false} mb="sm">
                                <Table.Tbody>
                                    <Table.Tr>
                                        <Table.Th>RTP</Table.Th>
                                        <Table.Td>{(selectResult.analysis.rtp * 100).toFixed(2)}%</Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Hit rate</Table.Th>
                                        <Table.Td>{(selectResult.analysis.hitFrequency * 100).toFixed(2)}%</Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Volatility (std. dev.)</Table.Th>
                                        <Table.Td>{selectResult.analysis.standardDeviation.toFixed(4)}</Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Max win</Table.Th>
                                        <Table.Td>
                                            {selectResult.analysis.maxWin.toFixed(2)} (probability {(selectResult.analysis.maxWinProbability * 100).toFixed(4)}%)
                                        </Table.Td>
                                    </Table.Tr>
                                </Table.Tbody>
                            </Table>
                        </PageSection>

                        <PageSection legend="Payout distribution">
                            <Table withRowBorders={false}>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Payout multiplier</Table.Th>
                                        <Table.Th>Probability</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {selectResult.analysis.payoutDistribution.map((bucket) => (
                                        <Table.Tr key={bucket.payoutMultiplier}>
                                            <Table.Td>{bucket.payoutMultiplier}</Table.Td>
                                            <Table.Td>{(bucket.probability * 100).toFixed(4)}%</Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </PageSection>

                        <PageSection legend="Feature/event breakdown">
                            <Text size="sm" fw={600} mb={4}>
                                Bet modes
                            </Text>
                            <Table withRowBorders={false} mb="sm">
                                <Table.Tbody>
                                    {selectResult.featureBreakdown.betModes.map((entry) => (
                                        <Table.Tr key={entry.key}>
                                            <Table.Th style={{overflowWrap: "anywhere"}}>{entry.key}</Table.Th>
                                            <Table.Td>
                                                {(entry.weightedFrequency * 100).toFixed(2)}% ({entry.outcomeCount} outcomes)
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                            <Text size="sm" fw={600} mb={4}>
                                Feature events
                            </Text>
                            {selectResult.featureBreakdown.featureEvents.length === 0 ? (
                                <Text size="sm" c="dimmed">
                                    No feature events recorded in this library.
                                </Text>
                            ) : (
                                <Table withRowBorders={false}>
                                    <Table.Tbody>
                                        {selectResult.featureBreakdown.featureEvents.map((entry) => (
                                            <Table.Tr key={entry.key}>
                                                <Table.Th style={{overflowWrap: "anywhere"}}>{entry.key}</Table.Th>
                                                <Table.Td>
                                                    {(entry.weightedFrequency * 100).toFixed(2)}% ({entry.outcomeCount} outcomes)
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            )}
                        </PageSection>

                        <AdvancedDisclosure detail="raw outcome sample">
                            <Text size="sm" c="dimmed" mb="sm">
                                {selectResult.sampleTruncated
                                    ? `Showing the first ${selectResult.sampleOutcomes.length} of ${selectResult.provenance.outcomeCount.toLocaleString()} outcomes.`
                                    : `Showing all ${selectResult.sampleOutcomes.length} outcomes.`}
                            </Text>
                            <CodeBlock>{JSON.stringify(selectResult.sampleOutcomes, null, 2)}</CodeBlock>
                        </AdvancedDisclosure>

                        <QuickActions>
                            <Button onClick={() => setActiveStep(4)}>Continue to Compare or use</Button>
                        </QuickActions>
                    </div>
                ))}

            {activeStep === 4 &&
                (selectResult === undefined ? (
                    <EmptyState message="Select/import a valid library first." />
                ) : (
                    <div>
                        <PageSection legend="Compare with another library">
                            {compareOutdated && (
                                <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} mb="sm">
                                    Outdated -- the comparison selector changed since the last Compare run. Its
                                    result no longer reflects what&apos;s configured here; rerun Compare to see
                                    an up-to-date comparison.
                                </Alert>
                            )}
                            <SelectorFieldsInput fields={rightFields} onChange={handleRightFieldsChange} idPrefix="Comparison" relevantDirectory={projectRoot} />
                            <QuickActions>
                                <Button
                                    onClick={runCompare}
                                    loading={"status" in compareView && compareView.status === "loading"}
                                    disabled={buildSelector(rightFields) === undefined}
                                >
                                    Compare
                                </Button>
                            </QuickActions>
                            {"status" in compareView && compareView.status === "error" && (
                                <ErrorState message={describePathActionError("The comparison request", compareView.message)} />
                            )}
                            {compareResult && (
                                <div>
                                    {compareResult.leftSnapshotStale && (
                                        <RecoveryNotice
                                            title="The left library changed since you selected it"
                                            message="Its content on disk no longer matches what Inspect showed you, so it wasn't compared against the right library. Re-select it to refresh, then compare again."
                                            actionLabel="Re-select the left library"
                                            actionVariant="light"
                                            onAction={() => runSelect(4)}
                                        />
                                    )}
                                    {compareResult.left.status === "load-error" && (
                                        <ErrorState message={describePathActionError("The left library", compareResult.left.error)} />
                                    )}
                                    {compareResult.left.status === "invalid" && (
                                        <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} title="The loaded library is no longer valid" mb="sm">
                                            <IssueList title="Errors" issues={compareResult.left.errors} />
                                        </Alert>
                                    )}
                                    {compareResult.right.status === "load-error" && (
                                        <ErrorState message={describePathActionError("The right library", compareResult.right.error)} />
                                    )}
                                    {compareResult.right.status === "invalid" && (
                                        <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} title="The comparison library is invalid" mb="sm">
                                            <IssueList title="Errors" issues={compareResult.right.errors} />
                                        </Alert>
                                    )}
                                    {compareResult.diff && (
                                        <div>
                                            <Table.ScrollContainer minWidth={480}>
                                                <Table withRowBorders={false} mb="sm">
                                                    <Table.Thead>
                                                        <Table.Tr>
                                                            <Table.Th>Metric</Table.Th>
                                                            <Table.Th>Left</Table.Th>
                                                            <Table.Th>Right</Table.Th>
                                                            <Table.Th>Delta</Table.Th>
                                                        </Table.Tr>
                                                    </Table.Thead>
                                                    <Table.Tbody>
                                                        <Table.Tr>
                                                            <Table.Th>RTP</Table.Th>
                                                            <Table.Td>{(compareResult.diff.rtp.left * 100).toFixed(2)}%</Table.Td>
                                                            <Table.Td>{(compareResult.diff.rtp.right * 100).toFixed(2)}%</Table.Td>
                                                            <Table.Td>{(compareResult.diff.rtp.delta * 100).toFixed(2)} pp</Table.Td>
                                                        </Table.Tr>
                                                        <Table.Tr>
                                                            <Table.Th>Hit rate</Table.Th>
                                                            <Table.Td>{(compareResult.diff.hitFrequency.left * 100).toFixed(2)}%</Table.Td>
                                                            <Table.Td>{(compareResult.diff.hitFrequency.right * 100).toFixed(2)}%</Table.Td>
                                                            <Table.Td>{(compareResult.diff.hitFrequency.delta * 100).toFixed(2)} pp</Table.Td>
                                                        </Table.Tr>
                                                        <Table.Tr>
                                                            <Table.Th>Volatility (std. dev.)</Table.Th>
                                                            <Table.Td>{compareResult.diff.standardDeviation.left.toFixed(4)}</Table.Td>
                                                            <Table.Td>{compareResult.diff.standardDeviation.right.toFixed(4)}</Table.Td>
                                                            <Table.Td>{compareResult.diff.standardDeviation.delta.toFixed(4)}</Table.Td>
                                                        </Table.Tr>
                                                        <Table.Tr>
                                                            <Table.Th>Max win</Table.Th>
                                                            <Table.Td>{compareResult.diff.maxWin.left.toFixed(2)}</Table.Td>
                                                            <Table.Td>{compareResult.diff.maxWin.right.toFixed(2)}</Table.Td>
                                                            <Table.Td>{compareResult.diff.maxWin.delta.toFixed(2)}</Table.Td>
                                                        </Table.Tr>
                                                    </Table.Tbody>
                                                </Table>
                                            </Table.ScrollContainer>
                                            {compareResult.diff.warnings.length > 0 && (
                                                <IssueList title="Notable changes" issues={compareResult.diff.warnings.map((message) => ({message}))} />
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </PageSection>

                        <PageSection legend="Use in runtime">
                            <Text size="sm" mb="sm">
                                Starts (or restarts) the Runtime tab&apos;s server against this exact library as
                                its pre-generated outcome source, then takes you there -- Create Session / Spin
                                draw from it instead of live RNG play. No manual configuration needed.
                            </Text>
                            <Table withRowBorders={false} mb="sm">
                                <Table.Tbody>
                                    <Table.Tr>
                                        <Table.Th>Library id</Table.Th>
                                        <Table.Td style={{overflowWrap: "anywhere"}}>{selectResult.provenance.libraryId}</Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Hash</Table.Th>
                                        <Table.Td style={{overflowWrap: "anywhere"}}>{selectResult.provenance.hash}</Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Th>Outcomes</Table.Th>
                                        <Table.Td>{selectResult.provenance.outcomeCount.toLocaleString()}</Table.Td>
                                    </Table.Tr>
                                </Table.Tbody>
                            </Table>
                            <QuickActions>
                                <Button
                                    onClick={() => {
                                        const selector = buildSelector(fields);
                                        if (selector !== undefined) {
                                            onUseInRuntime(selector, selectResult.provenance.hash);
                                        }
                                    }}
                                >
                                    Use in runtime
                                </Button>
                            </QuickActions>
                        </PageSection>
                    </div>
                ))}
        </PageSection>
    );
}
