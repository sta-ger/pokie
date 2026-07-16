import {ActionIcon, Button, NumberInput, Select, Table} from "@mantine/core";
import {IconTrash} from "@tabler/icons-react";
import {useState} from "react";
import {asStringList} from "../../domain/asStringList";
import {removeSymbolWeight, setSymbolWeight} from "../../domain/blueprintFormOps";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";

function asSymbolWeights(value: unknown): Record<string, number> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {};
    }
    const result: Record<string, number> = {};
    for (const [symbolId, weight] of Object.entries(value as Record<string, unknown>)) {
        if (typeof weight === "number") {
            result[symbolId] = weight;
        }
    }
    return result;
}

export function SymbolWeightsEditor({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const weights = asSymbolWeights(blueprint.symbolWeights);
    const symbols = asStringList(blueprint.symbols);
    const [newSymbol, setNewSymbol] = useState<string | null>(null);
    const [newWeight, setNewWeight] = useState<number | string>("");

    return (
        <PageSection legend="Symbol weights">
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Symbol</Table.Th>
                        <Table.Th>Weight</Table.Th>
                        <Table.Th />
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {Object.entries(weights).map(([symbolId, weight]) => (
                        <Table.Tr key={symbolId}>
                            <Table.Td>{symbolId}</Table.Td>
                            <Table.Td>
                                <NumberInput
                                    aria-label={`${symbolId} weight`}
                                    min={1}
                                    step={1}
                                    defaultValue={weight}
                                    onBlur={(event) => {
                                        const value = Number(event.currentTarget.value);
                                        if (Number.isFinite(value)) {
                                            mutate((b) => setSymbolWeight(b, symbolId, value));
                                        }
                                    }}
                                />
                            </Table.Td>
                            <Table.Td>
                                <ActionIcon variant="subtle" color="red" aria-label={`Remove ${symbolId} weight`} onClick={() => mutate((b) => removeSymbolWeight(b, symbolId))}>
                                    <IconTrash size={16} />
                                </ActionIcon>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
            <QuickActions>
                <Select aria-label="Symbol" placeholder="Symbol" data={symbols} value={newSymbol} onChange={setNewSymbol} />
                <NumberInput aria-label="Weight" placeholder="Weight" min={1} step={1} value={newWeight} onChange={setNewWeight} />
                <Button
                    variant="default"
                    onClick={() => {
                        const value = Number(newWeight);
                        if (newSymbol === null || newSymbol.length === 0 || !Number.isFinite(value)) {
                            return;
                        }
                        mutate((b) => setSymbolWeight(b, newSymbol, value));
                    }}
                >
                    Add weight
                </Button>
            </QuickActions>
        </PageSection>
    );
}
