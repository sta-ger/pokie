import {Anchor, Badge, Button, Checkbox, Group, Select, Table, Text, TextInput} from "@mantine/core";
import {useCallback, useEffect, useRef, useState, type ReactNode} from "react";
import {useNavigate} from "react-router-dom";
import {
    listProjectRegistry,
    previewProjectImport,
    ProjectOpenError,
    registerProjectImport,
    relocateProjectRegistryEntry,
    removeProjectRegistryEntry,
    type FetchLike,
} from "../../api/apiClient";
import type {StudioProjectImportPreviewResult, StudioProjectRegistryView, StudioProjectType} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import {formatTimestamp} from "../../domain/formatTimestamp";
import {describePathActionError} from "../../domain/pathActionError";
import {describeProjectActionError} from "../../domain/projectActionError";
import {describeProjectType, PROJECT_TYPE_LABEL} from "../../domain/interpret/ProjectDashboard";
import {useConfirm} from "../../hooks/useConfirm";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {useOpenProject} from "../../hooks/useOpenProject";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {PathInput} from "../common/PathInput";
import {QuickActions} from "../common/QuickActions";

type ListView =
    | {status: "loading"}
    // `detail` -- present only when the failure was a Home Open Project that carried the server's own raw
    // npm diagnostic (see apiClient's ProjectOpenError); absent for every other listView failure.
    | {status: "error"; message: string; detail?: string}
    | {status: "empty"}
    // Keep the registered rows available when Open fails. Blueprint materialization can fail
    // transiently (for example while its local dependency install is retried), and replacing this
    // state with a bare error used to remove the very Open action needed to retry it.
    | {status: "loaded"; entries: StudioProjectRegistryView[]; openError?: {message: string; detail?: string}};

type RecognizedPreview = Extract<StudioProjectImportPreviewResult, {status: "recognized"}>;

type ImportView =
    | {status: "idle"}
    | {status: "detecting"}
    | {status: "error"; message: string}
    | {status: "unrecognized"; path: string}
    | {status: "recognized"; result: RecognizedPreview}
    | {status: "registering"; result: RecognizedPreview}
    | {status: "registered"; name: string};

// Detection only reads a small package manifest and its project shape, so an interactive request
// should never leave Import Project waiting indefinitely.  A bounded failure keeps the next action
// visible if the Studio server or an intermediary stops responding.
const PROJECT_IMPORT_DETECTION_TIMEOUT_MS = 15_000;

// The ProjectTypes Home's Open action (StudioHomeService.openProject/loadProjectDashboardContext) can
// load runnable packages and Blueprints, as well as canonical outcome-source projects and exchangeable
// PAR workbooks. A Blueprint is materialized into a runtime package; an outcome library, Stake Engine
// export, or PAR workbook loads its own capability-gated dashboard, including Build/Export. WASM opens
// its read-only inspection dashboard and never reaches runtime or Build/Export. PAR workbooks additionally
// retain their dedicated Design Game action below.
const RUNTIME_OR_ARTIFACT_OPENABLE_TYPES: ReadonlySet<StudioProjectType> = new Set<StudioProjectType>([
    "tsPackage",
    "blueprint",
    "outcomeLibrary",
    "stakeAdapter",
    "parWorkbook",
]);

function isOpenable(entry: StudioProjectRegistryView): boolean {
    return entry.type === "wasm"
        ? entry.capabilities.includes(entry.wasmPresentation.manifestCapability)
        : RUNTIME_OR_ARTIFACT_OPENABLE_TYPES.has(entry.type);
}

function describeAvailability(entry: StudioProjectRegistryView): string {
    if (entry.status === "ok") return "Available";
    if (entry.status === "missing") return "Needs attention";
    return entry.unavailableReason ?? "Unavailable";
}

const PROJECTS_PER_PAGE = 10;

type ProjectTypeFilter = "all" | StudioProjectType;
type ProjectStatusFilter = "all" | "ok" | "missing" | "unavailable";

