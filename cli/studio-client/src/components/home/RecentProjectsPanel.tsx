import {Anchor, Button, Table, Text} from "@mantine/core";
import {useCallback, useEffect, useState} from "react";
import {listRecentProjects} from "../../api/apiClient";
import type {StudioHomeRecentProjectView} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {formatTimestamp} from "../../domain/formatTimestamp";
import {describeRecentProjectsList, type HomeRecentProjectsListView} from "../../domain/interpret/Home";
import {useOpenProject} from "../../hooks/useOpenProject";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {QuickActions} from "../common/QuickActions";

type ViewState = {status: "loading"} | {status: "error"; message: string} | HomeRecentProjectsListView;

export function RecentProjectsPanel() {
    const fetchImpl = useStudioApi();
    const openAndNavigate = useOpenProject();
    const [view, setView] = useState<ViewState>({status: "loading"});

    const refresh = useCallback(() => {
        setView({status: "loading"});
        listRecentProjects(fetchImpl)
            .then((entries) => setView(describeRecentProjectsList(entries)))
            .catch((error: unknown) => setView({status: "error", message: errorMessage(error)}));
    }, [fetchImpl]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleOpen = (entry: StudioHomeRecentProjectView): void => {
        openAndNavigate(entry.projectRoot).catch((error: unknown) => setView({status: "error", message: errorMessage(error)}));
    };

    return (
        <div>
            <QuickActions>
                <Button variant="default" onClick={refresh} loading={view.status === "loading"}>
                    Refresh
                </Button>
            </QuickActions>

            {view.status === "loading" && <LoadingState />}
            {view.status === "error" && <ErrorState message={view.message} />}
            {view.status === "empty" && <EmptyState message="No recent projects yet." />}
            {view.status === "loaded" && (
                <Table.ScrollContainer minWidth={480}>
                    <Table>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Name</Table.Th>
                                <Table.Th>Path</Table.Th>
                                <Table.Th>Opened</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {view.entries.map((entry) => (
                                <Table.Tr key={entry.projectRoot}>
                                    <Table.Td>
                                        {entry.missing ? (
                                            <Text c="dimmed">{entry.name} (missing)</Text>
                                        ) : (
                                            <Anchor component="button" type="button" onClick={() => handleOpen(entry)}>
                                                {entry.name}
                                            </Anchor>
                                        )}
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed" style={{overflowWrap: "anywhere"}}>
                                            {entry.projectRoot}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>{formatTimestamp(entry.openedAt)}</Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            )}
        </div>
    );
}
