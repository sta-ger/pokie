import {Anchor, Badge, Button, Group, Table, Text, TextInput} from "@mantine/core";
import {useCallback, useEffect, useState, type ReactNode} from "react";
import {useNavigate} from "react-router-dom";
import {listProjectRegistry, previewProjectImport, registerProjectImport, removeProjectRegistryEntry} from "../../api/apiClient";
import type {StudioProjectImportPreviewResult, StudioProjectRegistryView, StudioProjectType} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {formatTimestamp} from "../../domain/formatTimestamp";
import {describePathActionError} from "../../domain/pathActionError";
import {useConfirm} from "../../hooks/useConfirm";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {useOpenProject} from "../../hooks/useOpenProject";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {PathInput} from "../common/PathInput";
import {QuickActions} from "../common/QuickActions";

type ListView = {status: "loading"} | {status: "error"; message: string} | {status: "empty"} | {status: "loaded"; entries: StudioProjectRegistryView[]};

type RecognizedPreview = Extract<StudioProjectImportPreviewResult, {status: "recognized"}>;

type ImportView =
    | {status: "idle"}
    | {status: "detecting"}
    | {status: "error"; message: string}
    | {status: "unrecognized"; path: string}
    | {status: "recognized"; result: RecognizedPreview}
    | {status: "registering"; result: RecognizedPreview}
    | {status: "registered"; name: string};

// The only ProjectType Home's Open action (StudioHomeService.openProject/loadProjectDashboardContext)
// can actually load into the Project Dashboard -- every other recognized type (blueprint/outcomeLibrary/
// stakeAdapter/wasm/parWorkbook) is a real, correctly-detected project, just not one there's a "run it in
// Studio" flow for yet, so the list shows its type/capabilities but no Open action.
const OPENABLE_TYPE: StudioProjectType = "tsPackage";

const PROJECT_TYPE_LABEL: Record<StudioProjectType, string> = {
    blueprint: "Blueprint",
    tsPackage: "Package",
    outcomeLibrary: "Outcome library",
    stakeAdapter: "Stake Engine export",
    wasm: "WASM",
    parWorkbook: "PAR sheet",
};

