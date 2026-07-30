import {Button, Group, Stack, Text, TextInput, type TextInputProps} from "@mantine/core";
import {useState} from "react";
import {browseFilesystem, checkNativePickerAvailability, pickNativePath} from "../../api/apiClient";
import type {StudioFsBrowseErrorReason, StudioNativePickerFileFilter} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
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
    // What a blank field actually resolves to once submitted as `undefined` -- e.g. Build's own
    // "<project root>/<manifest.id>" default output directory. Resolved the same way a typed value
    // would be (relative to `relevantDirectory`/Studio's root), so the blank-field hint shows the real
    // destination the action will use instead of just that root, which is merely where resolution
    // *starts*, not necessarily where the action writes. Omitted entirely (every caller whose blank
    // value genuinely does resolve to that root, e.g. Init Project's own "current directory" default),
    // the hint falls back to the root itself -- unchanged prior behavior.
    autoDestinationPath?: string;
};

type HintState =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "ok"; text: string; auto: boolean}
    // "network" isn't a StudioFsBrowseErrorReason at all -- it's what this component reports itself when
    // the browse request never made it back with a structured result to begin with (the fetch rejected).
    | {status: "error"; reason: StudioFsBrowseErrorReason | "network"; path: string};

type PathIssue = {status: string; remediation: string};

// Subject-specific status/remediation copy for each resolver outcome -- deliberately never forwards the
// backend's own `error` string (an ENOENT/EACCES/JSON message meant for logs, not this field's own user),
// so every state the resolver can report reads as an actionable, POKIE-authored sentence instead. `path`
// is the resolver's own `resolvedPath` (safe, already-structured data -- the same value an "ok" hint shows)
// -- never the raw message.
// `type` is the one reason whose copy depends on which kind of control raised it -- a directory control
// handed a file, and a file control handed a directory, are both `reason: "type"` (see
// StudioFsBrowseService.browse's own doc comment), so only the caller's own `kind` can tell the two
// mismatches apart and word the remediation for the control actually on screen.
const PATH_ISSUE_COPY: Record<StudioFsBrowseErrorReason, (path: string, kind: PathBrowseKind) => PathIssue> = {
    absent: (path) => ({status: `"${path}" doesn't exist.`, remediation: "Check the path, or use Browse to pick an existing location."}),
    type: (path, kind) =>
        kind === "file"
            ? {status: `"${path}" is a folder, not a file.`, remediation: "Point this at a file instead, or use Browse to pick one."}
            : {status: `"${path}" is a file, not a folder.`, remediation: "Point this at a folder instead, or use Browse to pick one."},
    permission: (path) => ({status: `POKIE doesn't have permission to read "${path}".`, remediation: "Choose a location you have access to."}),
    unresolved: (path) => ({status: `"${path}" is a broken link and can't be resolved.`, remediation: "Point this at a different location."}),
    "symlink-escape": (path) => ({status: `"${path}" leads outside the project through a linked folder.`, remediation: "Choose a location inside the project."}),
    other: (path) => ({status: `"${path}" can't be used.`, remediation: "Choose a different location, or use Browse to pick one."}),
};

const NETWORK_PATH_ISSUE: PathIssue = {status: "Couldn't check this location.", remediation: "Confirm POKIE Studio's server is reachable, then try again."};

function describePathIssue(reason: StudioFsBrowseErrorReason | "network", path: string, kind: PathBrowseKind): PathIssue {
    return reason === "network" ? NETWORK_PATH_ISSUE : PATH_ISSUE_COPY[reason](path, kind);
}

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
    autoDestinationPath,
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

    // A blank field has nothing of the user's own to "resolve" -- what it shows is wherever an omitted/
    // default value would actually land (e.g. Build's own "use the project's default output directory"),
    // so the hint is worded as "Auto resolved destination" rather than "Resolves to", which would wrongly
    // imply the empty string itself was resolved. Every other value (a relative path, a bare ".", an
    // already-absolute path) really is the user's own input being resolved, hence "Resolves to". A blank
    // field with a caller-supplied `autoDestinationPath` resolves *that* instead of the blank string
    // itself -- see its own doc comment for why (the root a blank string resolves to isn't necessarily
    // where the action actually writes).
    const resolveHint = (path: string): void => {
        const auto = path.trim().length === 0;
        const target = auto && autoDestinationPath && autoDestinationPath.trim().length > 0 ? autoDestinationPath : path;
        setHint({status: "loading"});
        browseFilesystem(fetchImpl, target, relevantDirectory, kind)
            .then((result) => {
                setHint(result.status === "ok" ? {status: "ok", text: result.resolvedPath, auto} : {status: "error", reason: result.reason, path: result.resolvedPath});
            })
            .catch(() => setHint({status: "error", reason: "network", path: target}));
    };

    const rememberAndSelect = (path: string): void => {
        onPathSelected(path);
        setHint({status: "ok", text: path, auto: false});
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
                    {hint.auto ? "Auto resolved destination" : "Resolves to"}: {hint.text}
                </Text>
            )}
            {hint.status === "error" &&
                (() => {
                    const issue = describePathIssue(hint.reason, hint.path, kind);
                    return (
                        <Stack gap={0}>
                            <Text size="xs" c="red">
                                {issue.status}
                            </Text>
                            <Text size="xs" c="dimmed">
                                {issue.remediation}
                            </Text>
                        </Stack>
                    );
                })()}
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
