import {Badge, Button, Group, List, Text} from "@mantine/core";
import type {StudioDeploymentTargetSummary} from "../../api/types";
import {
    describeExportDeployTargetCards,
    type ExportDeployTargetCard,
    type ExportDeployTargetKind,
} from "../../domain/interpret/ExportDeployTargets";
import type {DeploymentTargetsListView} from "../../domain/interpret/Deployment";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";

const GROUP_LABELS: Record<ExportDeployTargetKind, {legend: string; blurb: string}> = {
    staticExport: {
        legend: "Static export",
        blurb: "Writes a standalone, self-contained bundle to disk -- nothing is registered, nothing runs a delivery step.",
    },
    localAdapter: {
        legend: "Local adapter",
        blurb: "A registered External Adapter SDK target that writes to this machine's own filesystem.",
    },
    remoteDeployment: {
        legend: "Remote deployment",
        blurb: "A registered External Adapter SDK target whose own runtime adapter delivers somewhere other than this machine -- an extension point for a future real RGS/aggregator integration.",
    },
};

const GROUP_ORDER: readonly ExportDeployTargetKind[] = ["staticExport", "localAdapter", "remoteDeployment"];

function TargetCard({
    card,
    onSelectDeploymentTarget,
    onOpenStakeEngineExport,
}: {
    card: ExportDeployTargetCard;
    onSelectDeploymentTarget: (target: StudioDeploymentTargetSummary) => void;
    onOpenStakeEngineExport: () => void;
}) {
    return (
        <div style={{marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid var(--mantine-color-default-border)"}}>
            <Group gap="xs" mb={4}>
                <Text fw={600}>{card.label}</Text>
                <Badge size="sm" color={card.locality === "local" ? "blue" : "grape"} variant="light">
                    {card.locality}
                </Badge>
            </Group>
            <Text size="sm">
                <Text span fw={600}>
                    Adapter:
                </Text>{" "}
                {card.adapter} (v{card.version})
            </Text>
            <Text size="sm" mt={4}>
                <Text span fw={600}>
                    Purpose:
                </Text>{" "}
                {card.purpose}
            </Text>
            <Text size="sm" mt={4}>
                <Text span fw={600}>
                    Destination:
                </Text>{" "}
                {card.destination}
            </Text>
            <Text size="sm" mt={4}>
                <Text span fw={600}>
                    Write / publish behavior:
                </Text>{" "}
                {card.writePublishBehavior}
            </Text>
            {card.capabilities.length > 0 && (
                <>
                    <Text size="sm" fw={600} mt={4}>
                        Capabilities
                    </Text>
                    <List size="sm" withPadding>
                        {card.capabilities.map((capability, index) => (
                            <List.Item key={index}>{capability}</List.Item>
                        ))}
                    </List>
                </>
            )}
            {card.limits.length > 0 && (
                <>
                    <Text size="sm" fw={600} mt={4}>
                        Limits
                    </Text>
                    <List size="sm" withPadding>
                        {card.limits.map((limit, index) => (
                            <List.Item key={index}>{limit}</List.Item>
                        ))}
                    </List>
                </>
            )}
            {card.prerequisites.length > 0 && (
                <>
                    <Text size="sm" fw={600} mt={4}>
                        Prerequisites
                    </Text>
                    <List size="sm" withPadding>
                        {card.prerequisites.map((prerequisite, index) => (
                            <List.Item key={index}>{prerequisite}</List.Item>
                        ))}
                    </List>
                </>
            )}
            <Text size="sm" mt={4}>
                <Text span fw={600}>
                    Compatibility:
                </Text>{" "}
                {card.compatibility}
            </Text>
            {card.kind === "staticExport" && (
                <Button size="xs" mt="sm" onClick={onOpenStakeEngineExport}>
                    Open Stake Engine Export
                </Button>
            )}
            {card.deploymentTarget && (
                <Button size="xs" mt="sm" onClick={() => onSelectDeploymentTarget(card.deploymentTarget as StudioDeploymentTargetSummary)}>
                    Select &amp; configure in Deployment
                </Button>
            )}
        </div>
    );
}

// The shared Export / Deploy target-selection shell -- a presentation-only layer over the project's two
// existing, independent pipelines (Stake Engine Export's own static exporter, and the External Adapter
// SDK's own registered-target pipeline via useDeploymentManager). Picking a card here never runs either
// pipeline itself: a Stake Engine Export card navigates straight to the (unchanged) Stake Engine Export
// tab, and a deployment-target card only pre-selects that target (useDeploymentManager.selectTarget)
// before navigating to the (unchanged) Deployment tab's own Select-target step. See
// ExportDeployTargets.ts's own doc comment for why the two backend pipelines are never merged.
export function ExportDeployTab({
    targetsView,
    targetsError,
    onRefreshTargets,
    onSelectDeploymentTarget,
    onOpenStakeEngineExport,
}: {
    targetsView: DeploymentTargetsListView;
    targetsError: string | undefined;
    onRefreshTargets: () => void;
    onSelectDeploymentTarget: (target: StudioDeploymentTargetSummary) => void;
    onOpenStakeEngineExport: () => void;
}) {
    const deploymentTargets = targetsView.status === "loaded" ? targetsView.targets : [];
    const cards = describeExportDeployTargetCards(deploymentTargets);

    return (
        <div>
            <Text size="sm" c="dimmed" mb="sm">
                Every way this project can leave Studio, grouped by what it actually does -- a static export
                writes a standalone bundle with nothing registered, a local adapter writes to this machine via
                the External Adapter SDK, and a remote deployment is that same SDK&apos;s own extension point for a
                future real RGS/aggregator integration. Choosing a card here jumps into that target&apos;s own
                existing workflow; it never runs a deploy or export itself.
            </Text>
            <QuickActions>
                <Button variant="default" size="xs" onClick={onRefreshTargets}>
                    Refresh registered targets
                </Button>
            </QuickActions>
            {targetsView.status === "loading" && <LoadingState label="Loading registered deployment targets…" />}
            {targetsError && <ErrorState message={targetsError} />}

            {GROUP_ORDER.map((kind) => {
                const groupCards = cards.filter((card) => card.kind === kind);
                return (
                    <PageSection key={kind} legend={GROUP_LABELS[kind].legend}>
                        <Text size="sm" c="dimmed" mb="sm">
                            {GROUP_LABELS[kind].blurb}
                        </Text>
                        {groupCards.length === 0 ? (
                            <EmptyState message="Nothing in this group yet." />
                        ) : (
                            groupCards.map((card) => (
                                <TargetCard
                                    key={card.id}
                                    card={card}
                                    onSelectDeploymentTarget={onSelectDeploymentTarget}
                                    onOpenStakeEngineExport={onOpenStakeEngineExport}
                                />
                            ))
                        )}
                    </PageSection>
                );
            })}
        </div>
    );
}
