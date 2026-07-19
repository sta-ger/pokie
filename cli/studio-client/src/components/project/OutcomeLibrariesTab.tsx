import {Alert, Button, Group, SegmentedControl, Stepper, Table, Text, TextInput} from "@mantine/core";
import {IconAlertTriangle, IconCircleCheck} from "@tabler/icons-react";
import {useRef, useState, type ReactNode} from "react";
import {compareOutcomeLibraries, selectOutcomeLibrary, validateOutcomeLibraryDeep} from "../../api/apiClient";
import type {OutcomeLibrarySelector} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {
    describeOutcomeLibraryCompareResult,
    describeOutcomeLibraryDeepValidateResult,
    describeOutcomeLibraryOutcome,
    describeOutcomeLibraryProvenanceSummary,
    describeOutcomeLibrarySelectResult,
    type OutcomeLibraryCompareRequestView,
    type OutcomeLibraryDeepValidateRequestView,
    type OutcomeLibraryOutcome,
    type OutcomeLibrarySelectRequestView,
} from "../../domain/interpret/OutcomeLibraries";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {OutcomeBanner} from "../common/OutcomeBanner";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RecoveryNotice} from "../common/RecoveryNotice";

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

function SelectorFieldsInput({fields, onChange, idPrefix}: {fields: SelectorFields; onChange: (fields: SelectorFields) => void; idPrefix: string}) {
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
                <TextInput
                    label="Library JSON path"
                    placeholder="./outcomes/base.json"
                    value={fields.path}
                    onChange={(event) => onChange({...fields, path: event.currentTarget.value})}
                />
            )}
            {fields.kind === "bundle" && (
                <Group gap="sm" wrap="wrap">
                    <TextInput
                        label="Bundle directory"
                        placeholder="./outcomes/bundle"
                        value={fields.bundleDir}
                        onChange={(event) => onChange({...fields, bundleDir: event.currentTarget.value})}
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
                    <TextInput
                        label="Stake Engine export directory"
                        placeholder="./stake-export"
                        value={fields.stakeDir}
                        onChange={(event) => onChange({...fields, stakeDir: event.currentTarget.value})}
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
export function OutcomeLibrariesTab({onUseInRuntime}: {onUseInRuntime: (selector: OutcomeLibrarySelector, expectedHash: string) => void}) {
    const fetchImpl = useStudioApi();
    const [activeStep, setActiveStep] = useState(0);

    // ---- Select/import ----
    const [fields, setFields] = useState<SelectorFields>(EMPTY_SELECTOR_FIELDS);
    const [selectView, setSelectView] = useState<OutcomeLibrarySelectRequestView>({status: "idle"});
    const selectRequestIdRef = useRef(0);
    const selectGuard = useDoubleSubmitGuard();

    // ---- Validate & analyze (deep, bundle-only) ----
    const [deepValidateView, setDeepValidateView] = useState<OutcomeLibraryDeepValidateRequestView>({status: "idle"});
    const deepValidateRequestIdRef = useRef(0);
    const deepValidateGuard = useDoubleSubmitGuard();

    // ---- Compare ----
    const [rightFields, setRightFields] = useState<SelectorFields>(EMPTY_SELECTOR_FIELDS);
    const [compareView, setCompareView] = useState<OutcomeLibraryCompareRequestView>({status: "idle"});
    const compareRequestIdRef = useRef(0);
    const compareGuard = useDoubleSubmitGuard();

    function invalidateDeepValidate(): void {
        deepValidateRequestIdRef.current++;
        setDeepValidateView({status: "idle"});
        deepValidateGuard.end();
    }

    function invalidateCompare(): void {
        compareRequestIdRef.current++;
        setCompareView({status: "idle"});
        compareGuard.end();
    }

    // Any change to the selected library invalidates the old/pending select response, and everything
    // downstream that described *that* library (a deep-validate run, a comparison).
    function invalidateSelect(): void {
        selectRequestIdRef.current++;
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

    function runSelect(): void {
        const selector = buildSelector(fields);
        if (selector === undefined || !selectGuard.begin()) {
            return;
        }
        const requestId = ++selectRequestIdRef.current;
        invalidateDeepValidate();
        invalidateCompare();
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
                    setActiveStep(1);
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
            return <ErrorState message={selectView.error} />;
        }
        if (selectView.status === "error") {
            return <ErrorState message={selectView.message} />;
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
                        {deepValidateView.status === "error" && <ErrorState message={deepValidateView.message} />}
                        {deepValidateView.status === "load-error" && <ErrorState message={deepValidateView.error} />}
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
                        <Button onClick={() => setActiveStep(2)}>Continue to Inspect</Button>
                    </QuickActions>
                )}
            </div>
        );
    }

    return (
        <PageSection legend="Outcome Libraries">
            <Text size="sm" c="dimmed" mb="sm">
                Load a POKIE outcome library (or a supported external export) purely in memory, validate and
                analyze it, inspect its distribution and feature breakdown, and compare it against another
                library — everything shown here is computed by pokie&apos;s own WeightedOutcomeLibrary
                services, never re-derived in this UI.
            </Text>

            <Stepper active={activeStep} onStepClick={setActiveStep} mb="md" size="sm">
                <Stepper.Step label="Select/import" description="Choose a library" />
                <Stepper.Step label="Validate & analyze" description="Diagnostics" disabled={!analyzeReachable} />
                <Stepper.Step label="Inspect" description="Distribution & features" disabled={!inspectReachable} />
                <Stepper.Step label="Compare or use" description="Diff & hand-off" disabled={!inspectReachable} />
            </Stepper>

            {activeStep === 0 && (
                <div>
                    <SelectorFieldsInput fields={fields} onChange={handleFieldsChange} idPrefix="Library" />
                    <QuickActions>
                        <Button onClick={runSelect} loading={selectView.status === "loading"} disabled={buildSelector(fields) === undefined}>
                            Load library
                        </Button>
                    </QuickActions>
                    {selectView.status === "error" && <ErrorState message={selectView.message} />}
                    {selectView.status === "load-error" && <ErrorState message={selectView.error} />}
                </div>
            )}

            {activeStep === 1 && renderAnalyzeStep()}

            {activeStep === 2 &&
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
                                            <Table.Th>{entry.key}</Table.Th>
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
                                                <Table.Th>{entry.key}</Table.Th>
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
                            <Button onClick={() => setActiveStep(3)}>Continue to Compare or use</Button>
                        </QuickActions>
                    </div>
                ))}

            {activeStep === 3 &&
                (selectResult === undefined ? (
                    <EmptyState message="Select/import a valid library first." />
                ) : (
                    <div>
                        <PageSection legend="Compare with another library">
                            <SelectorFieldsInput fields={rightFields} onChange={handleRightFieldsChange} idPrefix="Comparison" />
                            <QuickActions>
                                <Button
                                    onClick={runCompare}
                                    loading={"status" in compareView && compareView.status === "loading"}
                                    disabled={buildSelector(rightFields) === undefined}
                                >
                                    Compare
                                </Button>
                            </QuickActions>
                            {"status" in compareView && compareView.status === "error" && <ErrorState message={compareView.message} />}
                            {compareResult && (
                                <div>
                                    {compareResult.leftSnapshotStale && (
                                        <RecoveryNotice
                                            title="The left library changed since you selected it"
                                            message="Its content on disk no longer matches what Inspect showed you, so it wasn't compared against the right library. Re-select it to refresh, then compare again."
                                            actionLabel="Re-select the left library"
                                            actionVariant="light"
                                            onAction={runSelect}
                                        />
                                    )}
                                    {compareResult.left.status === "load-error" && <ErrorState message={compareResult.left.error} />}
                                    {compareResult.left.status === "invalid" && (
                                        <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} title="The loaded library is no longer valid" mb="sm">
                                            <IssueList title="Errors" issues={compareResult.left.errors} />
                                        </Alert>
                                    )}
                                    {compareResult.right.status === "load-error" && <ErrorState message={compareResult.right.error} />}
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
