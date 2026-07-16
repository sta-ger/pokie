import {Anchor, Button, List} from "@mantine/core";
import type {ReportListView} from "../../domain/interpret/Reports";
import type {SimulationReportView} from "../../domain/interpret/Simulation";
import type {StudioSimulationReportListEntry} from "../../api/types";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {SimulationReportDisplay} from "../common/SimulationReportDisplay";

export type ReportDetailState = {status: "empty"} | {status: "loading"} | {status: "error"; message: string} | {status: "loaded"; report: SimulationReportView};

export function ReportsTab({
    listView,
    listError,
    onRefresh,
    onSelect,
    detail,
    downloadUrls,
    onBackToSimulation,
}: {
    listView: ReportListView;
    listError: string | undefined;
    onRefresh: () => void;
    onSelect: (entry: StudioSimulationReportListEntry) => void;
    detail: ReportDetailState;
    downloadUrls: {json: string; markdown: string; html: string} | undefined;
    onBackToSimulation: () => void;
}) {
    return (
        <div>
            <QuickActions>
                <Button variant="default" onClick={onRefresh}>
                    Refresh
                </Button>
            </QuickActions>
            {listError && <ErrorState message={listError} />}
            {listView.status === "empty" && <EmptyState message="No completed simulations yet." />}
            {listView.status === "loaded" && (
                <List listStyleType="none" spacing={4} mb="md">
                    {listView.entries.map((entry) => (
                        <List.Item key={entry.id}>
                            <Anchor component="button" type="button" onClick={() => onSelect(entry)}>
                                {entry.game.id} v{entry.game.version} — {entry.actualRounds}/{entry.requestedRounds} rounds, RTP {(entry.rtp * 100).toFixed(2)}%,{" "}
                                {new Date(entry.startedAt).toLocaleString()}
                                {entry.hasWarnings ? " (has warnings)" : ""}
                            </Anchor>
                        </List.Item>
                    ))}
                </List>
            )}

            <PageSection legend="Report">
                {detail.status === "empty" && <EmptyState message="Select a report from the list above." />}
                {detail.status === "loading" && <LoadingState />}
                {detail.status === "error" && <ErrorState message={detail.message} />}
                {detail.status === "loaded" && (
                    <div>
                        {downloadUrls && (
                            <QuickActions>
                                <Anchor href={downloadUrls.json} download>
                                    Download JSON
                                </Anchor>
                                <Anchor href={downloadUrls.markdown} download>
                                    Download Markdown
                                </Anchor>
                                <Anchor href={downloadUrls.html} download>
                                    Download HTML
                                </Anchor>
                                <Button variant="default" onClick={onBackToSimulation}>
                                    Back to Simulation parameters
                                </Button>
                            </QuickActions>
                        )}
                        <SimulationReportDisplay view={detail.report} />
                    </div>
                )}
            </PageSection>
        </div>
    );
}
