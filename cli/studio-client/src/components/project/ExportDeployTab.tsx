import {Badge, Button, Group, List, Text} from "@mantine/core";
import type {StudioDeploymentTargetSummary} from "../../api/types";
import {
    describeExportDeployTargetCards,
    type ExportDeployTargetCard,
    type ExportDeployTargetKind,
} from "../../domain/interpret/ExportDeployTargets";
import type {DeploymentTargetsListView} from "../../domain/interpret/Deployment";
import {describeProjectActionError} from "../../domain/projectActionError";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";

const GROUP_LABELS: Record<ExportDeployTargetKind, {legend: string; blurb: string}> = {
    outcomeLibrary: {
        legend: "Outcome libraries",
        blurb: "Generates or selects the canonical outcome library every other builder below reads from -- a build step in its own right, not a delivery target.",
    },
    staticExport: {
        legend: "Static export",
        blurb: "Writes a standalone, self-contained bundle to disk -- nothing is registered, nothing runs a delivery step.",
    },
    localAdapter: {
        legend: "Local adapter",
        blurb: "A registered External Adapter SDK target that writes a build artifact to this machine's own filesystem -- nothing leaves this machine.",
    },
    remoteDeployment: {
        legend: "Remote deployment",
        blurb: "A registered External Adapter SDK target whose own runtime adapter publishes somewhere other than this machine -- an extension point for a future real RGS/aggregator integration.",
    },
};

const GROUP_ORDER: readonly ExportDeployTargetKind[] = ["outcomeLibrary", "staticExport", "localAdapter", "remoteDeployment"];

// "Build locally"/"Configure & publish" are deliberately different labels for the same underlying
// hand-off (see onSelectDeploymentTarget below) -- a localAdapter card's own run only ever writes a build
// artifact to this machine, never anything a "Publish" label would misleadingly promise; "Publish" is
// reserved for a remoteDeployment card, which only ever exists here once a real target is registered
// (see ExportDeployTargets.ts's own REMOTE_DEPLOYMENT_PLACEHOLDER_CARD -- it carries no deploymentTarget,
// so it never reaches this button at all).
function describeTargetActionLabel(card: ExportDeployTargetCard): string {
    return card.kind === "localAdapter" ? "Build locally" : "Configure & publish";
}

function TargetCard({
    card,
    onSelectDeploymentTarget,
    onOpenStakeEngineExport,
    onOpenOutcomeLibraries,
}: {
    card: ExportDeployTargetCard;
    onSelectDeploymentTarget: (target: StudioDeploymentTargetSummary) => void;
    onOpenStakeEngineExport: () => void;
    onOpenOutcomeLibraries: () => void;
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
            {card.kind === "outcomeLibrary" && (
                <Button size="xs" mt="sm" onClick={onOpenOutcomeLibraries}>
                    Open Outcome Libraries
                </Button>
            )}
            {card.kind === "staticExport" && (
                <Button size="xs" mt="sm" onClick={onOpenStakeEngineExport}>
                    Open Stake Engine Export
                </Button>
            )}
            {card.deploymentTarget && (
                <Button size="xs" mt="sm" onClick={() => onSelectDeploymentTarget(card.deploymentTarget as StudioDeploymentTargetSummary)}>
                    {describeTargetActionLabel(card)}
                </Button>
            )}
        </div>
    );
}

// The sole Studio Build/Export surface -- lists every applicable target/builder this project's own
// resolved capabilities offer (see ProjectDashboardPage's own RUNTIME_CAPABLE_CAPABILITIES gate on this
// whole tab), grouped by what it actually does, and hands off to that builder's own existing pipeline:
// outcome-library generation (still StudioOutcomeLibraryGenerateService/OutcomeLibrariesTab), Stake
// Engine Export (still StudioStakeEngineExportService/StakeEngineExportTab), and every registered
// ExternalDeploymentTarget (still useDeploymentManager/DeploymentTab) -- none of those three pipelines is
// duplicated or merged here, see ExportDeployTargets.ts's own doc comment. A local adapter's own action
// is deliberately labelled "Build locally" (it only ever writes a build artifact to this machine) while
// "Publish" language ("Configure & publish") only ever appears for a remoteDeployment card, which only
// exists here once a real target is registered -- the placeholder shown while none is carries no
// deploymentTarget, so it renders no action at all (see describeTargetActionLabel above).
export function ExportDeployTab({
    targetsView,
    targetsError,
    onRefreshTargets,
    onSelectDeploymentTarget,
    onOpenStakeEngineExport,
    onOpenOutcomeLibraries,
}: {
    targetsView: DeploymentTargetsListView;
    targetsError: string | undefined;
    onRefreshTargets: () => void;
    onSelectDeploymentTarget: (target: StudioDeploymentTargetSummary) => void;
    onOpenStakeEngineExport: () => void;
    onOpenOutcomeLibraries: () => void;
}) {
    const deploymentTargets = targetsView.status === "loaded" ? targetsView.targets : [];
    const cards = describeExportDeployTargetCards(deploymentTargets);

    return (
        <div>
            <Text size="sm" c="dimmed" mb="sm">
                Every applicable way this project can be built or leave Studio, grouped by what it actually
                does -- generating an outcome library is the source build step every other target here reads
                from, a static export writes a standalone bundle with nothing registered, a local adapter
                writes a build artifact to this machine via the External Adapter SDK, and a remote deployment
                is that same SDK&apos;s own extension point for a future real RGS/aggregator integration.
                Choosing a card here jumps into that builder&apos;s own existing workflow, safely -- it never
                silently runs a build in the background.
            </Text>
            <QuickActions>
                <Button variant="default" size="xs" onClick={onRefreshTargets}>
                    Refresh registered targets
                </Button>
            </QuickActions>
            {targetsView.status === "loading" && <LoadingState label="Loading registered deployment targets…" />}
            {targetsError && <ErrorState message={describeProjectActionError("The deployment targets list", targetsError)} />}

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
                                    onOpenOutcomeLibraries={onOpenOutcomeLibraries}
                                />
                            ))
                        )}
                    </PageSection>
                );
            })}
        </div>
    );
}
