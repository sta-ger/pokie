import {Button, Group, Stack, Text, TextInput, type TextInputProps} from "@mantine/core";
import {useState} from "react";
import {browseFilesystem, checkNativePickerAvailability, pickNativePath} from "../../api/apiClient";
import type {StudioNativePickerFileFilter} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {setRememberedBrowseLocation} from "../../domain/rememberedBrowseLocation";
import {resolveBrowseStartLocation} from "../../domain/resolveBrowseStartLocation";
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
    // A stable id for this field's own use-case (e.g. "create-project-destination") -- unlocks the
    // "remembered type location" rung of resolveBrowseStartLocation's start-location precedence, and is
    // where a successful pick gets remembered back to. Omitted, that rung and the remembering are both
    // simply skipped.
    browseId?: string;
    // The currently open project's root, or any other directory the caller already knows is the most
    // relevant place for this field to start browsing from -- see resolveBrowseStartLocation.ts.
    relevantDirectory?: string;
    // Forwarded to the platform-default lookup's own `name` (Create Project's Documents/POKIE/<name>
    // suggestion) -- every other caller omits it.
    defaultLocationName?: string;
    fileFilters?: StudioNativePickerFileFilter[];
};

type HintState = {status: "idle"} | {status: "loading"} | {status: "ok"; text: string} | {status: "error"; message: string};

// A plain path TextInput plus a "Browse" action and a resolved-path hint fetched on focus -- so a bare
// "." (or any relative path) always has a concrete, current location shown alongside it instead of being
// opaque. Browse itself tries a real, system-native OS dialog first (see StudioNativePickerService) --
// the only way to get an actual filesystem path back, since a browser deliberately never exposes one --
// and only opens PathBrowseModal's honestly-labelled "Server filesystem browser" once the native dialog
// is confirmed unavailable (a headless/remote Studio server) or itself fails. A Cancel from either picker
// leaves the field untouched. The chosen start location (see resolveBrowseStartLocation.ts) is reused as
// the fallback modal's own initial location too, so falling back never loses that precedence.
export function PathInput({
    kind = "directory",
    browseTitle,
    onPathSelected,
    browseId,
    relevantDirectory,
    defaultLocationName,
    fileFilters,
    value,
    defaultValue,
    onFocus,
    ...rest
}: PathInputProps) {
    const fetchImpl = useStudioApi();
    const [modalOpened, setModalOpened] = useState(false);
    const [modalInitialPath, setModalInitialPath] = useState("");
    const [hint, setHint] = useState<HintState>({status: "idle"});
    const [browsing, setBrowsing] = useState(false);

    const currentValue = String(value ?? defaultValue ?? "");

    const resolveHint = (path: string): void => {
        setHint({status: "loading"});
        browseFilesystem(fetchImpl, path)
            .then((result) => {
                setHint(result.status === "ok" ? {status: "ok", text: result.displayPath} : {status: "error", message: result.error});
            })
            .catch((error: unknown) => setHint({status: "error", message: errorMessage(error)}));
    };

    const rememberAndSelect = (path: string): void => {
        onPathSelected(path);
        setHint({status: "ok", text: path});
        if (browseId) {
            setRememberedBrowseLocation(browseId, path);
        }
    };

    const handleBrowseClick = async (): Promise<void> => {
        setBrowsing(true);
        try {
            const startLocation = await resolveBrowseStartLocation({fetchImpl, currentValue, browseId, relevantDirectory, defaultLocationName});
            const availability = await checkNativePickerAvailability(fetchImpl);
            if (availability.status === "available") {
                const result = await pickNativePath(fetchImpl, {kind, startPath: startLocation, fileFilters});
                if (result.status === "selected") {
                    rememberAndSelect(result.path);
                    return;
                }
                if (result.status === "cancelled") {
                    return;
                }
                // "unavailable"/"error" falls through to the fallback modal below.
            }
            setModalInitialPath(startLocation ?? currentValue);
            setModalOpened(true);
        } catch {
            // A native-availability/pick request that itself fails to reach the server (offline, a
            // transient error) is treated the same as "unavailable" -- fall back to the modal rather
            // than leaving Browse looking like it did nothing.
            setModalInitialPath(currentValue);
            setModalOpened(true);
        } finally {
            setBrowsing(false);
        }
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
                <Button variant="default" onClick={handleBrowseClick} loading={browsing}>
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
                onSelect={rememberAndSelect}
                kind={kind}
                initialPath={modalInitialPath}
                title={browseTitle ?? (kind === "file" ? "Browse for a file" : "Browse for a directory")}
            />
        </Stack>
    );
}
