import {Alert, Button, Group, NumberInput, Stepper, Table, Text, TextInput} from "@mantine/core";
import {IconAlertTriangle, IconCircleCheck} from "@tabler/icons-react";
import {useRef, useState, type ReactNode} from "react";
import {buildCertificationEvidenceBundle, validateCertificationSourceBundle, type CertificationBuildModeInput} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {
    describeCertificationBuildResult,
    describeCertificationOutcome,
    describeCertificationProvenanceSummary,
    describeCertificationSourceValidateResult,
    type CertificationBuildRequestView,
    type CertificationOutcome,
    type CertificationSourceValidateRequestView,
} from "../../domain/interpret/Certification";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {OutcomeBanner} from "../common/OutcomeBanner";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";

const OUTCOME_BANNER: Record<CertificationOutcome, {color: string; icon: ReactNode; title: string}> = {
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

type ModeFields = {modeName: string; seed: string; sampleCount: number};

const EMPTY_MODE: ModeFields = {modeName: "", seed: "", sampleCount: 100};

function isModeValid(mode: ModeFields): boolean {
    return mode.modeName.trim().length > 0 && mode.seed.trim().length > 0 && Number.isInteger(mode.sampleCount) && mode.sampleCount > 0;
}

// Only fully-filled-in rows are sent -- an incomplete row (still being typed) is silently excluded
// rather than blocking the whole request, but if that leaves nothing, the Build button stays disabled
// (see its own `disabled` check below).
function toModeInputs(modes: readonly ModeFields[]): CertificationBuildModeInput[] {
    return modes.filter(isModeValid).map((mode) => ({modeName: mode.modeName.trim(), seed: mode.seed.trim(), sampleCount: mode.sampleCount}));
}

// Guided Select/configure -> Validate -> Build bundle -> Inspect -> Export workflow, built entirely on
// pokie's own CertificationEvidenceBundleBuilder/CertificationEvidenceBundleValidator (see
// StudioCertificationService) -- every hash/metric shown here is computed server-side, never re-derived
// in this UI. Mirrors OutcomeLibrariesTab's own lifecycle discipline: a monotonic requestId ref per
// async action, a double-submit guard, and an invalidate*() helper that resets state and cascades to
// downstream steps whenever an upstream input changes.
export function CertificationTab() {
    const fetchImpl = useStudioApi();
    const [activeStep, setActiveStep] = useState(0);

    // ---- Select/configure ----
    const [bundleDir, setBundleDir] = useState("");
    const [outDir, setOutDir] = useState("certification");
    const [modes, setModes] = useState<ModeFields[]>([EMPTY_MODE]);

    // ---- Validate ----
    const [validateView, setValidateView] = useState<CertificationSourceValidateRequestView>({status: "idle"});
    const validateRequestIdRef = useRef(0);
    const validateGuard = useDoubleSubmitGuard();

    // ---- Build bundle ----
    const [buildView, setBuildView] = useState<CertificationBuildRequestView>({status: "idle"});
    const buildRequestIdRef = useRef(0);
    const buildGuard = useDoubleSubmitGuard();

    function invalidateBuild(): void {
        buildRequestIdRef.current++;
        setBuildView({status: "idle"});
        buildGuard.end();
    }

    function invalidateValidate(): void {
        validateRequestIdRef.current++;
        setValidateView({status: "idle"});
        validateGuard.end();
        invalidateBuild();
    }

    function handleBundleDirChange(value: string): void {
        setBundleDir(value);
        if (validateView.status !== "idle") {
            invalidateValidate();
        }
    }

    function handleModesChange(next: ModeFields[]): void {
        setModes(next);
        if (buildView.status !== "idle") {
            invalidateBuild();
        }
    }

    function handleOutDirChange(value: string): void {
        setOutDir(value);
        if (buildView.status !== "idle") {
            invalidateBuild();
        }
    }

    function runValidate(): void {
        if (bundleDir.trim().length === 0 || !validateGuard.begin()) {
            return;
        }
        const requestId = ++validateRequestIdRef.current;
        invalidateBuild();
        setValidateView({status: "loading"});
        validateCertificationSourceBundle(fetchImpl, bundleDir.trim())
            .then((result) => {
                if (requestId !== validateRequestIdRef.current) {
                    return;
                }
                validateGuard.end();
                setValidateView(describeCertificationSourceValidateResult(result));
            })
            .catch((error: unknown) => {
                if (requestId !== validateRequestIdRef.current) {
                    return;
                }
                validateGuard.end();
                setValidateView({status: "network-error", message: errorMessage(error)});
            });
    }

    function runBuild(): void {
        const modeInputs = toModeInputs(modes);
        if (modeInputs.length === 0 || bundleDir.trim().length === 0 || outDir.trim().length === 0 || !buildGuard.begin()) {
            return;
        }
        const requestId = ++buildRequestIdRef.current;
        setBuildView({status: "loading"});
        buildCertificationEvidenceBundle(fetchImpl, bundleDir.trim(), modeInputs, outDir.trim())
            .then((result) => {
                if (requestId !== buildRequestIdRef.current) {
                    return;
                }
                buildGuard.end();
                setBuildView(describeCertificationBuildResult(result));
            })
            .catch((error: unknown) => {
                if (requestId !== buildRequestIdRef.current) {
                    return;
                }
                buildGuard.end();
                setBuildView({status: "network-error", message: errorMessage(error)});
            });
    }

    const validateReachable = bundleDir.trim().length > 0;
    const validateOutcome = validateView.status === "ok" ? describeCertificationOutcome(validateView) : undefined;
    const buildReachable = validateOutcome !== undefined && validateOutcome !== "invalid";
    const buildResult = buildView.status === "ok" ? buildView : undefined;
    let buildOutcome: CertificationOutcome | undefined;
    if (buildView.status === "ok") {
        buildOutcome = describeCertificationOutcome({errors: [], warnings: buildView.warnings});
    } else if (buildView.status === "error") {
        buildOutcome = describeCertificationOutcome(buildView);
    }
    const inspectReachable = buildResult !== undefined;

    function renderValidateStep(): ReactNode {
        if (!validateReachable) {
            return <EmptyState message="Enter a source outcome-library bundle directory first." />;
        }
        return (
            <div>
                <Text size="sm" c="dimmed" mb="sm">
                    Runs the same deep bundle validation the Build step itself performs before sampling a single
                    round -- a preflight check you can run before committing to a build.
                </Text>
                <QuickActions>
                    <Button onClick={runValidate} loading={validateView.status === "loading"}>
                        Validate source bundle
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
                {buildReachable && (
                    <QuickActions>
                        <Button onClick={() => setActiveStep(2)}>Continue to Build bundle</Button>
                    </QuickActions>
                )}
            </div>
        );
    }

    function renderBuildStep(): ReactNode {
        if (!buildReachable) {
            return <EmptyState message="Validate the source bundle first." />;
        }
        return (
            <div>
                <TextInput label="Output directory" value={outDir} onChange={(event) => handleOutDirChange(event.currentTarget.value)} mb="sm" />
                <QuickActions>
                    <Button onClick={runBuild} loading={buildView.status === "loading"} disabled={toModeInputs(modes).length === 0}>
                        Build certification bundle
                    </Button>
                </QuickActions>
                {buildView.status === "network-error" && <ErrorState message={buildView.message} />}
                {buildView.status === "load-error" && <ErrorState message={buildView.error} />}
                {buildOutcome !== undefined && (
                    <OutcomeBanner
                        color={OUTCOME_BANNER[buildOutcome].color}
                        icon={OUTCOME_BANNER[buildOutcome].icon}
                        title={OUTCOME_BANNER[buildOutcome].title}
                        errors={buildView.status === "error" ? buildView.errors : []}
                        warnings={buildView.status === "ok" || buildView.status === "error" ? buildView.warnings : []}
                    />
                )}
                {inspectReachable && (
                    <QuickActions>
                        <Button onClick={() => setActiveStep(3)}>Continue to Inspect</Button>
                    </QuickActions>
                )}
            </div>
        );
    }

    return (
        <PageSection legend="Certification">
            <Text size="sm" c="dimmed" mb="sm">
                Build a canonical certification/evidence bundle on top of an outcome-library bundle, inspect its
                manifest and sampled artifacts, and export it for a certifier -- everything shown here is computed
                by pokie&apos;s own CertificationEvidenceBundleBuilder/Validator, never re-derived in this UI.
            </Text>

            <Stepper active={activeStep} onStepClick={setActiveStep} mb="md" size="sm">
                <Stepper.Step label="Select/configure" description="Bundle & modes" />
                <Stepper.Step label="Validate" description="Preflight" disabled={!validateReachable} />
                <Stepper.Step label="Build bundle" description="Sample & publish" disabled={!buildReachable} />
                <Stepper.Step label="Inspect" description="Manifest & artifacts" disabled={!inspectReachable} />
                <Stepper.Step label="Export" description="Download manifest" disabled={!inspectReachable} />
            </Stepper>

            {activeStep === 0 && (
                <div>
                    <TextInput
                        label="Source outcome-library bundle directory"
                        placeholder="./outcomes/bundle"
                        value={bundleDir}
                        onChange={(event) => handleBundleDirChange(event.currentTarget.value)}
                        mb="sm"
                    />
                    <Text size="sm" fw={600} mb={4}>
                        Modes to sample
                    </Text>
                    {modes.map((mode, index) => (
                        <Group key={index} gap="sm" wrap="wrap" mb="sm" align="flex-end">
                            <TextInput
                                label="Mode name"
                                placeholder="base"
                                value={mode.modeName}
                                onChange={(event) => handleModesChange(modes.map((m, i) => (i === index ? {...m, modeName: event.currentTarget.value} : m)))}
                            />
                            <TextInput
                                label="Seed"
                                placeholder="cert-2026-07-20-base"
                                value={mode.seed}
                                onChange={(event) => handleModesChange(modes.map((m, i) => (i === index ? {...m, seed: event.currentTarget.value} : m)))}
                            />
                            <NumberInput
                                label="Sample count"
                                min={1}
                                value={mode.sampleCount}
                                onChange={(value) => handleModesChange(modes.map((m, i) => (i === index ? {...m, sampleCount: Number(value) || 0} : m)))}
                            />
                            {modes.length > 1 && (
                                <Button variant="subtle" color="red" onClick={() => handleModesChange(modes.filter((_, i) => i !== index))}>
                                    Remove
                                </Button>
                            )}
                        </Group>
                    ))}
                    <QuickActions>
                        <Button variant="default" onClick={() => handleModesChange([...modes, {...EMPTY_MODE}])}>
                            Add mode
                        </Button>
                        <Button onClick={() => setActiveStep(1)} disabled={!validateReachable}>
                            Continue to Validate
                        </Button>
                    </QuickActions>
                </div>
            )}

            {activeStep === 1 && renderValidateStep()}
            {activeStep === 2 && renderBuildStep()}

            {activeStep === 3 &&
                (buildResult === undefined ? (
                    <EmptyState message="Build a certification bundle first." />
                ) : (
                    <div>
                        <PageSection legend="Summary">
                            <Text size="sm" mb="sm">
                                {describeCertificationProvenanceSummary(buildResult.manifest)}
                            </Text>
                        </PageSection>

                        <PageSection legend="Per-mode evidence">
                            <Table.ScrollContainer minWidth={640}>
                                <Table withRowBorders={false}>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Mode</Table.Th>
                                            <Table.Th>Library hash</Table.Th>
                                            <Table.Th>Outcomes</Table.Th>
                                            <Table.Th>RTP</Table.Th>
                                            <Table.Th>Samples</Table.Th>
                                            <Table.Th>Samples hash</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {buildResult.manifest.modes.map((mode) => (
                                            <Table.Tr key={mode.modeName}>
                                                <Table.Td>{mode.modeName}</Table.Td>
                                                <Table.Td style={{overflowWrap: "anywhere"}}>{mode.libraryHash}</Table.Td>
                                                <Table.Td>{mode.outcomeCount.toLocaleString()}</Table.Td>
                                                <Table.Td>{(mode.analysis.rtp * 100).toFixed(2)}%</Table.Td>
                                                <Table.Td>
                                                    {mode.sampleCount.toLocaleString()} (seed &quot;{mode.sampleSeed}&quot;)
                                                </Table.Td>
                                                <Table.Td style={{overflowWrap: "anywhere"}}>{mode.samplesHash}</Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        </PageSection>

                        {buildResult.manifest.deepValidation.issues.length > 0 && (
                            <PageSection legend="Source bundle deep-validation (embedded verbatim)">
                                <IssueList title="Issues" issues={[...buildResult.manifest.deepValidation.issues]} />
                            </PageSection>
                        )}

                        <PageSection legend="Files">
                            {buildResult.files.map((file) => (
                                <Text key={file} size="sm" style={{overflowWrap: "anywhere"}}>
                                    {file}
                                </Text>
                            ))}
                        </PageSection>

                        <AdvancedDisclosure detail="raw manifest">
                            <CodeBlock>{JSON.stringify(buildResult.manifest, null, 2)}</CodeBlock>
                        </AdvancedDisclosure>

                        <QuickActions>
                            <Button onClick={() => setActiveStep(4)}>Continue to Export</Button>
                        </QuickActions>
                    </div>
                ))}

            {activeStep === 4 &&
                (buildResult === undefined ? (
                    <EmptyState message="Build a certification bundle first." />
                ) : (
                    <div>
                        <Alert color="blue" variant="light" mb="sm">
                            <Text size="sm">
                                The manifest and every sampled-artifact file already live on disk under the output
                                directory below -- Studio never copies them into the browser. Download the manifest
                                for a quick reference, and hand the certifier the directory itself for the full
                                evidence (including the per-mode samples file(s) listed under Files).
                            </Text>
                        </Alert>
                        <PageSection legend="Output directory">
                            <Text size="sm" style={{overflowWrap: "anywhere"}}>
                                {outDir}
                            </Text>
                        </PageSection>
                        <QuickActions>
                            <Button
                                onClick={() =>
                                    downloadJsonBlob(
                                        `certification-${buildResult.manifest.game.id}-${buildResult.manifest.game.version}-manifest.json`,
                                        buildResult.manifest,
                                    )
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
