import {Button, Group, Modal, ScrollArea, Stack, Text, UnstyledButton} from "@mantine/core";
import {IconArrowUp, IconFile, IconFolder} from "@tabler/icons-react";
import {useEffect, useState} from "react";
import {browseFilesystem} from "../../api/apiClient";
import type {StudioFsBrowseView} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {ErrorState} from "./ErrorState";
import {LoadingState} from "./LoadingState";

export type PathBrowseKind = "directory" | "file";

type PathBrowseModalProps = {
    opened: boolean;
    onClose: () => void;
    onSelect: (path: string) => void;
    kind: PathBrowseKind;
    initialPath: string;
    title: string;
};

function joinDisplayPath(resolvedPath: string, name: string): string {
    return resolvedPath.endsWith("/") || resolvedPath.endsWith("\\") ? `${resolvedPath}${name}` : `${resolvedPath}/${name}`;
}

// The "Browse" action's own picker -- lists a directory's immediate children (server-side, via GET
// /api/home/fs/browse) so a user can navigate the machine Studio is running on from the browser instead
// of typing an absolute path by hand. Cancel always closes without calling onSelect -- the caller's
// field is only ever touched by an explicit "Select this folder"/file click.
export function PathBrowseModal({opened, onClose, onSelect, kind, initialPath, title}: PathBrowseModalProps) {
    const fetchImpl = useStudioApi();
    const [browsePath, setBrowsePath] = useState<string | undefined>(undefined);
    const [view, setView] = useState<{status: "loading"} | {status: "loaded"; data: StudioFsBrowseView}>({status: "loading"});

    useEffect(() => {
        if (opened) {
            setBrowsePath(initialPath.trim().length > 0 ? initialPath : undefined);
        }
        // Only re-seeds the browsed location the moment the modal actually opens -- once opened,
        // navigating around must not keep snapping back to the field's current value.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened]);

    useEffect(() => {
        if (!opened) {
            return undefined;
        }
        let cancelled = false;
        setView({status: "loading"});
        browseFilesystem(fetchImpl, browsePath)
            .then((data) => {
                if (!cancelled) {
                    setView({status: "loaded", data});
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setView({status: "loaded", data: {status: "error", error: errorMessage(error), resolvedPath: browsePath ?? ""}});
                }
            });
        return () => {
            cancelled = true;
        };
    }, [opened, browsePath, fetchImpl]);

    const handleSelect = (path: string): void => {
        onSelect(path);
        onClose();
    };

    return (
        <Modal opened={opened} onClose={onClose} title={title} size="md">
            <Stack gap="sm">
                {view.status === "loading" && <LoadingState label="Loading directory…" />}
                {view.status === "loaded" && view.data.status === "error" && (
                    <>
                        <ErrorState message={view.data.error} />
                        <Button variant="default" size="xs" onClick={() => setBrowsePath(undefined)} style={{alignSelf: "flex-start"}}>
                            Go to Studio&apos;s working directory
                        </Button>
                    </>
                )}
                {view.status === "loaded" && view.data.status === "ok" && (
                    <>
                        <Text size="sm" ff="monospace">
                            Current location: {view.data.displayPath}
                        </Text>
                        <ScrollArea.Autosize mah={280}>
                            <Stack gap={2}>
                                {view.data.parentPath !== undefined && (
                                    <UnstyledButton onClick={() => setBrowsePath(view.data.status === "ok" ? view.data.parentPath : undefined)} p={4}>
                                        <Group gap="xs">
                                            <IconArrowUp size={16} />
                                            <Text size="sm">.. (up)</Text>
                                        </Group>
                                    </UnstyledButton>
                                )}
                                {view.data.entries
                                    .filter((entry) => entry.isDirectory || kind === "file")
                                    .map((entry) => (
                                        <UnstyledButton
                                            key={entry.name}
                                            p={4}
                                            onClick={() => {
                                                if (view.data.status !== "ok") {
                                                    return;
                                                }
                                                if (entry.isDirectory) {
                                                    setBrowsePath(joinDisplayPath(view.data.resolvedPath, entry.name));
                                                } else {
                                                    handleSelect(joinDisplayPath(view.data.displayPath, entry.name));
                                                }
                                            }}
                                        >
                                            <Group gap="xs">
                                                {entry.isDirectory ? <IconFolder size={16} /> : <IconFile size={16} />}
                                                <Text size="sm">{entry.name}</Text>
                                            </Group>
                                        </UnstyledButton>
                                    ))}
                                {view.data.entries.length === 0 && (
                                    <Text size="sm" c="dimmed">
                                        This directory is empty.
                                    </Text>
                                )}
                            </Stack>
                        </ScrollArea.Autosize>
                    </>
                )}

                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Cancel
                    </Button>
                    {kind === "directory" && view.status === "loaded" && view.data.status === "ok" && (
                        <Button onClick={() => handleSelect(view.data.status === "ok" ? view.data.displayPath : "")}>Select this folder</Button>
                    )}
                </Group>
            </Stack>
        </Modal>
    );
}
