import {Button, Group, Stack, Text, TextInput, type TextInputProps} from "@mantine/core";
import {useState} from "react";
import {browseFilesystem} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {PathBrowseModal, type PathBrowseKind} from "./PathBrowseModal";

type PathInputProps = TextInputProps & {
    kind?: PathBrowseKind;
    browseTitle?: string;
    // Distinct from the ordinary Mantine form `onChange` this is spread alongside: Browse picks a value
    // programmatically (not by typing), which an *uncontrolled* Mantine form field (every Home form
    // uses `mode: "uncontrolled"`) can only reflect visually through `form.setFieldValue` -- the actual
    // DOM input never re-renders from `onChange` alone (see use-form's own `forceUpdate: false` on the
    // onChange it builds). Callers wire this straight to `form.setFieldValue(field, path)`.
    onPathSelected: (path: string) => void;
};

type HintState = {status: "idle"} | {status: "loading"} | {status: "ok"; text: string} | {status: "error"; message: string};

// A plain path TextInput plus a "Browse" action (PathBrowseModal, listing the server's own filesystem)
// and a resolved-path hint fetched on focus -- so a bare "." (or any relative path) always has a
// concrete, current location shown alongside it instead of being opaque.
export function PathInput({kind = "directory", browseTitle, onPathSelected, value, defaultValue, onFocus, ...rest}: PathInputProps) {
    const fetchImpl = useStudioApi();
    const [modalOpened, setModalOpened] = useState(false);
    const [hint, setHint] = useState<HintState>({status: "idle"});

    const currentValue = String(value ?? defaultValue ?? "");

    const resolveHint = (path: string): void => {
        setHint({status: "loading"});
        browseFilesystem(fetchImpl, path)
            .then((result) => {
                setHint(result.status === "ok" ? {status: "ok", text: result.displayPath} : {status: "error", message: result.error});
            })
            .catch((error: unknown) => setHint({status: "error", message: errorMessage(error)}));
    };

    return (
        <Stack gap={4}>
            <Group align="flex-end" gap="xs" wrap="nowrap">
                <TextInput
                    style={{flex: 1}}
                    onFocus={(event) => {
                        onFocus?.(event);
                        resolveHint(currentValue);
                    }}
                    {...rest}
                    value={value}
                    defaultValue={defaultValue}
                />
                <Button variant="default" onClick={() => setModalOpened(true)}>
                    Browse…
                </Button>
            </Group>
            {hint.status === "loading" && (
                <Text size="xs" c="dimmed">
                    Resolving…
                </Text>
            )}
            {hint.status === "ok" && (
                <Text size="xs" c="dimmed">
                    Resolves to: {hint.text}
                </Text>
            )}
            {hint.status === "error" && (
                <Text size="xs" c="red">
                    {hint.message}
                </Text>
            )}
            <PathBrowseModal
                opened={modalOpened}
                onClose={() => setModalOpened(false)}
                onSelect={(path) => {
                    onPathSelected(path);
                    setHint({status: "ok", text: path});
                }}
                kind={kind}
                initialPath={currentValue}
                title={browseTitle ?? (kind === "file" ? "Browse for a file" : "Browse for a directory")}
            />
        </Stack>
    );
}