// Projects registry list -- every managed/registered project Studio knows about (see
// StudioProjectRegistrationService.list()'s own doc comment), most-recently-registered/opened first.
export function ProjectsPanel() {
    const fetchImpl = useStudioApi();
    const navigate = useNavigate();
    const confirm = useConfirm();
    const openAndNavigate = useOpenProject();
    const [listView, setListView] = useState<ListView>({status: "loading"});
    const [location, setLocation] = useState("");
    const [importView, setImportView] = useState<ImportView>({status: "idle"});
    const [registerName, setRegisterName] = useState("");
    const [openingLocation, setOpeningLocation] = useState<string | undefined>(undefined);
    const detectGuard = useDoubleSubmitGuard();
    const registerGuard = useDoubleSubmitGuard();
    const openGuard = useDoubleSubmitGuard();

    // Both mutating actions below (register/remove) already receive the server's own resulting entry
    // (or, for remove, already know which location was removed) straight from their own response, so they
    // update `listView` from that directly instead of re-fetching the whole list -- one round trip, not
    // two, and the row a user just acted on updates immediately rather than waiting on a second request.
    const upsertEntry = (entry: StudioProjectRegistryView): void => {
        setListView((previous) => {
            const withoutExisting = (previous.status === "loaded" ? previous.entries : []).filter(
                (existing) => existing.location !== entry.location,
            );
            return {status: "loaded", entries: [entry, ...withoutExisting]};
        });
    };

    const removeEntry = (location: string): void => {
        setListView((previous) => {
            if (previous.status !== "loaded") {
                return previous;
            }
            const remaining = previous.entries.filter((entry) => entry.location !== location);
            return remaining.length === 0 ? {status: "empty"} : {status: "loaded", entries: remaining};
        });
    };

    const refresh = useCallback(() => {
        setListView({status: "loading"});
        listProjectRegistry(fetchImpl)
            .then((entries) => setListView(entries.length === 0 ? {status: "empty"} : {status: "loaded", entries}))
            .catch((error: unknown) => setListView({status: "error", message: errorMessage(error)}));
    }, [fetchImpl]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleOpen = (entry: StudioProjectRegistryView): void => {
        if (!openGuard.begin()) {
            return;
        }
        setOpeningLocation(entry.location);
        openAndNavigate(entry.location)
            .catch((error: unknown) =>
                setListView({status: "error", message: describePathActionError("The project directory", errorMessage(error))}),
            )
            .finally(() => {
                openGuard.end();
                setOpeningLocation(undefined);
            });
    };

    const handleRemove = (entry: StudioProjectRegistryView): void => {
        confirm(`Remove "${entry.name}" from Projects? This only forgets it here -- nothing on disk is deleted.`, () => {
            removeProjectRegistryEntry(fetchImpl, entry.location)
                .then(() => removeEntry(entry.location))
                .catch((error: unknown) => setListView({status: "error", message: errorMessage(error)}));
        });
    };

    const handleLocationChange = (value: string): void => {
        setLocation(value);
        if (importView.status !== "idle") {
            setImportView({status: "idle"});
        }
    };

    const handleDetect = (): void => {
        const trimmed = location.trim();
        if (trimmed.length === 0 || !detectGuard.begin()) {
            return;
        }
        setImportView({status: "detecting"});
        previewProjectImport(fetchImpl, trimmed)
            .then((result) => {
                detectGuard.end();
                if (result.status === "recognized") {
                    setRegisterName(result.suggestedName);
                    setImportView({status: "recognized", result});
                } else {
                    setImportView({status: "unrecognized", path: result.path});
                }
            })
            .catch((error: unknown) => {
                detectGuard.end();
                setImportView({status: "error", message: errorMessage(error)});
            });
    };

    // A recognized PAR sheet has no "open" story of its own (see loadProjectDashboardContext's own
    // doc comment -- it only ever loads a runnable tsPackage) -- Import Project routes it into Design
    // Game's own PAR Sheet Import/Export panel instead of registering it, reusing the exact same guided
    // Import -> Diagnose & map -> Preview -> Apply flow a PAR sheet reached any other way already goes
    // through (see ParSheetImportExportPanel's own doc comment).
    const renderEntryName = (entry: StudioProjectRegistryView): ReactNode => {
        if (entry.status === "missing") {
            return <Text c="dimmed">{entry.name} (missing)</Text>;
        }
        if (entry.type === OPENABLE_TYPE) {
            return (
                <Anchor component="button" type="button" onClick={() => handleOpen(entry)}>
                    {entry.name}
                </Anchor>
            );
        }
        return entry.name;
    };

    const handleGoToDesignGame = (path: string): void => {
        navigate("/home/design", {state: {initialParSheetPath: path}});
    };

    const handleRegister = (): void => {
        if (importView.status !== "recognized" || !registerGuard.begin()) {
            return;
        }
        const {result} = importView;
        const trimmedName = registerName.trim();
        setImportView({status: "registering", result});
        registerProjectImport(fetchImpl, result.location, trimmedName.length > 0 ? trimmedName : result.suggestedName)
            .then((registration) => {
                registerGuard.end();
                if (registration.status === "ok") {
                    setImportView({status: "registered", name: registration.entry.name});
                    setLocation("");
                    upsertEntry(registration.entry);
                } else {
                    setImportView({status: "unrecognized", path: registration.path});
                }
            })
            .catch((error: unknown) => {
                registerGuard.end();
                setImportView({status: "error", message: errorMessage(error)});
            });
    };

    return (
        <div>
            <PageSection legend="Your projects">
                {listView.status === "loading" && <LoadingState />}
                {listView.status === "error" && <ErrorState message={listView.message} />}
                {listView.status === "empty" && <EmptyState message="No projects yet -- import or design one below." />}
                {listView.status === "loaded" && (
                    <Table.ScrollContainer minWidth={640}>
                        <Table>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Name</Table.Th>
                                    <Table.Th>Type</Table.Th>
                                    <Table.Th>Origin</Table.Th>
                                    <Table.Th>Last opened</Table.Th>
                                    <Table.Th>Actions</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {listView.entries.map((entry) => (
                                    <Table.Tr key={entry.location}>
                                        <Table.Td>
                                            {renderEntryName(entry)}
                                            <Text size="sm" c="dimmed" style={{overflowWrap: "anywhere"}}>
                                                {entry.location}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>{PROJECT_TYPE_LABEL[entry.type]}</Table.Td>
                                        <Table.Td>
                                            <Group gap={6} wrap="nowrap">
                                                <Text component="span">{entry.origin === "managed" ? "Managed" : "Registered"}</Text>
                                                {entry.importedFromParSheetPath && <Badge size="xs" color="grape">Imported from PAR</Badge>}
                                            </Group>
                                        </Table.Td>
                                        <Table.Td>{formatTimestamp(entry.lastOpenedAt)}</Table.Td>
                                        <Table.Td>
                                            <QuickActions>
                                                {entry.status === "ok" && entry.type === OPENABLE_TYPE && (
                                                    <Button
                                                        variant="default"
                                                        size="xs"
                                                        loading={openingLocation === entry.location}
                                                        onClick={() => handleOpen(entry)}
                                                    >
                                                        Open
                                                    </Button>
                                                )}
                                                {entry.status === "ok" && entry.type === "parWorkbook" && (
                                                    <Button variant="default" size="xs" onClick={() => handleGoToDesignGame(entry.location)}>
                                                        Open in Design Game
                                                    </Button>
                                                )}
                                                <Button variant="subtle" color="red" size="xs" onClick={() => handleRemove(entry)}>
                                                    Remove
                                                </Button>
                                            </QuickActions>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                )}
            </PageSection>

            <PageSection legend="Import Project">
                <Text size="sm" c="dimmed" mb="sm">
                    Point at an existing package, outcome library, Stake Engine export, blueprint, or PAR sheet (.xlsx) -- POKIE detects what
                    it is before anything is registered.
                </Text>
                <QuickActions>
                    <PathInput
                        label="Location"
                        placeholder="./my-game"
                        kind="directory"
                        browseTitle="Browse for a project to import"
                        browseId="import-project-location"
                        value={location}
                        onChange={(event) => handleLocationChange(event.currentTarget.value)}
                        onPathSelected={handleLocationChange}
                    />
                    <Button onClick={handleDetect} loading={importView.status === "detecting"}>
                        Detect
                    </Button>
                </QuickActions>

                {importView.status === "error" && <ErrorState message={importView.message} />}
                {importView.status === "unrecognized" && (
                    <ErrorState message={`"${importView.path}" doesn't look like any POKIE project type POKIE recognizes.`} />
                )}
                {importView.status === "registered" && (
                    <Text size="sm">Registered &quot;{importView.name}&quot; -- it now shows up in Your projects above.</Text>
                )}

                {(importView.status === "recognized" || importView.status === "registering") &&
                    (importView.result.type === "parWorkbook" ? (
                        <div>
                            <Text size="sm" mb="sm">
                                This is a PAR sheet workbook. Import it via Design Game&apos;s own PAR Sheet Import/Export panel instead of
                                registering it here.
                            </Text>
                            <QuickActions>
                                <Button variant="default" onClick={() => handleGoToDesignGame(importView.result.location)}>
                                    Open in Design Game
                                </Button>
                            </QuickActions>
                        </div>
                    ) : (
                        <div>
                            <Text size="sm" mb="sm">
                                Detected a {PROJECT_TYPE_LABEL[importView.result.type]} at{" "}
                                <strong style={{overflowWrap: "anywhere"}}>{importView.result.location}</strong>.
                            </Text>
                            <TextInput
                                label="Name"
                                mb="sm"
                                value={registerName}
                                onChange={(event) => setRegisterName(event.currentTarget.value)}
                                description="Registered under this name -- rename it later if you need to."
                            />
                            <QuickActions>
                                <Button onClick={handleRegister} loading={importView.status === "registering"}>
                                    Register
                                </Button>
                            </QuickActions>
                        </div>
                    ))}
            </PageSection>
        </div>
    );
}
