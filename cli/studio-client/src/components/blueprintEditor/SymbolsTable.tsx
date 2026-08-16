import {Button, Checkbox, Group, Table, Text, TextInput} from "@mantine/core";
import {useState} from "react";
import {asStringList} from "../../domain/asStringList";
import {addSymbol, duplicateSymbolAt, getSymbolDeletionBlockers, moveSymbolAt, removeSymbolAt, renameSymbol, toggleScatterSymbol, toggleWildSymbol} from "../../domain/blueprintFormOps";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {BufferedTextInput} from "../common/BufferedTextInput";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";

export function SymbolsTable({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const symbols = asStringList(blueprint.symbols);
    const wilds = asStringList(blueprint.wilds);
    const scatters = asStringList(blueprint.scatters);
    const [newSymbolId, setNewSymbolId] = useState("");
    const [diagnostic, setDiagnostic] = useState<string>();

    return (
        <PageSection legend="Symbols">
            <Table.ScrollContainer minWidth={480}>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Symbol id</Table.Th>
                            <Table.Th>Wild</Table.Th>
                            <Table.Th>Scatter</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {symbols.map((symbolId, index) => (
                            <Table.Tr key={index}>
                                <Table.Td>
                                    <BufferedTextInput
                                        aria-label={`Symbol ${index + 1} id`}
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
            <QuickActions>
                <Group gap="xs">
                    <TextInput
                        placeholder="New symbol id"
                        aria-label="New symbol id"
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
