import {Button, Stack, Text} from "@mantine/core";
import type {BuildProjectView} from "../../domain/interpret/Home";
import {ErrorState} from "./ErrorState";
import {FileList} from "./FileList";
import {IssueList} from "./IssueList";
import {LoadingState} from "./LoadingState";

// Shared by Home's Build-from-Blueprint tab and the Blueprint Editor's own Build panel -- same
// reasoning as BuildPreviewDisplay.
export function BuildResultDisplay({view, onOpen}: {view: BuildProjectView; onOpen: () => void}) {
    if (view.status === "idle") {
        return null;
    }
    if (view.status === "loading") {
        return <LoadingState label="Working…" />;
    }
    if (view.status === "error" || view.status === "load-error" || view.status === "failed") {
        return <ErrorState message={view.message} />;
    }
    if (view.status === "invalid") {
        return <ErrorState message={`Blueprint is invalid — ${view.errors.length} error(s).`} />;
    }

    return (
        <Stack gap="sm">
            <Text style={{overflowWrap: "anywhere"}}>
                &quot;{view.manifest.name}&quot; (id: &quot;{view.manifest.id}&quot;, v{view.manifest.version}) built in &quot;
                {view.projectRoot}&quot;
                {view.unchanged ? " (unchanged — deterministic rebuild)." : "."}
            </Text>
            <IssueList title="Warnings" issues={view.warnings} />
            <FileList title="Created files" files={view.createdFiles} />
            <Button onClick={onOpen} style={{alignSelf: "flex-start"}}>
                Open in Studio
            </Button>
        </Stack>
    );
}
