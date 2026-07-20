import {Button, NumberInput, SegmentedControl, Stepper, Table, Text, Textarea, TextInput} from "@mantine/core";
import {IconAlertTriangle, IconCircleCheck} from "@tabler/icons-react";
import {useRef, useState, type ReactNode} from "react";
import {configureFairnessRound, generateFairnessProof, verifyFairnessProof} from "../../api/apiClient";
import type {FairnessCommitment, FairnessRoundProof} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {
    describeFairnessCommitmentPublishOrder,
    describeFairnessConfigureResult,
    describeFairnessGenerateResult,
    describeFairnessOutcome,
    describeFairnessVerifyResult,
    type FairnessConfigureRequestView,
    type FairnessGenerateRequestView,
    type FairnessOutcome,
    type FairnessVerifyRequestView,
} from "../../domain/interpret/Fairness";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {OutcomeBanner} from "../common/OutcomeBanner";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";

const OUTCOME_BANNER: Record<FairnessOutcome, {color: string; icon: ReactNode; title: string}> = {
    success: {color: "green", icon: <IconCircleCheck size={16} />, title: "Verified"},
    partial: {color: "blue", icon: <IconAlertTriangle size={16} />, title: "Verified with warnings"},
    invalid: {color: "red", icon: <IconAlertTriangle size={16} />, title: "Did not verify"},
};

type ConfigureFields = {bundleDir: string; modeName: string; serverSeed: string; clientSeed: string; nonce: number};

const EMPTY_CONFIGURE: ConfigureFields = {bundleDir: "", modeName: "", serverSeed: "", clientSeed: "", nonce: 0};

function isConfigureValid(fields: ConfigureFields): boolean {
    return (
        fields.bundleDir.trim().length > 0 &&
        fields.modeName.trim().length > 0 &&
        fields.serverSeed.trim().length > 0 &&
        fields.clientSeed.trim().length > 0
    );
}

type ParsedJson<T> = {status: "ok"; value: T} | {status: "error"; message: string} | {status: "empty"};

function parseJson<T>(text: string): ParsedJson<T> {
    if (text.trim().length === 0) {
        return {status: "empty"};
    }
    try {
        return {status: "ok", value: JSON.parse(text) as T};
    } catch (error) {
        return {status: "error", message: errorMessage(error)};
    }
}

