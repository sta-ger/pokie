import {Alert, Badge, Button, Group, Table, Text, TextInput, Title} from "@mantine/core";
import {IconAlertTriangle} from "@tabler/icons-react";
import {useState} from "react";
import {sampleOutcomeSource} from "../../api/apiClient";
import type {OutcomeSourceSampleView} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {describeRoundArtifact} from "../../domain/interpret/Replay";
import type {ProjectHeaderView} from "../../domain/interpret/ProjectDashboard";
import {ErrorState} from "../common/ErrorState";
import {RoundArtifactInspector} from "../common/RoundArtifactInspector";

type OutcomeSourceHeader = Extract<ProjectHeaderView, {status: "outcome-source"}>;

// The Project Dashboard's dedicated view for a resolved "outcomeLibrary"/"stakeAdapter" project (see
// ProjectDashboard.ts's own "outcome-source" ProjectHeaderView variant) -- rendered directly by
// ProjectDashboardPage instead of through the ordinary capability-gated tab set, since neither project
// type ever gains RUNTIME_EXECUTE_CAPABILITY/BLUEPRINT_BUILD_CAPABILITY (none of Simulation/Replay/
// Runtime/Build-Export/etc. apply here at all). Shows the canonical reader's own descriptor/limitations
// and, per mode, its own precomputed exact analysis (never a re-derived/regenerated game-model
// calculation -- see CanonicalOutcomeSourceDescriptor's own doc comment). Only an "outcomeLibrary"
// project offers "Draw an outcome" -- see OUTCOME_SOURCE_SAMPLE_CAPABILITY's own doc comment for why a
// "stakeAdapter" export has no draw contract of its own; the route itself still enforces this (the
// structured diagnostic is rendered if the button is ever reached for a type that doesn't support it).
// "onRoundRecorded", when given, fires after every successful draw -- a sample draw passes through the
// same shared StudioRoundRecorder every other Studio tab's rounds do (see StudioServer's own outcome-
// source sample route), so a caller wired to it (ProjectDashboardPage, passing its own
// refreshRecentSpins) sees this draw in the Replay tab's "Session Spin" list without the user having to
// remember to click that list's own Refresh button.
export function OutcomeSourceOverview({header, onRoundRecorded}: {header: OutcomeSourceHeader; onRoundRecorded?: () => void}) {
    const fetchImpl = useStudioApi();
    const [seed, setSeed] = useState("");
    const [result, setResult] = useState<OutcomeSourceSampleView | undefined>(undefined);
    const [error, setError] = useState<string | undefined>(undefined);
    const [drawing, setDrawing] = useState(false);

    const {report} = header;
    const hasErrors = report.issues.some((issue) => issue.severity === "error");
    const canSample = header.capabilities.includes("outcomeSource.sample");

    const onDraw = (modeName: string) => {
        setDrawing(true);
        setError(undefined);
        sampleOutcomeSource(fetchImpl, modeName, seed.trim().length > 0 ? seed.trim() : undefined)
            .then((sampled) => {
                setResult(sampled);
                if (sampled.supported) {
                    onRoundRecorded?.();
                }
            })
            .catch((thrown: unknown) => setError(errorMessage(thrown)))
            .finally(() => setDrawing(false));
    };

    return (
        <div>
            <Title order={4}>Outcome Source</Title>
            <Group gap="xs" mt="xs">
                <Badge>{report.descriptor.kind === "native" ? "Native Outcome Library" : "Stake Engine Export"}</Badge>
                <Badge color={report.descriptor.streaming ? "teal" : "gray"}>{report.descriptor.streaming ? "streaming reader" : "reads source fully"}</Badge>
            </Group>

            {report.descriptor.limitations.length > 0 && (
                <Alert color="yellow" icon={<IconAlertTriangle size={16} />} title="Reader limitations" mt="sm">
                    <ul style={{margin: 0, paddingLeft: "1.2rem"}}>
                        {report.descriptor.limitations.map((limitation) => (
                            <li key={limitation}>{limitation}</li>
                        ))}
                    </ul>
                </Alert>
            )}

            {hasErrors && (
                <div style={{marginTop: "0.75rem"}}>
                    <ErrorState message={`${report.issues.filter((issue) => issue.severity === "error").length} issue(s) found while reading this source.`} />
                </div>
            )}

            {!hasErrors && (
                <Table mt="sm" data-testid="outcome-source-mode-table">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Mode</Table.Th>
                            <Table.Th>RTP</Table.Th>
                            <Table.Th>Hit frequency</Table.Th>
                            <Table.Th>Max win</Table.Th>
                            {canSample && <Table.Th></Table.Th>}
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {report.modes.map((mode) => (
                            <Table.Tr key={mode.modeName}>
                                <Table.Td>{mode.modeName}</Table.Td>
                                <Table.Td>{(mode.analysis.rtp * 100).toFixed(2)}%</Table.Td>
                                <Table.Td>{(mode.analysis.hitFrequency * 100).toFixed(2)}%</Table.Td>
                                <Table.Td>{mode.analysis.maxWin}</Table.Td>
                                {canSample && (
                                    <Table.Td>
                                        <Button size="xs" loading={drawing} onClick={() => onDraw(mode.modeName)}>
                                            Draw an outcome
                                        </Button>
                                    </Table.Td>
                                )}
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            )}

            {canSample && (
                <TextInput mt="sm" label="Seed (optional)" placeholder="deterministic seed" value={seed} onChange={(event) => setSeed(event.currentTarget.value)} style={{maxWidth: 320}} />
            )}

            {error && (
                <div style={{marginTop: "0.75rem"}}>
                    <ErrorState message={error} />
                </div>
            )}

            {result && result.supported && (
                <Alert color="teal" mt="sm" title={`Drew outcome "${result.selection.outcome.id}"`}>
                    <Text size="sm" mb="sm">
                        {`library "${result.selection.libraryId}" · weight ${result.selection.outcome.weight} of ${result.selection.totalWeight}`}
                    </Text>
                    {/* The drawn outcome's own round -- rendered through the same RoundArtifactInspector every
                        other "round we can inspect" surface (Replay, Session Spin) already uses, instead of a
                        page-local flat multiplier/total-win summary. A drawn outcome carries no content hash of
                        its own (see RoundArtifactDisplayView's own doc comment) and no session state to show
                        before/after it. */}
                    <RoundArtifactInspector artifact={describeRoundArtifact(result.selection.outcome.artifact)} />
                </Alert>
            )}

            {result && !result.supported && (
                <Alert color="orange" mt="sm" title="Not supported">
                    <Text size="sm">{result.diagnostic.message}</Text>
                </Alert>
            )}
        </div>
    );
}
