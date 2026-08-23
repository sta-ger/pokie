import {Button, Checkbox, Group, Table, Text, TextInput} from "@mantine/core";
import {useState} from "react";
import {importSymbolArtwork, pickNativePath} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import {asStringList} from "../../domain/asStringList";
import {addSymbol, duplicateSymbolAt, getSymbolDeletionBlockers, moveSymbolAt, removeSymbolAt, renameSymbol, toggleScatterSymbol, toggleWildSymbol} from "../../domain/blueprintFormOps";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {BufferedTextInput} from "../common/BufferedTextInput";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";
import {PathBrowseModal} from "../common/PathBrowseModal";
import {symbolArtworkFromBlueprint, SymbolPresentation} from "../common/SymbolPresentation";

export function SymbolsTable({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const fetchImpl = useStudioApi();
    const symbols = asStringList(blueprint.symbols);
    const wilds = asStringList(blueprint.wilds);
    const scatters = asStringList(blueprint.scatters);
    const [newSymbolId, setNewSymbolId] = useState("");
    const [diagnostic, setDiagnostic] = useState<string>();
    const [artworkBrowserSymbolId, setArtworkBrowserSymbolId] = useState<string>();
    const artwork = symbolArtworkFromBlueprint(blueprint);

    const importArtwork = async (symbolId: string, sourcePath: string): Promise<void> => {
        setDiagnostic(undefined);
        try {
            const imported = await importSymbolArtwork(fetchImpl, sourcePath);
            if (imported.status === "error") {
                setDiagnostic(imported.error);
                return;
            }
            mutate((draft) => {
                const current = typeof draft.symbolArtwork === "object" && draft.symbolArtwork !== null && !Array.isArray(draft.symbolArtwork)
                    ? draft.symbolArtwork as Record<string, unknown>
                    : {};
                draft.symbolArtwork = {...current, [symbolId]: imported.reference};
            });
        } catch (error) {
            setDiagnostic(error instanceof Error ? error.message : String(error));
        }
    };

    const selectArtwork = async (symbolId: string): Promise<void> => {
        setDiagnostic(undefined);
        try {
            const picked = await pickNativePath(fetchImpl, {kind: "file", fileFilters: [{name: "PNG image", extensions: ["png"]}]});
            if (picked.status === "selected") {
                await importArtwork(symbolId, picked.path);
                return;
            }
            if (picked.status !== "cancelled") {
                // A remote/headless Studio server cannot show an OS picker. Its rendered filesystem
                // browser is the same truthful fallback PathInput uses, so artwork selection remains
                // actionable instead of stopping at an environment-specific picker message.
                setArtworkBrowserSymbolId(symbolId);
            }
        } catch (error) {
            setDiagnostic(error instanceof Error ? error.message : String(error));
            setArtworkBrowserSymbolId(symbolId);
        }
    };

    return (
        <PageSection legend="Symbols">
            <Text size="sm" c="dimmed" mb="xs">
                Select PNG to give a symbol its artwork. The image is shown in the reel and game views, and is saved
                with this project when you save it.
            </Text>
            <Table.ScrollContainer minWidth={480}>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Symbol id</Table.Th>
                            <Table.Th>Wild</Table.Th>
                            <Table.Th>Scatter</Table.Th>
                            <Table.Th>Artwork</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {symbols.map((symbolId, index) => (
                            <Table.Tr key={index}>
                                <Table.Td>
                                    <BufferedTextInput
                                        label={`Symbol ${index + 1} id`}
                                        value={symbolId}
                                        onCommit={(value) => {
                                            let problem: string | undefined;
                                            mutate((b) => {
                                                problem = renameSymbol(b, symbolId, value);
                                            });
                                            setDiagnostic(problem);
                                        }}
                                    />
                                </Table.Td>
                                <Table.Td>
                                    <Checkbox
                                        aria-label={`Symbol ${index + 1} is wild`}
                                        checked={wilds.includes(symbolId)}
                                        onChange={() => {
                                            setDiagnostic(undefined);
                                            mutate((b) => toggleWildSymbol(b, symbolId));
                                        }}
                                    />
                                </Table.Td>
                                <Table.Td>
                                    {typeof artwork[symbolId] === "string" ? (
                                        <Group gap="xs" wrap="nowrap">
                                            <SymbolPresentation symbolId={symbolId} artwork={artwork} size={32} />
                                            <Button size="xs" variant="default" onClick={() => {
                                                selectArtwork(symbolId);
                                            }}>Change</Button>
                                            <Button size="xs" color="red" variant="subtle" onClick={() => mutate((draft) => {
                                                const current = typeof draft.symbolArtwork === "object" && draft.symbolArtwork !== null && !Array.isArray(draft.symbolArtwork)
                                                    ? {...draft.symbolArtwork as Record<string, unknown>}
                                                    : {};
                                                Reflect.deleteProperty(current, symbolId);
                                                if (Object.keys(current).length === 0) Reflect.deleteProperty(draft, "symbolArtwork");
                                                else draft.symbolArtwork = current;
                                            })}>Remove</Button>
                                        </Group>
                                    ) : (
                                        <Button size="xs" variant="default" onClick={() => {
                                            selectArtwork(symbolId);
                                        }}>Select PNG</Button>
                                    )}
                                </Table.Td>
                                <Table.Td>
                                    <Checkbox
                                        aria-label={`Symbol ${index + 1} is scatter`}
                                        checked={scatters.includes(symbolId)}
                                        onChange={() => {
                                            setDiagnostic(undefined);
                                            mutate((b) => toggleScatterSymbol(b, symbolId));
                                        }}
                                    />
                                </Table.Td>
                                <Table.Td>
                                    <RowActions
                                        itemLabel={`symbol ${index + 1}`}
                                        onDuplicate={() => mutate((b) => duplicateSymbolAt(b, index))}
                                        onRemove={() => {
                                            const blockers = getSymbolDeletionBlockers(blueprint, symbolId);
                                            if (blockers.length > 0) {
                                                setDiagnostic(`Cannot delete "${symbolId}" while it is referenced by ${blockers.join(", ")}. Rename it to update those references, or remove them first.`);
                                                return;
                                            }
                                            setDiagnostic(undefined);
                                            mutate((b) => removeSymbolAt(b, index));
                                        }}
                                        onMoveUp={index > 0 ? () => mutate((b) => moveSymbolAt(b, index, index - 1)) : undefined}
                                        onMoveDown={index < symbols.length - 1 ? () => mutate((b) => moveSymbolAt(b, index, index + 1)) : undefined}
                                    />
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
            <Text size="xs" c="dimmed" mt="xs">
                A symbol cannot be both wild and scatter. Renaming updates all reel, paytable, generated-reel, and free-games references; referenced symbols cannot be deleted.
            </Text>
            {diagnostic && <Text role="alert" size="sm" c="red" mt="xs">{diagnostic}</Text>}
            <PathBrowseModal
                opened={artworkBrowserSymbolId !== undefined}
                onClose={() => setArtworkBrowserSymbolId(undefined)}
                onSelect={(path) => {
                    if (artworkBrowserSymbolId !== undefined) {
                        importArtwork(artworkBrowserSymbolId, path);
                    }
                }}
                kind="file"
                initialPath=""
                title="Select PNG artwork"
            />
            <QuickActions>
                <Group gap="xs">
                    <TextInput
                        label="New symbol id"
                        placeholder="New symbol id"
                        value={newSymbolId}
                        onChange={(event) => setNewSymbolId(event.currentTarget.value)}
                    />
                    <Button
                        variant="default"
                        onClick={() => {
                            const id = newSymbolId.trim();
                            if (id.length === 0) {
                                return;
                            }
                            mutate((b) => addSymbol(b, id));
                            setNewSymbolId("");
                        }}
                    >
                        Add symbol
                    </Button>
                </Group>
            </QuickActions>
        </PageSection>
    );
}
