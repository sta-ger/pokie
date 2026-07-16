import {Button, Checkbox, Group, Table, TextInput} from "@mantine/core";
import {useState} from "react";
import {asStringList} from "../../domain/asStringList";
import {addSymbol, duplicateSymbolAt, moveSymbolAt, removeSymbolAt, setSymbolAt, toggleScatterSymbol, toggleWildSymbol} from "../../domain/blueprintFormOps";
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

    return (
        <PageSection legend="Symbols">
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
                                    onCommit={(value) => mutate((b) => setSymbolAt(b, index, value))}
                                />
                            </Table.Td>
                            <Table.Td>
                                <Checkbox
                                    aria-label={`Symbol ${index + 1} is wild`}
                                    checked={wilds.includes(symbolId)}
                                    onChange={() => mutate((b) => toggleWildSymbol(b, symbolId))}
                                />
                            </Table.Td>
                            <Table.Td>
                                <Checkbox
                                    aria-label={`Symbol ${index + 1} is scatter`}
                                    checked={scatters.includes(symbolId)}
                                    onChange={() => mutate((b) => toggleScatterSymbol(b, symbolId))}
                                />
                            </Table.Td>
                            <Table.Td>
                                <RowActions
                                    itemLabel={`symbol ${index + 1}`}
                                    onDuplicate={() => mutate((b) => duplicateSymbolAt(b, index))}
                                    onRemove={() => mutate((b) => removeSymbolAt(b, index))}
                                    onMoveUp={index > 0 ? () => mutate((b) => moveSymbolAt(b, index, index - 1)) : undefined}
                                    onMoveDown={index < symbols.length - 1 ? () => mutate((b) => moveSymbolAt(b, index, index + 1)) : undefined}
                                />
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
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