function previewProjectImportWithTimeout(fetchImpl: FetchLike, location: string): Promise<StudioProjectImportPreviewResult> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(
            () => reject(new Error("Project detection timed out. Confirm Studio is still reachable, then try again.")),
            PROJECT_IMPORT_DETECTION_TIMEOUT_MS,
        );
        previewProjectImport(fetchImpl, location)
            .then(resolve, reject)
            .finally(() => clearTimeout(timeout));
    });
}

// Projects list -- every project Studio can reopen, most recently opened first.
export function ProjectsPanel({
    registryVersion = 0,
    registeredProject,
    isVisible = true,
}: {
    registryVersion?: number;
    registeredProject?: StudioProjectRegistryView;
    isVisible?: boolean;
}) {
    const fetchImpl = useStudioApi();
    const navigate = useNavigate();
    const confirm = useConfirm();
    const openAndNavigate = useOpenProject();
    const [listView, setListView] = useState<ListView>({status: "loading"});
    const [refreshVersion, setRefreshVersion] = useState(0);
    const [location, setLocation] = useState("");
    const [importView, setImportView] = useState<ImportView>({status: "idle"});
    const [registerName, setRegisterName] = useState("");
    const [openingLocation, setOpeningLocation] = useState<string | undefined>(undefined);
    const [relocatingEntry, setRelocatingEntry] = useState<StudioProjectRegistryView | undefined>(undefined);
    const [relocationLocation, setRelocationLocation] = useState("");
    // A rendered confirmation can immediately follow a browser input event. Keep the submitted path
    // alongside React's display state so that confirmation always uses that event's latest value, even
    // before React has committed the controlled input's re-render.
    const relocationLocationRef = useRef("");
    const [relocationError, setRelocationError] = useState<string | undefined>(undefined);
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState<ProjectTypeFilter>("all");
    const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>("all");
    const [page, setPage] = useState(1);
    const [selectedMissingLocations, setSelectedMissingLocations] = useState<ReadonlySet<string>>(new Set());
    const [removingMissing, setRemovingMissing] = useState(false);
    const [missingRemovalError, setMissingRemovalError] = useState<string | undefined>(undefined);
    const detectGuard = useDoubleSubmitGuard();
    const registerGuard = useDoubleSubmitGuard();
    const openGuard = useDoubleSubmitGuard();
    const relocateGuard = useDoubleSubmitGuard();

    // Both mutating actions below (register/remove) already receive the server's own resulting entry
    // (or, for remove, already know which location was removed) straight from their own response, so they
    // update `listView` from that directly instead of re-fetching the whole list -- one round trip, not
    // two, and the row a user just acted on updates immediately rather than waiting on a second request.
    const upsertEntry = useCallback((entry: StudioProjectRegistryView): void => {
        setListView((previous) => {
            const withoutExisting = (previous.status === "loaded" ? previous.entries : []).filter(
                (existing) => existing.location !== entry.location,
            );
            return {status: "loaded", entries: [entry, ...withoutExisting]};
        });
    }, []);

    const removeEntry = (location: string): void => {
        setListView((previous) => {
            if (previous.status !== "loaded") {
                return previous;
            }
            const remaining = previous.entries.filter((entry) => entry.location !== location);
            return remaining.length === 0 ? {status: "empty"} : {status: "loaded", entries: remaining};
        });
    };

    // Home keeps this panel mounted while Design Game is visible, so a route change does not by itself
    // remount it. Refresh whenever Projects becomes visible: an entry may have been moved outside Studio
    // while the user was designing. `cancelled` also guards against a request settling after the panel
    // becomes hidden or unmounts.
    useEffect(() => {
        let cancelled = false;
        if (!isVisible) {
            return () => {
                cancelled = true;
            };
        }
        // Preserve a just-saved project's optimistic row while this reconciliation request is in
        // flight. Otherwise opening Projects immediately after Save would briefly erase that row.
        setListView((previous) => previous.status === "loaded" ? previous : {status: "loading"});
        listProjectRegistry(fetchImpl)
            .then((entries) => {
                if (!cancelled) {
                    setListView(entries.length === 0 ? {status: "empty"} : {status: "loaded", entries});
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setListView({status: "error", message: describeProjectActionError("Your projects list", errorMessage(error))});
                }
            });
        return () => {
            cancelled = true;
        };
    }, [fetchImpl, isVisible, refreshVersion, registryVersion]);

    // save-managed already has the canonical row the registry wrote. Render it immediately rather
    // than waiting for the invalidating list request above; that request remains the eventual
    // reconciliation source and the direct upsert uses the same deduplication path as Import/Relocate.
    useEffect(() => {
        if (registeredProject !== undefined) {
            upsertEntry(registeredProject);
        }
    }, [registeredProject, upsertEntry]);

    const handleOpen = (entry: StudioProjectRegistryView): void => {
        if (!openGuard.begin()) {
            return;
        }
        setListView((previous) => previous.status === "loaded" ? {...previous, openError: undefined} : previous);
        setOpeningLocation(entry.location);
        const subject = entry.type === "blueprint" ? "The game design" : "The game";
        openAndNavigate(entry.location)
            .catch((error: unknown) =>
                setListView((previous) => {
                    const openError = {
                        message: describePathActionError(subject, errorMessage(error)),
                        detail: error instanceof ProjectOpenError ? error.detail : undefined,
                    };
                    return previous.status === "loaded" ? {...previous, openError} : {status: "error", ...openError};
                }),
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
                .catch((error: unknown) => setListView({status: "error", message: describeProjectActionError("Removing this game", errorMessage(error))}));
        });
    };

    const setFilters = (nextSearch: string, nextType: ProjectTypeFilter, nextStatus: ProjectStatusFilter): void => {
        setSearch(nextSearch);
        setTypeFilter(nextType);
        setStatusFilter(nextStatus);
        setPage(1);
    };

    const handleBulkRemoveMissing = (): void => {
        const selectedLocations = [...selectedMissingLocations];
        if (selectedLocations.length === 0 || removingMissing) {
            return;
        }
        confirm(
            `Remove ${selectedLocations.length} missing project${selectedLocations.length === 1 ? "" : "s"} from Projects? This only forgets them here -- nothing on disk is deleted.`,
            () => {
                setRemovingMissing(true);
                setMissingRemovalError(undefined);
                Promise.allSettled(selectedLocations.map((entryLocation) => removeProjectRegistryEntry(fetchImpl, entryLocation)))
                    .then((results) => {
                        const removedLocations = new Set(
                            results.flatMap((result, index) => result.status === "fulfilled" ? [selectedLocations[index]] : []),
                        );
                        if (removedLocations.size > 0) {
                            setListView((previous) => {
                                if (previous.status !== "loaded") {
                                    return previous;
                                }
                                const entries = previous.entries.filter((entry) => !removedLocations.has(entry.location));
                                return entries.length === 0 ? {status: "empty"} : {...previous, entries};
                            });
                            setSelectedMissingLocations((previous) => new Set([...previous].filter((location) => !removedLocations.has(location))));
                        }
                        if (removedLocations.size !== selectedLocations.length) {
                            setMissingRemovalError("Some missing projects could not be removed. The remaining selections are still available to retry.");
                        }
                    })
                    .finally(() => setRemovingMissing(false));
            },
        );
    };

    const handleLocationChange = (value: string): void => {
        setLocation(value);
        if (importView.status !== "idle") {
            setImportView({status: "idle"});
        }
    };

    const handleRelocate = (): void => {
        const newLocation = relocationLocationRef.current.trim();
        if (relocatingEntry === undefined || newLocation.length === 0 || !relocateGuard.begin()) {
            return;
        }
        setRelocationError(undefined);
        relocateProjectRegistryEntry(fetchImpl, relocatingEntry.location, newLocation)
            .then((result) => {
                relocateGuard.end();
                if (result.status !== "ok") {
                    setRelocationError(`"${result.path}" isn't a recognized game location. Choose another location or retry.`);
                    return;
                }
                removeEntry(relocatingEntry.location);
                upsertEntry(result.entry);
                setRelocatingEntry(undefined);
                setRelocationLocation("");
                relocationLocationRef.current = "";
            })
            .catch((error: unknown) => {
                relocateGuard.end();
                setRelocationError(describePathActionError("The new game location", errorMessage(error)));
            });
    };

    const handleDetect = (): void => {
        const trimmed = location.trim();
        if (trimmed.length === 0 || !detectGuard.begin()) {
            return;
        }
        setImportView({status: "detecting"});
        previewProjectImportWithTimeout(fetchImpl, trimmed)
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
                setImportView({status: "error", message: describePathActionError("That game location", errorMessage(error))});
            });
    };

    // A detected PAR sheet can be registered like every other supported project, making its public
    // Open action and self-republish Build/Export dashboard reachable. It also retains the separate
    // Design Game route for the guided Import -> Diagnose & map -> Preview -> Apply flow.
    const renderEntryName = (entry: StudioProjectRegistryView): ReactNode => {
        if (entry.status === "missing") {
            return <Text c="dimmed">{entry.name} (missing)</Text>;
        }
        if (entry.status === "ok" && isOpenable(entry)) {
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
                setImportView({status: "error", message: describeProjectActionError("Adding this game", errorMessage(error))});
            });
    };

    const entries = listView.status === "loaded" ? listView.entries : [];
    const searchNeedle = search.trim().toLocaleLowerCase();
    const filteredEntries = entries.filter((entry) => {
        const typeLabel = entry.type === "wasm" ? describeProjectType(entry.type, entry.wasmPresentation) : describeProjectType(entry.type);
        const matchesSearch = searchNeedle.length === 0 || [entry.name, entry.location, typeLabel, entry.origin]
            .some((value) => value.toLocaleLowerCase().includes(searchNeedle));
        return matchesSearch && (typeFilter === "all" || entry.type === typeFilter) && (statusFilter === "all" || entry.status === statusFilter);
    });
    const pageCount = Math.max(1, Math.ceil(filteredEntries.length / PROJECTS_PER_PAGE));
    const currentPage = Math.min(page, pageCount);
    const pageEntries = filteredEntries.slice((currentPage - 1) * PROJECTS_PER_PAGE, currentPage * PROJECTS_PER_PAGE);
    const availablePageEntries = pageEntries.filter((entry) => entry.status === "ok");
    const missingPageEntries = pageEntries.filter((entry) => entry.status === "missing");
    const unavailablePageEntries = pageEntries.filter((entry) => entry.status === "unavailable");
    const missingEntries = entries.filter((entry) => entry.status === "missing");
    const selectedMissingOnPage = missingPageEntries.filter((entry) => selectedMissingLocations.has(entry.location));
    const toggleMissingSelection = (location: string, checked: boolean): void => {
        setSelectedMissingLocations((previous) => {
            const next = new Set(previous);
            if (checked) next.add(location);
            else next.delete(location);
            return next;
        });
    };
    const renderEntryRow = (entry: StudioProjectRegistryView): ReactNode => (
        <Table.Tr key={entry.location} className="project-registry-entry">
            <Table.Td className="project-registry-selection" data-label="Select">
                {entry.status === "missing" && (
                    <Checkbox
                        aria-label={`Select missing project ${entry.name}`}
                        checked={selectedMissingLocations.has(entry.location)}
                        onChange={(event) => toggleMissingSelection(entry.location, event.currentTarget.checked)}
                    />
                )}
            </Table.Td>
            <Table.Td data-label="Project">
                {renderEntryName(entry)}
                <Text size="sm" c="dimmed" style={{overflowWrap: "anywhere"}}>{entry.location}</Text>
                <Text className="project-registry-status" size="sm" c={entry.status === "ok" ? "teal" : "orange"}>
                    {describeAvailability(entry)}
                </Text>
            </Table.Td>
            <Table.Td data-label="Type">{entry.type === "wasm" ? describeProjectType(entry.type, entry.wasmPresentation) : describeProjectType(entry.type)}</Table.Td>
            <Table.Td data-label="Added to Studio">
                <Group gap={6} wrap="nowrap">
                    <Text component="span">{entry.origin === "managed" ? "Created in Studio" : "Added from your computer"}</Text>
                    {entry.importedFromParSheetPath && <Badge size="xs" color="grape">Imported from PAR</Badge>}
                    {entry.conversionEvidencePath && <Text size="xs" c="dimmed">Conversion evidence: {entry.conversionEvidencePath}</Text>}
                </Group>
            </Table.Td>
            <Table.Td data-label="Last opened">{formatTimestamp(entry.lastOpenedAt)}</Table.Td>
            <Table.Td className="project-registry-actions" data-label="Actions">
                <QuickActions>
                    {entry.status === "ok" && isOpenable(entry) && (
                        <Button variant="default" size="xs" loading={openingLocation === entry.location} onClick={() => handleOpen(entry)}>{entry.type === "wasm" ? entry.wasmPresentation.inspectActionLabel : "Open"}</Button>
                    )}
                    {entry.status === "ok" && entry.type === "parWorkbook" && (
                        <Button variant="default" size="xs" onClick={() => handleGoToDesignGame(entry.location)}>Open in Start a game</Button>
                    )}
                    {entry.status === "missing" && (
                        <Button variant="default" size="xs" onClick={() => {
                            setRelocatingEntry(entry);
                            setRelocationLocation("");
                            relocationLocationRef.current = "";
                            setRelocationError(undefined);
                        }}>Relocate</Button>
                    )}
                    <Button variant="subtle" color="red" size="xs" onClick={() => handleRemove(entry)}>Remove</Button>
                </QuickActions>
            </Table.Td>
        </Table.Tr>
    );

    return (
        <div>
            <PageSection legend="Your projects">
                {listView.status === "loading" && <LoadingState label="Loading your projects…" />}
                {listView.status === "error" && (
                    <>
                        <ErrorState message={listView.message} detail={listView.detail} />
                        <Button size="xs" onClick={() => setRefreshVersion((version) => version + 1)}>Try loading projects again</Button>
                    </>
                )}
                {listView.status === "empty" && (
                    <EmptyState
                        message="No games yet. Start a game or add one you already have."
                        actionLabel="Create your first game"
                        onAction={() => navigate("/home/design")}
                    />
                )}
                {listView.status === "loaded" && (
                    <>
                        {listView.openError && <ErrorState message={listView.openError.message} detail={listView.openError.detail} />}
                        <QuickActions>
                            <TextInput
                                label="Search projects"
                                placeholder="Name or location"
                                value={search}
                                onChange={(event) => setFilters(event.currentTarget.value, typeFilter, statusFilter)}
                            />
                            <Select
                                label="Game type"
                                data={[
                                    {value: "all", label: "All game types"},
                                    ...Object.entries(PROJECT_TYPE_LABEL).map(([value, label]) => ({value, label})),
                                    ...entries.filter((entry) => entry.type === "wasm").slice(0, 1).map((entry) => ({value: entry.type, label: describeProjectType(entry.type, entry.wasmPresentation)})),
                                ]}
                                value={typeFilter}
                                onChange={(value) => setFilters(search, (value ?? "all") as ProjectTypeFilter, statusFilter)}
                            />
                            <Select
                                label="Availability"
                                data={[{value: "all", label: "All projects"}, {value: "ok", label: "Available"}, {value: "missing", label: "Missing"}, {value: "unavailable", label: "Unavailable"}]}
                                value={statusFilter}
                                onChange={(value) => setFilters(search, typeFilter, (value ?? "all") as ProjectStatusFilter)}
                            />
                            {(search.length > 0 || typeFilter !== "all" || statusFilter !== "all") && (
                                <Button variant="default" onClick={() => setFilters("", "all", "all")}>Clear filters</Button>
                            )}
                        </QuickActions>
                        {missingEntries.length > 0 && (
                            <QuickActions>
                                <Button
                                    color="red"
                                    variant="light"
                                    disabled={selectedMissingLocations.size === 0}
                                    loading={removingMissing}
                                    onClick={handleBulkRemoveMissing}
                                >
                                    Remove selected missing ({selectedMissingLocations.size})
                                </Button>
                                <Text size="sm" c="dimmed">Remove stale project entries in one step; project files stay untouched.</Text>
                            </QuickActions>
                        )}
                        {missingRemovalError && <ErrorState message={missingRemovalError} />}
                        {filteredEntries.length === 0 ? (
                            <EmptyState message="No projects match these filters." />
                        ) : (
                            <Table.ScrollContainer className="project-registry-scroll" minWidth={0}>
                                <Table className="project-registry" style={{tableLayout: "fixed", width: "100%"}}>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>
                                                {missingPageEntries.length > 0 && (
                                                    <Checkbox
                                                        aria-label="Select missing projects on this page"
                                                        checked={selectedMissingOnPage.length === missingPageEntries.length}
                                                        indeterminate={selectedMissingOnPage.length > 0 && selectedMissingOnPage.length < missingPageEntries.length}
                                                        onChange={(event) => missingPageEntries.forEach((entry) => toggleMissingSelection(entry.location, event.currentTarget.checked))}
                                                    />
                                                )}
                                            </Table.Th>
                                            <Table.Th>Name</Table.Th>
                                            <Table.Th>Type</Table.Th>
                                            <Table.Th>Added to Studio</Table.Th>
                                            <Table.Th>Last opened</Table.Th>
                                            <Table.Th>Actions</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {availablePageEntries.length > 0 && (
                                            <Table.Tr className="project-registry-group">
                                                <Table.Td colSpan={6}><Text fw={600} size="sm">Available projects</Text></Table.Td>
                                            </Table.Tr>
                                        )}
                                        {availablePageEntries.map(renderEntryRow)}
                                        {missingPageEntries.length > 0 && (
                                            <Table.Tr className="project-registry-group">
                                                <Table.Td colSpan={6}><Text fw={600} size="sm">Needs attention</Text></Table.Td>
                                            </Table.Tr>
                                        )}
                                        {missingPageEntries.map(renderEntryRow)}
                                        {unavailablePageEntries.length > 0 && (
                                            <Table.Tr className="project-registry-group">
                                                <Table.Td colSpan={6}><Text fw={600} size="sm">Unavailable projects</Text></Table.Td>
                                            </Table.Tr>
                                        )}
                                        {unavailablePageEntries.map(renderEntryRow)}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        )}
                        {filteredEntries.length > 0 && (
                            <Group justify="space-between" mt="sm" wrap="wrap">
                                <Text size="sm" c="dimmed">
                                    Showing {(currentPage - 1) * PROJECTS_PER_PAGE + 1}–{Math.min(currentPage * PROJECTS_PER_PAGE, filteredEntries.length)} of {filteredEntries.length} projects
                                </Text>
                                {pageCount > 1 && (
                                    <Group gap="xs">
                                        <Button variant="default" size="xs" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous page</Button>
                                        <Text size="sm">Page {currentPage} of {pageCount}</Text>
                                        <Button variant="default" size="xs" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next page</Button>
                                    </Group>
                                )}
                            </Group>
                        )}
                    </>
                )}
                {relocatingEntry && (
                    <div>
                        <Text size="sm" mt="sm" mb="xs">
                            Relocate &quot;{relocatingEntry.name}&quot; without changing files on disk.
                        </Text>
                        <QuickActions>
                            <PathInput
                                label="New location"
                                placeholder="/path/to/moved-project"
                                kind="any"
                                browseTitle="Choose the moved project"
                                browseId="relocate-project-location"
                                value={relocationLocation}
                                onChange={(event) => {
                                    relocationLocationRef.current = event.currentTarget.value;
                                    setRelocationLocation(event.currentTarget.value);
                                }}
                                onPathSelected={(path) => {
                                    relocationLocationRef.current = path;
                                    setRelocationLocation(path);
                                }}
                            />
                            <Button onClick={handleRelocate}>Relocate</Button>
                            <Button
                                variant="default"
                                onClick={() => {
                                    relocationLocationRef.current = "";
                                    setRelocatingEntry(undefined);
                                }}
                            >
                                Cancel
                            </Button>
                        </QuickActions>
                        {relocationError && <ErrorState message={relocationError} />}
                    </div>
                )}
            </PageSection>

            <PageSection legend="Add a game you already have">
                <Text size="sm" c="dimmed" mb="sm">
                    Choose a game folder, saved game design, or PAR spreadsheet (.xlsx). Studio checks it first, so nothing is added until you confirm.
                </Text>
                <QuickActions>
                    <PathInput
                        label="Game location"
                        placeholder="./my-game"
                        kind="any"
                        browseTitle="Browse for a game to add"
                        browseId="import-project-location"
                        nativePicker={{
                            kind: "file",
                            label: "Browse PAR sheet…",
                            fileFilters: [{name: "PAR sheets", extensions: ["xlsx"]}],
                        }}
                        value={location}
                        onChange={(event) => handleLocationChange(event.currentTarget.value)}
                        onPathSelected={handleLocationChange}
                    />
                    <Button
                        type="button"
                        onClick={handleDetect}
                        loading={importView.status === "detecting"}
                        disabled={location.trim().length === 0}
                        aria-describedby="import-project-detect-help"
                    >
                        Check game
                    </Button>
                </QuickActions>
                {location.trim().length === 0 && (
                    <Text id="import-project-detect-help" size="sm" c="dimmed" mt="xs">
                        Enter a game location or use Browse to check it before adding it.
                    </Text>
                )}

                {importView.status === "detecting" && (
                    <Text role="status" size="sm" c="dimmed" mt="xs">
                        Checking this game…
                    </Text>
                )}

                {importView.status === "error" && <ErrorState message={importView.message} />}
                {importView.status === "unrecognized" && (
                    <ErrorState message={`Studio couldn't identify "${importView.path}" as a game it can open. Choose another game folder or game-design file, then try again.`} />
                )}
                {importView.status === "registered" && (
                    <Text size="sm">Added &quot;{importView.name}&quot; to Your projects. Select Open to continue working on it.</Text>
                )}

                {(importView.status === "recognized" || importView.status === "registering") && (
                    <div>
                        <Text size="sm" mb="sm">
                            Found a {importView.result.type === "wasm" ? describeProjectType(importView.result.type, importView.result.wasmPresentation) : describeProjectType(importView.result.type)} at{" "}
                            <strong style={{overflowWrap: "anywhere"}}>{importView.result.location}</strong>.
                        </Text>
                        {importView.result.type === "parWorkbook" && (
                            <Text size="sm" c="dimmed" mb="sm">
                                Add it to open its export tools, or choose Open in Start a game to bring its PAR data into a game design.
                            </Text>
                        )}
                        <TextInput
                            label="Name"
                            mb="sm"
                            value={registerName}
                            onChange={(event) => setRegisterName(event.currentTarget.value)}
                            description="This is how the game will appear in Your projects."
                        />
                        <QuickActions>
                            <Button onClick={handleRegister} loading={importView.status === "registering"}>
                                Add to projects
                            </Button>
                            {importView.result.type === "parWorkbook" && (
                                <Button variant="default" onClick={() => handleGoToDesignGame(importView.result.location)}>
                                    Open in Start a game
                                </Button>
                            )}
                        </QuickActions>
                    </div>
                )}
            </PageSection>
        </div>
    );
}