// Guided Configure -> Generate/inspect proof -> Verify -> Review diagnostics workflow, built entirely
// on pokie's own computeFairnessServerSeedCommitment/computeFairnessCommitment/
// FairnessRoundProofBuilder/FairnessRoundProofVerifier (see StudioFairnessService) -- every hash/outcome
// shown here is computed server-side, never re-derived in this UI. Verify supports both the
// just-generated proof/commitment and a pasted external proof/commitment -- the latter is the actual
// real-world Provably Fair use case, independently verifying someone else's round.
export function ProvablyFairTab() {
    const fetchImpl = useStudioApi();
    const [activeStep, setActiveStep] = useState(0);

    // ---- Configure ----
    const [fields, setFields] = useState<ConfigureFields>(EMPTY_CONFIGURE);
    const [configureView, setConfigureView] = useState<FairnessConfigureRequestView>({status: "idle"});
    const configureRequestIdRef = useRef(0);
    const configureGuard = useDoubleSubmitGuard();

    // ---- Generate/inspect proof ----
    const [generateView, setGenerateView] = useState<FairnessGenerateRequestView>({status: "idle"});
    const generateRequestIdRef = useRef(0);
    const generateGuard = useDoubleSubmitGuard();

    // ---- Verify ----
    const [verifySource, setVerifySource] = useState<"generated" | "paste">("generated");
    const [pastedProofText, setPastedProofText] = useState("");
    const [pastedCommitmentText, setPastedCommitmentText] = useState("");
    const [verifyBundleDir, setVerifyBundleDir] = useState("");
    const [verifyView, setVerifyView] = useState<FairnessVerifyRequestView>({status: "idle"});
    const verifyRequestIdRef = useRef(0);
    const verifyGuard = useDoubleSubmitGuard();

    function invalidateVerify(): void {
        verifyRequestIdRef.current++;
        setVerifyView({status: "idle"});
        verifyGuard.end();
    }

    function invalidateGenerate(): void {
        generateRequestIdRef.current++;
        setGenerateView({status: "idle"});
        generateGuard.end();
        if (verifySource === "generated") {
            invalidateVerify();
        }
    }

    function invalidateConfigure(): void {
        configureRequestIdRef.current++;
        setConfigureView({status: "idle"});
        configureGuard.end();
        invalidateGenerate();
    }

    function handleFieldsChange(next: ConfigureFields): void {
        setFields(next);
        if (configureView.status !== "idle") {
            invalidateConfigure();
        }
    }

    function runConfigure(): void {
        if (!isConfigureValid(fields) || !configureGuard.begin()) {
            return;
        }
        const requestId = ++configureRequestIdRef.current;
        invalidateGenerate();
        setConfigureView({status: "loading"});
        configureFairnessRound(fetchImpl, fields)
            .then((result) => {
                if (requestId !== configureRequestIdRef.current) {
                    return;
                }
                configureGuard.end();
                setConfigureView(describeFairnessConfigureResult(result));
                if (result.status === "ok") {
                    setVerifyBundleDir(fields.bundleDir.trim());
                }
            })
            .catch((error: unknown) => {
                if (requestId !== configureRequestIdRef.current) {
                    return;
                }
                configureGuard.end();
                setConfigureView({status: "error", message: errorMessage(error)});
            });
    }

    function runGenerate(): void {
        if (configureView.status !== "ok" || !generateGuard.begin()) {
            return;
        }
        const commitment = configureView.commitment;
        const requestId = ++generateRequestIdRef.current;
        setGenerateView({status: "loading"});
        generateFairnessProof(fetchImpl, fields.bundleDir.trim(), commitment, fields.serverSeed.trim())
            .then((result) => {
                if (requestId !== generateRequestIdRef.current) {
                    return;
                }
                generateGuard.end();
                setGenerateView(describeFairnessGenerateResult(result));
            })
            .catch((error: unknown) => {
                if (requestId !== generateRequestIdRef.current) {
                    return;
                }
                generateGuard.end();
                setGenerateView({status: "error", message: errorMessage(error)});
            });
    }

    const generatedProof = generateView.status === "ok" ? generateView.proof : undefined;
    const configuredCommitment = configureView.status === "ok" ? configureView.commitment : undefined;

    const pastedProof = verifySource === "paste" ? parseJson<FairnessRoundProof>(pastedProofText) : undefined;
    const pastedCommitment = verifySource === "paste" ? parseJson<FairnessCommitment>(pastedCommitmentText) : undefined;

    function resolveVerifyInputs(): {proof: unknown; commitment: unknown} | undefined {
        if (verifySource === "generated") {
            if (generatedProof === undefined || configuredCommitment === undefined) {
                return undefined;
            }
            return {proof: generatedProof, commitment: configuredCommitment};
        }
        if (pastedProof?.status !== "ok" || pastedCommitment?.status !== "ok") {
            return undefined;
        }
        return {proof: pastedProof.value, commitment: pastedCommitment.value};
    }

    function runVerify(): void {
        const inputs = resolveVerifyInputs();
        if (inputs === undefined || verifyBundleDir.trim().length === 0 || !verifyGuard.begin()) {
            return;
        }
        const requestId = ++verifyRequestIdRef.current;
        setVerifyView({status: "loading"});
        verifyFairnessProof(fetchImpl, inputs.proof, inputs.commitment, verifyBundleDir.trim())
            .then((result) => {
                if (requestId !== verifyRequestIdRef.current) {
                    return;
                }
                verifyGuard.end();
                setVerifyView(describeFairnessVerifyResult(result));
            })
            .catch((error: unknown) => {
                if (requestId !== verifyRequestIdRef.current) {
                    return;
                }
                verifyGuard.end();
                setVerifyView({status: "error", message: errorMessage(error)});
            });
    }

    const generateReachable = configureView.status === "ok";
    const verifyReachable = generateReachable;
    const verifyResult = verifyView.status === "ok" ? verifyView : undefined;
    const verifyOutcome = verifyResult !== undefined ? describeFairnessOutcome(verifyResult) : undefined;
    const diagnosticsReachable = verifyResult !== undefined;

    return (
        <PageSection legend="Provably Fair">
            <Text size="sm" c="dimmed" mb="sm">
                Configure a round&apos;s seeds, generate and inspect its round proof, then verify it against its
                commitment and live source bundle -- everything shown here is computed by pokie&apos;s own
                commit-reveal services, never re-derived in this UI.
            </Text>

            <Stepper active={activeStep} onStepClick={setActiveStep} mb="md" size="sm">
                <Stepper.Step label="Configure" description="Seeds & mode" />
                <Stepper.Step label="Generate/inspect proof" description="Reveal" disabled={!generateReachable} />
                <Stepper.Step label="Verify" description="Cross-check" disabled={!verifyReachable} />
                <Stepper.Step label="Review diagnostics" description="Issues" disabled={!diagnosticsReachable} />
            </Stepper>

            {activeStep === 0 && (
                <div>
                    <TextInput
                        label="Source outcome-library bundle directory"
                        placeholder="./outcomes/bundle"
                        value={fields.bundleDir}
                        onChange={(event) => handleFieldsChange({...fields, bundleDir: event.currentTarget.value})}
                        mb="sm"
                    />
                    <TextInput
                        label="Mode name"
                        placeholder="base"
                        value={fields.modeName}
                        onChange={(event) => handleFieldsChange({...fields, modeName: event.currentTarget.value})}
                        mb="sm"
                    />
                    <TextInput
                        label="Server seed"
                        placeholder="operator-server-seed"
                        value={fields.serverSeed}
                        onChange={(event) => handleFieldsChange({...fields, serverSeed: event.currentTarget.value})}
                        mb="sm"
                    />
                    <TextInput
                        label="Client seed"
                        placeholder="player-client-seed"
                        value={fields.clientSeed}
                        onChange={(event) => handleFieldsChange({...fields, clientSeed: event.currentTarget.value})}
                        mb="sm"
                    />
                    <NumberInput
                        label="Nonce"
                        min={0}
                        value={fields.nonce}
                        onChange={(value) => handleFieldsChange({...fields, nonce: Number(value) || 0})}
                        mb="sm"
                    />
                    <QuickActions>
                        <Button onClick={runConfigure} loading={configureView.status === "loading"} disabled={!isConfigureValid(fields)}>
                            Compute commitments
                        </Button>
                    </QuickActions>
                    {configureView.status === "error" && <ErrorState message={configureView.message} />}
                    {configureView.status === "load-error" && <ErrorState message={configureView.error} />}
                    {configureView.status === "invalid" && <ErrorState message={configureView.message} />}
                    {configureView.status === "ok" && (
                        <div>
                            <Text size="sm" c="dimmed" mb="sm">
                                {describeFairnessCommitmentPublishOrder()}
                            </Text>
                            <PageSection legend="Server seed commitment (publish first)">
                                <Table withRowBorders={false}>
                                    <Table.Tbody>
                                        <Table.Tr>
                                            <Table.Th>Server seed hash</Table.Th>
                                            <Table.Td style={{overflowWrap: "anywhere"}}>{configureView.serverSeedCommitment.serverSeedHash}</Table.Td>
                                        </Table.Tr>
                                    </Table.Tbody>
                                </Table>
                            </PageSection>
                            <PageSection legend="Full commitment (publish before drawing)">
                                <Table withRowBorders={false}>
                                    <Table.Tbody>
                                        <Table.Tr>
                                            <Table.Th>Library id</Table.Th>
                                            <Table.Td style={{overflowWrap: "anywhere"}}>{configureView.commitment.libraryId}</Table.Td>
                                        </Table.Tr>
                                        <Table.Tr>
                                            <Table.Th>Library hash</Table.Th>
                                            <Table.Td style={{overflowWrap: "anywhere"}}>{configureView.commitment.libraryHash}</Table.Td>
                                        </Table.Tr>
                                    </Table.Tbody>
                                </Table>
                            </PageSection>
                            <AdvancedDisclosure detail="raw commitments">
                                <CodeBlock>{JSON.stringify({serverSeedCommitment: configureView.serverSeedCommitment, commitment: configureView.commitment}, null, 2)}</CodeBlock>
                            </AdvancedDisclosure>
                            <QuickActions>
                                <Button onClick={() => setActiveStep(1)}>Continue to Generate/inspect proof</Button>
                            </QuickActions>
                        </div>
                    )}
                </div>
            )}

            {activeStep === 1 &&
                (!generateReachable ? (
                    <EmptyState message="Compute commitments first." />
                ) : (
                    <div>
                        <QuickActions>
                            <Button onClick={runGenerate} loading={generateView.status === "loading"}>
                                Generate round proof
                            </Button>
                        </QuickActions>
                        {generateView.status === "error" && <ErrorState message={generateView.message} />}
                        {generateView.status === "load-error" && <ErrorState message={generateView.error} />}
                        {generateView.status === "build-error" && <ErrorState message={`${generateView.code}: ${generateView.message}`} />}
                        {generateView.status === "ok" && (
                            <div>
                                <PageSection legend="Revealed round">
                                    <Table withRowBorders={false}>
                                        <Table.Tbody>
                                            <Table.Tr>
                                                <Table.Th>Outcome id</Table.Th>
                                                <Table.Td style={{overflowWrap: "anywhere"}}>{generateView.proof.outcomeId}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Th>Weight</Table.Th>
                                                <Table.Td>{generateView.proof.weight}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Th>Revealed at</Table.Th>
                                                <Table.Td>{generateView.proof.revealedAt}</Table.Td>
                                            </Table.Tr>
                                        </Table.Tbody>
                                    </Table>
                                </PageSection>
                                <AdvancedDisclosure detail="raw proof">
                                    <CodeBlock>{JSON.stringify(generateView.proof, null, 2)}</CodeBlock>
                                </AdvancedDisclosure>
                                <QuickActions>
                                    <Button onClick={() => setActiveStep(2)}>Continue to Verify</Button>
                                </QuickActions>
                            </div>
                        )}
                    </div>
                ))}

            {activeStep === 2 &&
                (!verifyReachable ? (
                    <EmptyState message="Compute commitments first." />
                ) : (
                    <div>
                        <SegmentedControl
                            value={verifySource}
                            onChange={(value) => {
                                setVerifySource(value as "generated" | "paste");
                                invalidateVerify();
                            }}
                            data={[
                                {label: "Generated in this session", value: "generated"},
                                {label: "Paste external proof/commitment", value: "paste"},
                            ]}
                            mb="sm"
                        />
                        {verifySource === "generated" && generatedProof === undefined && (
                            <EmptyState message="Generate a round proof first, or switch to pasting an external one." />
                        )}
                        {verifySource === "paste" && (
                            <div>
                                <Textarea
                                    label="Proof JSON"
                                    autosize
                                    minRows={4}
                                    value={pastedProofText}
                                    onChange={(event) => {
                                        setPastedProofText(event.currentTarget.value);
                                        invalidateVerify();
                                    }}
                                    mb="sm"
                                />
                                {pastedProof?.status === "error" && <ErrorState message={`Proof JSON: ${pastedProof.message}`} />}
                                <Textarea
                                    label="Commitment JSON"
                                    autosize
                                    minRows={4}
                                    value={pastedCommitmentText}
                                    onChange={(event) => {
                                        setPastedCommitmentText(event.currentTarget.value);
                                        invalidateVerify();
                                    }}
                                    mb="sm"
                                />
                                {pastedCommitment?.status === "error" && <ErrorState message={`Commitment JSON: ${pastedCommitment.message}`} />}
                            </div>
                        )}
                        <TextInput
                            label="Source outcome-library bundle directory"
                            value={verifyBundleDir}
                            onChange={(event) => {
                                setVerifyBundleDir(event.currentTarget.value);
                                invalidateVerify();
                            }}
                            mb="sm"
                        />
                        <QuickActions>
                            <Button onClick={runVerify} loading={verifyView.status === "loading"} disabled={resolveVerifyInputs() === undefined}>
                                Verify
                            </Button>
                        </QuickActions>
                        {verifyView.status === "error" && <ErrorState message={verifyView.message} />}
                        {verifyView.status === "load-error" && <ErrorState message={verifyView.error} />}
                        {verifyOutcome !== undefined && (
                            <div>
                                <OutcomeBanner
                                    color={OUTCOME_BANNER[verifyOutcome].color}
                                    icon={OUTCOME_BANNER[verifyOutcome].icon}
                                    title={OUTCOME_BANNER[verifyOutcome].title}
                                    errors={verifyResult?.errors ?? []}
                                    warnings={verifyResult?.warnings ?? []}
                                />
                                <QuickActions>
                                    <Button onClick={() => setActiveStep(3)}>Continue to Review diagnostics</Button>
                                </QuickActions>
                            </div>
                        )}
                    </div>
                ))}

            {activeStep === 3 &&
                (verifyResult === undefined ? (
                    <EmptyState message="Verify a round proof first." />
                ) : (
                    <div>
                        <OutcomeBanner
                            color={OUTCOME_BANNER[verifyOutcome ?? "invalid"].color}
                            icon={OUTCOME_BANNER[verifyOutcome ?? "invalid"].icon}
                            title={OUTCOME_BANNER[verifyOutcome ?? "invalid"].title}
                            errors={verifyResult.errors}
                            warnings={verifyResult.warnings}
                        />
                        <AdvancedDisclosure detail="raw verification issues">
                            <CodeBlock>{JSON.stringify({errors: verifyResult.errors, warnings: verifyResult.warnings}, null, 2)}</CodeBlock>
                        </AdvancedDisclosure>
                    </div>
                ))}
        </PageSection>
    );
}
