import {Button, Stack, Text} from "@mantine/core";
import {formatTimestamp} from "../../domain/formatTimestamp";
import type {BuildProjectView} from "../../domain/interpret/Home";
import {ErrorState} from "./ErrorState";
import {FileList} from "./FileList";
import {IssueList} from "./IssueList";
import {LoadingState} from "./LoadingState";
import {QuickActions} from "./QuickActions";

// Shared by Home's Build-from-Blueprint tab and the Blueprint Editor's own Build panel -- same
// reasoning as BuildPreviewDisplay. `onOpenFolder` is optional -- omitted entirely (rather than a
// disabled button), the "Open output folder" action simply doesn't render, since a caller with no way
// to open a folder (no server-side wiring at all) has nothing more honest to offer than not showing the
// button.
export function BuildResultDisplay({view, onOpen, onOpenFolder}: {view: BuildProjectView; onOpen: () => void; onOpenFolder?: () => void}) {
    if (view.status === "idle") {
        return null;
    }
    if (view.status === "loading") {
        return <LoadingState label="Working…" />;
    }
    if (view.status === "error" || view.status === "load-error" || view.status === "failed") {
        return <ErrorState message={view.message} detail={view.status === "error" ? view.detail : undefined} />;
    }
    if (view.status === "invalid") {
        return <ErrorState message={`Blueprint is invalid — ${view.errors.length} error(s).`} />;
    }

    return (
        <Stack gap="sm">
            <Text style={{overflowWrap: "anywhere"}}>
                &quot;{view.manifest.name}&quot; (id: &quot;{view.manifest.id}&quot;, v{view.manifest.version}) built at {formatTimestamp(view.buildInfo.generatedAt)} in
                &quot;{view.projectRoot}&quot;.
            </Text>
            <Text size="xs" c="dimmed" style={{overflowWrap: "anywhere"}}>
                Blueprint hash: {view.buildInfo.blueprintHash}
            </Text>
            <IssueList title="Warnings" issues={view.warnings} />
            <FileList title="Created files" files={view.createdFiles} />
            <QuickActions>
                <Button onClick={onOpen}>Open in Studio</Button>
                {onOpenFolder && (
                    <Button variant="default" onClick={onOpenFolder}>
                        Open output folder
                    </Button>
                )}
            </QuickActions>
        </Stack>
    );
}
