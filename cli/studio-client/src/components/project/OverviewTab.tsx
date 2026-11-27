import {AdvancedValidationPanel} from "../common/AdvancedValidationPanel";
import {Button, Table, Text} from "@mantine/core";
import {useState} from "react";
import type {StudioProjectOrigin} from "../../api/types";
import {
    BLUEPRINT_BUILD_CAPABILITY,
    describeProjectType,
    OUTCOME_LIBRARY_GENERATE_CAPABILITY,
    RUNTIME_EXECUTE_CAPABILITY,
    type ProjectHeaderView,
    type ProjectValidationView,
} from "../../domain/interpret/ProjectDashboard";
import {describeProjectActionError} from "../../domain/projectActionError";
import {CollapsiblePageSection} from "../common/CollapsiblePageSection";
import {ProjectValidationScopeBadges} from "../common/ValidationScopeBadges";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {LoadingState} from "../common/LoadingState";
import {NextStepCallout} from "../common/NextStepCallout";
import {QuickActions} from "../common/QuickActions";
import {ExactMathPanel} from "./ExactMathPanel";
import {ProducerSummary} from "./ProducerSummary";
import {VolatilityBandsControl} from "../common/VolatilityBandsControl";
import {hasFeatureTerminationWarning, type ProjectMathStatus} from "../../domain/validationScope";
import type {ExactMathSummary} from "../../domain/exactMathSummary";

function describeAddedToStudio(origin: StudioProjectOrigin | undefined): string {
    if (origin === "managed") {
        return "Created in Studio";
    }
    return "Added from your computer";
}

// Validation's own diagnostics, folded into Overview instead of a separate "Validate" section --
// ProjectDashboardPage runs this automatically once a project finishes loading (and again on demand
// via `onRevalidate`), so a visitor sees the project's current health without an extra click. Mirrors
// the removed ValidationTab's own rendering, minus its own standalone "Run Validate" entry point (this
// one lives inline, next to everything else Overview already reports).
function describeValidationSummary(view: ProjectValidationView, mathStatus: ProjectMathStatus, exactMathSupported: boolean): string {
    if (view.status === "idle" || view.status === "loading") return "Checking project…";
    if (view.status === "error") return "Validation could not be completed.";
    if (view.summary.advanced?.structuralValid === null) return "The design check is inconclusive. Review the analysis limits and retry.";
    if (view.summary.hasIssues) return `${view.summary.valid ? "Structure valid, with warnings" : "Structure invalid"} — ${view.summary.errors.length} error(s), ${view.summary.warnings.length} warning(s).`;
    if (!exactMathSupported) return "Structure valid — exact math is unavailable for this package; use Simulation.";
    if (view.status === "success" && hasFeatureTerminationWarning(view.summary.advanced)) return "Structure valid — math warning: uncapped free games.";
    if (mathStatus === "ok") return "Structure valid — exact outcome table available; certification is still separate.";
    if (mathStatus === "stale") return "Structure valid — exact outcome table is stale.";
    if (mathStatus === "error") return "Structure valid — exact outcome table unavailable.";
    if (mathStatus === "loading") return "Structure valid — reading exact outcome table…";
    return "Structure valid — no exact outcome table yet.";
}

function ValidationDiagnostics({view, onRevalidate}: {view: ProjectValidationView; onRevalidate: () => void}) {
    const terminal = view.status === "success" ? "completed" : view.status;
    return (
        <div
            role="status"
            aria-live="polite"
            tabIndex={-1}
            data-pokie-lifecycle-result="project-validation"
            data-pokie-lifecycle-result-control="project-validation-run"
            data-pokie-lifecycle-terminal={terminal}
        >
            {(view.status === "idle" || view.status === "loading") && <LoadingState label="Checking project…" />}
            {view.status === "error" && <ErrorState message={describeProjectActionError("This validation check", view.message)} />}
            {view.status === "success" && (
                <div>
                    <IssueList title="Errors" issues={view.summary.errors} />
                    <IssueList title="Warnings" issues={view.summary.warnings} />
                    <IssueList title="Integrity information" issues={view.summary.information} />
                    <AdvancedValidationPanel report={view.summary.advanced} />
                </div>
            )}
            <QuickActions>
                <Button
                    id="project-validation-run"
                    variant="default"
                    size="xs"
                    data-pokie-lifecycle="operation"
                    data-pokie-transaction-state="read-only-operation"
                    data-pokie-lifecycle-operation="project-validation"
                    onClick={onRevalidate}
                    loading={view.status === "loading"}
                >
                    Re-check project
                </Button>
            </QuickActions>
        </div>
    );
}

