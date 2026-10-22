import {ActionIcon, Button, NumberInput, Select, Table, Text} from "@mantine/core";
import {IconTrash} from "@tabler/icons-react";
import {useEffect, useState} from "react";
import {GameBlueprintValidator} from "../../../../../src/generated/GameBlueprintValidator";
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

const validator = new GameBlueprintValidator();
function weightError(blueprint: Record<string, unknown>, symbol: string, weight: number | string): string | undefined {
    const issues = validator.validate({...blueprint, symbolWeights: {[symbol]: weight}});
    return issues.some(issue => issue.code === "blueprint-symbolweights-invalid-weight") ? "Weight must be a positive integer." : undefined;
}

function ExistingWeight({blueprint, symbol, weight, mutate}: {
    blueprint: Record<string, unknown>; symbol: string; weight: number; mutate: BlueprintMutate;
}) {
    const [draft, setDraft] = useState<number | string>(weight);
    const [error, setError] = useState<string>();
    useEffect(() => {
        setDraft(weight);
        setError(undefined);
    }, [weight]);
    return <NumberInput aria-label={`${symbol} weight`} min={1} step={1} clampBehavior="none" value={draft}
        error={error} onChange={setDraft} onBlur={() => {
            const message = weightError(blueprint, symbol, draft);
            setError(message);
            if (message === undefined) mutate(b => setSymbolWeight(b, symbol, draft as number));
        }} />;
}

export function SymbolWeightsEditor({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const weights = asSymbolWeights(blueprint.symbolWeights);
    const symbols = asStringList(blueprint.symbols);
    const [newSymbol, setNewSymbol] = useState<string | null>(null);
    const [newWeight, setNewWeight] = useState<number | string>("");
    const [symbolError, setSymbolError] = useState<string>();
    const [newWeightError, setNewWeightError] = useState<string>();
    const [outcome, setOutcome] = useState<string>();

    return (
        <PageSection legend="Symbol weights">
            <Table.ScrollContainer minWidth={320}>
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
                                    <ExistingWeight blueprint={blueprint} symbol={symbolId} weight={weight} mutate={mutate} />
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
            </Table.ScrollContainer>
            <QuickActions>
                <Select aria-label="Symbol" placeholder="Symbol" data={symbols} value={newSymbol} error={symbolError} onChange={value => {
                    setNewSymbol(value);
                    setOutcome(undefined);
                }} />
                <NumberInput aria-label="Weight" placeholder="Weight" min={1} step={1} clampBehavior="none" value={newWeight} error={newWeightError} onChange={value => {
                    setNewWeight(value);
                    setOutcome(undefined);
                }} />
                <Button
                    variant="default"
                    onClick={() => {
                        const selectionError = newSymbol === null || !symbols.includes(newSymbol) ? "Choose a symbol before adding a weight." : undefined;
                        const valueError = weightError(blueprint, newSymbol ?? "", newWeight);
                        setSymbolError(selectionError);
                        setNewWeightError(valueError);
                        setOutcome(undefined);
                        if (selectionError !== undefined || valueError !== undefined || newSymbol === null) return;
                        mutate((b) => setSymbolWeight(b, newSymbol, newWeight as number));
                        setOutcome(`${newSymbol} weight ${weights[newSymbol] === undefined ? "added to" : "updated in"} the draft.`);
                    }}
                >
                    Add weight
                </Button>
            </QuickActions>
            {outcome !== undefined && <Text role="status" size="sm">{outcome}</Text>}
        </PageSection>
    );
}
