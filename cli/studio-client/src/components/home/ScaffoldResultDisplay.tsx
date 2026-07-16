import {Button, Stack, Text} from "@mantine/core";
import type {ScaffoldActionView} from "../../domain/interpret/Home";
import {ErrorState} from "../common/ErrorState";
import {FileList} from "../common/FileList";
import {LoadingState} from "../common/LoadingState";

// Shared by Create Project and Init Project -- their ScaffoldActionView shapes are identical (see
// interpretHome.ts's own doc comment); Init additionally shows updated/skipped file lists, Create
// additionally shows a "next steps" hint (see the old dom.ts's renderCreateResult/renderInitResult).
export function ScaffoldResultDisplay({
    view,
    onOpen,
    showUpdatedAndSkipped = false,
    nextStepsHint,
}: {
    view: ScaffoldActionView;
    onOpen: () => void;
    showUpdatedAndSkipped?: boolean;
    nextStepsHint?: string;
}) {
    if (view.status === "idle") {
        return null;
    }
    if (view.status === "loading") {
        return <LoadingState label="Creating…" />;
    }
    if (view.status === "error" || view.status === "failed") {
        return <ErrorState message={view.message} />;
    }

    return (
        <Stack gap="sm">
            <Text>
                &quot;{view.manifest.name}&quot; (id: &quot;{view.manifest.id}&quot;, v{view.manifest.version}) at &quot;{view.projectRoot}
                &quot;.
            </Text>
            <FileList title="Created files" files={view.createdFiles} />
            {showUpdatedAndSkipped && (
                <>
                    <FileList title="Updated files" files={view.updatedFiles} />
                    <FileList title="Skipped (already existed)" files={view.skippedFiles} />
                </>
            )}
            {nextStepsHint && (
                <Text size="sm" c="dimmed">
                    {nextStepsHint}
                </Text>
            )}
            <Button onClick={onOpen} style={{alignSelf: "flex-start"}}>
                Open in Studio
            </Button>
        </Stack>
    );
}