// The Project Dashboard's landing section starts with a concrete, non-wizard workflow for a playable
// project, then reports what that project *is* (id/name/version, format, where it was added from, location,
// and whether it can be edited) alongside its current validation state. A resolved Project can be
// a "blueprint" (a single JSON file, no package.json of its own) just as easily as a "tsPackage", so
// the facts table only shows fields every resolved ProjectType actually has.
export function OverviewTab({
    header,
    validation,
    onRevalidate,
    onOpenPlay,
    onOpenSimulation,
    sourceRevision,
    exactMathRefreshKey,
    autoComputeExactMath,
    autoRefreshStaleExactMath,
    onExactMathGenerated,
}: {
    header: Extract<ProjectHeaderView, {status: "loaded"}>;
    validation: ProjectValidationView;
    onRevalidate: () => void;
    onOpenPlay: () => void;
    onOpenSimulation: () => void;
    /** Changes whenever an optimization commit changes the saved design, so exact math is refreshed. */
    sourceRevision?: string;
    /** Monotonic local token for saves that cannot report a new source revision. */
    exactMathRefreshKey?: number;
    /** Continue a draft exact-math preview by computing the saved project's own table on first load. */
    autoComputeExactMath?: boolean;
    /** Recompute a stale table once after any successful save/apply, instead of making the user hunt for the button. */
    autoRefreshStaleExactMath?: number;
    /** Called after exact-math generation completes, so sibling panels can refresh their RTP hint. */
    onExactMathGenerated?: () => void;
}) {
    const editable = header.capabilities.includes(BLUEPRINT_BUILD_CAPABILITY);
    const playable = editable || header.capabilities.includes(RUNTIME_EXECUTE_CAPABILITY);
    const canGenerateExact = header.capabilities.includes(OUTCOME_LIBRARY_GENERATE_CAPABILITY);
    const [exactMathStatus, setExactMathStatus] = useState<ProjectMathStatus>(header.type === "wasm" || !canGenerateExact ? "missing" : "loading");
    const [exactSummary, setExactSummary] = useState<ExactMathSummary>();

    return (
        <div>
            <div style={{marginBottom: "var(--mantine-spacing-sm)"}}>
                <VolatilityBandsControl compact />
            </div>
            {/* A producer reads whole-round behaviour first. The exact card below remains the proven
                paid-spin reference; this summary defaults to the latest current simulation so the first
                metrics on the page are the ones a player actually experiences. */}
            <ProducerSummary
                projectRoot={header.projectRoot}
                refreshKey={exactMathRefreshKey}
                onOpenSimulation={onOpenSimulation}
                exact={exactSummary}
            />
            {header.type !== "wasm" && canGenerateExact && <ExactMathPanel projectRoot={header.projectRoot} sourceRevision={sourceRevision} refreshKey={exactMathRefreshKey} autoRefreshStale={autoRefreshStaleExactMath} featureCheck={validation.status === "success" ? validation.summary.advanced : undefined} autoCompute={autoComputeExactMath} onGenerated={onExactMathGenerated} onStatusChange={setExactMathStatus} onSummaryChange={setExactSummary} onOpenPlay={playable ? onOpenPlay : undefined} />}
            {header.type !== "wasm" && !canGenerateExact && (
                <Text size="sm" c="dimmed" mb="md" data-pokie-exact-math-unavailable>
                    Exact math is unavailable for this package: its entry module does not implement{" "}
                    <code>createExactEnumerationSession()</code>. Use Simulation for a sampled estimate, or open a
                    Blueprint Project to author and enumerate a supported model.
                </Text>
            )}
            {playable && header.type === "wasm" && (
                <NextStepCallout
                    title="Start by playing a round"
                    description={`Spin a real round. ${editable ? "Edit the saved layout, symbols, reels, paytable and bets in Game design." : "Game design is read-only for this package; open the original game design to change it."} Exact math enumerates; Simulation samples.`}
                    actionLabel="Open Play"
                    onAction={onOpenPlay}
                />
            )}
            <Table className="studio-metadata" aria-label="Project facts" withRowBorders={false} mb="md">
                <Table.Tbody>
                    <Table.Tr>
                        <Table.Th>ID</Table.Th>
                        <Table.Td>{header.id}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Version</Table.Th>
                        <Table.Td>{header.version}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Game format</Table.Th>
                        <Table.Td>{header.type ? describeProjectType(header.type as Exclude<typeof header.type, "wasm">) : "Unknown"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Added to Studio</Table.Th>
                        <Table.Td>{describeAddedToStudio(header.origin)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Location</Table.Th>
                        <Table.Td className="studio-technical-text" style={{overflowWrap: "anywhere"}}>{header.projectRoot}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Editable</Table.Th>
                        <Table.Td>{editable ? "Editable — you can change this game in Studio." : "Read-only — this game can't be changed directly in Studio."}</Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>

            <div style={{marginBottom: "var(--mantine-spacing-sm)"}}>
                <ProjectValidationScopeBadges view={validation} mathStatus={exactMathStatus} exactMathSupported={canGenerateExact} />
            </div>
            <CollapsiblePageSection
                key={validation.status === "success" && !validation.summary.hasIssues && !(validation.status === "success" && hasFeatureTerminationWarning(validation.summary.advanced)) ? "collapsed" : "expanded"}
                legend="Validation"
                summary={describeValidationSummary(validation, exactMathStatus, canGenerateExact)}
                defaultOpened={validation.status !== "success" || (validation.status === "success" && (validation.summary.hasIssues || hasFeatureTerminationWarning(validation.summary.advanced)))}
            >
                <Text size="md" c="dimmed" mb="sm">The structural check covers the project format. It does not establish mathematical balance or certification. Math is checked separately through exact math and simulation.</Text>
                <ValidationDiagnostics view={validation} onRevalidate={onRevalidate} />
            </CollapsiblePageSection>
        </div>
    );
}
