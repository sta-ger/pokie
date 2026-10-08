import {Stack, Text} from "@mantine/core";
import type {BuildPreviewView} from "../../domain/interpret/Home";
import {ErrorState} from "./ErrorState";
import {FileList} from "./FileList";
import {IssueList} from "./IssueList";
import {LoadingState} from "./LoadingState";

// Shared by Home's Build-from-Blueprint tab and the Blueprint Editor's own Build panel --
// interpretHome.ts's describeBuildPreview already produces the exact same view shape for both call
// sites (StudioBlueprintService.previewBuild() and StudioHomeService.previewBuild() return identical
// DTOs), see the old dom.ts's renderBuildPreview/renderBlueprintBuildPreview pair.
export function BuildPreviewDisplay({view}: {view: BuildPreviewView}) {
    if (view.status === "idle") {
        return null;
    }
    if (view.status === "loading") {
        return <LoadingState label="Working…" />;
    }
    if (view.status === "error" || view.status === "load-error") {
        return <ErrorState message={view.message} />;
    }

    let destinationLabel = " (new or empty directory)";
    if (view.status === "ok") {
        if (view.destinationState === "missing") destinationLabel = " (new directory)";
        else if (view.destinationState === "empty") destinationLabel = " (existing empty directory)";
        else if (view.destinationHasContent) destinationLabel = " (unavailable)";
    }

    return (
        <Stack gap="sm">
            <Text fw={600}>Preview</Text>
            <Text size="xs" c="dimmed">
                Preview only — nothing is written to disk yet.
            </Text>
            <IssueList title="Warnings" issues={view.warnings} />
            {view.status === "invalid" ? (
                <IssueList title="Errors" issues={view.errors} />
            ) : (
                <Stack gap={4}>
                    <Text size="sm">
                        Game: {view.manifest.name} (id: &quot;{view.manifest.id}&quot;, v{view.manifest.version})
                    </Text>
                    <Text size="sm">
                        Reels x rows: {view.reels} x {view.rows}
                    </Text>
                    <Text size="sm">Symbols: {view.symbolsCount}</Text>
                    <Text size="sm" style={{overflowWrap: "anywhere"}}>
                        Blueprint hash: {view.blueprintHash}
                    </Text>
                    <Text size="sm" style={{overflowWrap: "anywhere"}}>
                        Destination: {view.projectRoot}
                        {destinationLabel}
                    </Text>
                    {(view.destinationHasContent || view.destinationError !== undefined) && (
                        <ErrorState message={view.destinationError ?? `"${view.projectRoot}" already has content. Choose a new or empty output directory using the editable path or Browse, then retry. Existing files will stay unchanged.`} />
                    )}
                    <FileList title="Files to create" files={view.createFiles} />
                    <FileList title="Files to update" files={view.updateFiles} />
                    <FileList title="Files to delete" files={view.deleteFiles} />
                </Stack>
            )}
        </Stack>
    );
}
