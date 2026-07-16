import {Anchor, Button, List, Text, TextInput} from "@mantine/core";
import type {StudioDeploymentModeInput, StudioDeploymentTargetSummary} from "../../api/types";
import type {DeploymentRunResultView, DeploymentTargetsListView} from "../../domain/interpret/Deployment";
import {useConfirm} from "../../hooks/useConfirm";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";

function TargetsList({
    view,
    selectedTargetId,
    onSelect,
}: {
    view: DeploymentTargetsListView;
    selectedTargetId: string | undefined;
    onSelect: (target: StudioDeploymentTargetSummary) => void;
}) {
    if (view.status === "empty") {
        return <EmptyState message="No deployment targets registered." />;
    }
    return (
        <List listStyleType="none" spacing="sm">
            {view.targets.map((target) => (
                <List.Item key={target.id}>
                    <Text fw={600}>
                        {target.id} (v{target.version})
                    </Text>
                    {target.requirements.minPokieVersion && <Text size="sm">Min pokie version: {target.requirements.minPokieVersion}</Text>}
                    {target.requirements.symbolAlphabet && <Text size="sm">Symbol alphabet: {target.requirements.symbolAlphabet}</Text>}
                    {target.requirements.requiresHomogeneousProvenance && <Text size="sm">Requires homogeneous provenance</Text>}
                    {target.capabilities.length > 0 && <Text size="sm">Capabilities: {target.capabilities.join(", ")}</Text>}
                    <Button size="xs" variant={target.id === selectedTargetId ? "filled" : "default"} onClick={() => onSelect(target)}>
                        {target.id === selectedTargetId ? "Selected" : "Select"}
                    </Button>
                </List.Item>
            ))}
        </List>
    );
}

export function DeploymentTab({
    targetsView,
    targetsError,
    onRefreshTargets,
    selectedTarget,
    onSelectTarget,
    modes,
    onUpdateMode,
    onAddMode,
    onRemoveMode,
    onPreview,
    onDeploy,
    runResult,
    runError,
    runLoading,
    selectedArtifactPath,
    onSelectArtifact,
}: {
    targetsView: DeploymentTargetsListView;
    targetsError: string | undefined;
    onRefreshTargets: () => void;
    selectedTarget: StudioDeploymentTargetSummary | undefined;
    onSelectTarget: (target: StudioDeploymentTargetSummary) => void;
    modes: StudioDeploymentModeInput[];
    onUpdateMode: (index: number, patch: Partial<StudioDeploymentModeInput>) => void;
    onAddMode: () => void;
    onRemoveMode: (index: number) => void;
    onPreview: () => void;
    onDeploy: () => void;
    runResult: DeploymentRunResultView | undefined;
    runError: string | undefined;
    runLoading: boolean;
    selectedArtifactPath: string | undefined;
    onSelectArtifact: (path: string) => void;
}) {
    const confirm = useConfirm();
    const selectedArtifact = runResult?.artifacts.find((artifact) => artifact.relativePath === selectedArtifactPath);

    return (
        <div>
            <Text size="sm" c="dimmed" mb="sm">
                Deploys a canonical outcome library to a registered external deployment target via the pokie package&apos;s
                own External Adapter SDK. &quot;Check &amp; Preview&quot; runs the full pipeline (compatibility check,
                projection, generation, artifact validation, diagnostic) without writing anything; &quot;Deploy&quot;
                additionally publishes the generated artifacts to the target.
            </Text>

            <PageSection legend="Registered Targets">
                <QuickActions>
                    <Button variant="default" onClick={onRefreshTargets}>
                        Refresh
                    </Button>
                </QuickActions>
                {targetsError && <ErrorState message={targetsError} />}
                <TargetsList view={targetsView} selectedTargetId={selectedTarget?.id} onSelect={onSelectTarget} />
            </PageSection>

            <PageSection legend="Deploy">
                {selectedTarget === undefined ? (
                    <Text size="sm" c="dimmed">
                        Select a target above first.
                    </Text>
                ) : (
                    <Text size="sm" mb="sm">
                        Target: <strong>{selectedTarget.id}</strong>
                    </Text>
                )}

                {modes.map((mode, index) => (
                    <QuickActions key={index}>
                        <TextInput
                            label="Mode name"
                            value={mode.modeName}
                            onChange={(event) => onUpdateMode(index, {modeName: event.currentTarget.value})}
                        />
                        <TextInput
                            label="Library path"
                            value={mode.libraryPath}
                            onChange={(event) => onUpdateMode(index, {libraryPath: event.currentTarget.value})}
                        />
                        <Button variant="subtle" color="red" onClick={() => onRemoveMode(index)}>
                            Remove
                        </Button>
                    </QuickActions>
                ))}
                <QuickActions>
                    <Button variant="default" onClick={onAddMode}>
                        Add mode
                    </Button>
                </QuickActions>

                <QuickActions>
                    <Button variant="default" onClick={onPreview} disabled={selectedTarget === undefined || runLoading}>
                        Check &amp; Preview
                    </Button>
                    <Button
                        disabled={selectedTarget === undefined || runLoading}
                        onClick={() =>
                            selectedTarget &&
                            confirm(`Deploy to "${selectedTarget.id}"? This writes the generated artifacts to the target's own output location.`, onDeploy)
                        }
                    >
                        Deploy
                    </Button>
                </QuickActions>
            </PageSection>

            {runLoading && <LoadingState label="Running…" />}
            {runError && <ErrorState message={runError} />}
            {runResult === undefined && !runLoading && <EmptyState message="No deployment has been run yet." />}

            {runResult && (
                <div>
                    <PageSection legend="Pipeline stages">
                        <List size="sm">
                            {runResult.stages.map((stage) => (
                                <List.Item key={stage.key}>
                                    {stage.label}: {stage.status}
                                    {stage.issues.length > 0 && (
                                        <List size="sm" withPadding>
                                            {stage.issues.map((issue, index) => (
                                                <List.Item key={index}>
                                                    {issue.severity}: {issue.message}
                                                </List.Item>
                                            ))}
                                        </List>
                                    )}
                                </List.Item>
                            ))}
                        </List>
                    </PageSection>

                    <PageSection legend="Generated artifacts">
                        {runResult.artifacts.length === 0 ? (
                            <EmptyState message="No artifacts were generated." />
                        ) : (
                            <List listStyleType="none" spacing={4}>
                                {runResult.artifacts.map((artifact) => (
                                    <List.Item key={artifact.relativePath}>
                                        <Anchor
                                            component="button"
                                            type="button"
                                            onClick={() => onSelectArtifact(artifact.relativePath)}
                                            style={{overflowWrap: "anywhere", whiteSpace: "normal", textAlign: "left"}}
                                        >
                                            {artifact.relativePath}
                                        </Anchor>
                                    </List.Item>
                                ))}
                            </List>
                        )}
                        {selectedArtifact && (
                            <div>
                                <Text fw={600} size="sm" mt="sm" style={{overflowWrap: "anywhere"}}>
                                    {selectedArtifact.relativePath}
                                </Text>
                                <CodeBlock>{selectedArtifact.content}</CodeBlock>
                            </div>
                        )}
                    </PageSection>

                    {runResult.publish && (
                        <Text size="sm">{runResult.delivered ? "Delivered." : "Not delivered."}</Text>
                    )}
                </div>
            )}
        </div>
    );
}
