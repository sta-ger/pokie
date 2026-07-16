import {Stack, Text} from "@mantine/core";
import type {BuildPreviewView} from "../../domain/interpret/Home";
import {ErrorState} from "./ErrorState";
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

    return (
        <Stack gap="sm">
            <Text fw={600}>Preview</Text>
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
                        Would generate: {view.expectedFiles.join(", ")}
                    </Text>
                </Stack>
            )}
        </Stack>
    );
}
